import { createHash, randomBytes } from "node:crypto";
import { withScope, SYSTEM } from "../db";
import { AppError } from "../errors";
import { userFeatures } from "../permissions";
import { dummyVerify, verifyPassword } from "./password";
import { FEATURE_KEYS, type FeatureKey, type Role } from "@/lib/features";

export const SESSION_COOKIE = "mv_session";
export const SESSION_DAYS = 30;
const MAX_FAILURES = 8;
const FAILURE_WINDOW_MIN = 15;

export type Membership = { companyId: string; companyName: string; role: Exclude<Role, "platform_admin">; companyActive: boolean };

export type AuthContext = {
  sessionId: string;
  user: { id: string; name: string; username: string; isPlatformAdmin: boolean; mustChangePassword: boolean };
  company: { id: string; name: string } | null;
  role: Role;
  features: FeatureKey[];
  memberships: Membership[];
};

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Autentica por login + senha. Retorna o token de sessão (texto puro só aqui). */
export async function login(usernameRaw: string, password: string, meta: { ip?: string; userAgent?: string } = {}) {
  const username = (usernameRaw ?? "").trim().toLowerCase();
  if (!username || !password) throw new AppError("VALIDATION", "Informe login e senha.");

  // A transação SEMPRE confirma (commit) para que tentativas falhas fiquem registradas;
  // o erro é lançado somente depois, fora dela.
  const outcome = await withScope(SYSTEM, async (db) => {
    const { failures } = await db.one<{ failures: number }>(
      `select count(*)::int as failures from login_attempts
        where username = $1 and success = false and created_at > now() - ($2 || ' minutes')::interval`,
      [username, FAILURE_WINDOW_MIN],
    );
    if (failures >= MAX_FAILURES) return { error: "rate" as const };

    const user = await db.maybeOne<{ id: string; password_hash: string; is_active: boolean; is_platform_admin: boolean }>(
      `select id, password_hash, is_active, is_platform_admin from users where username = $1`, [username]);

    const ok = user ? await verifyPassword(password, user.password_hash) : await dummyVerify(password);
    await db.exec(`insert into login_attempts (username, ip, success) values ($1, $2, $3)`, [username, meta.ip ?? null, ok]);
    if (!user || !ok) return { error: "credentials" as const };
    if (!user.is_active) return { error: "inactive" as const };

    let companyId: string | null = null;
    if (!user.is_platform_admin) {
      const m = await db.maybeOne<{ company_id: string }>(
        `select m.company_id from company_memberships m join companies c on c.id = m.company_id
          where m.user_id = $1 and m.is_active and c.is_active order by m.created_at limit 1`, [user.id]);
      if (!m) return { error: "company_inactive" as const };
      companyId = m.company_id;
    }

    const token = randomBytes(32).toString("base64url");
    await db.exec(
      `insert into sessions (token_hash, user_id, active_company_id, ip, user_agent, expires_at)
       values ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval)`,
      [hashToken(token), user.id, companyId, meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null, SESSION_DAYS],
    );
    await db.exec(`update users set last_login_at = now() where id = $1`, [user.id]);
    await db.exec(
      `insert into audit_logs (company_id, user_id, action, ip) values ($1, $2, 'auth.login', $3)`,
      [companyId, user.id, meta.ip ?? null]);
    return { token, userId: user.id };
  });

  if ("error" in outcome) {
    switch (outcome.error) {
      case "rate": throw new AppError("RATE_LIMIT", `Muitas tentativas sem sucesso. Aguarde ${FAILURE_WINDOW_MIN} minutos e tente novamente.`);
      case "credentials": throw new AppError("UNAUTHENTICATED", "Login ou senha incorretos.");
      case "inactive": throw new AppError("FORBIDDEN", "Seu acesso está desativado. Fale com o administrador.");
      case "company_inactive": throw new AppError("FORBIDDEN", "Seu acesso ou sua empresa estão desativados. Fale com o administrador.");
    }
  }
  return outcome;
}

/** Valida o token e monta o contexto de autorização a partir do banco (nunca do cliente). */
export async function resolveSession(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token || token.length > 200) return null;
  return withScope(SYSTEM, async (db) => {
    const s = await db.maybeOne<{
      id: string; user_id: string; active_company_id: string | null; last_seen_at: Date;
      name: string; username: string; is_platform_admin: boolean; is_active: boolean; must_change_password: boolean;
    }>(
      `select s.id, s.user_id, s.active_company_id, s.last_seen_at,
              u.name, u.username, u.is_platform_admin, u.is_active, u.must_change_password
         from sessions s join users u on u.id = s.user_id
        where s.token_hash = $1 and s.expires_at > now()`, [hashToken(token)]);
    if (!s || !s.is_active) return null;

    const memberships = (await db.query<{ company_id: string; name: string; role: Membership["role"]; is_active: boolean }>(
      `select m.company_id, c.name, m.role, c.is_active from company_memberships m
         join companies c on c.id = m.company_id
        where m.user_id = $1 and m.is_active order by c.name`, [s.user_id]))
      .map((m) => ({ companyId: m.company_id, companyName: m.name, role: m.role, companyActive: m.is_active }));

    let company: AuthContext["company"] = null;
    let role: Role;
    let features: FeatureKey[];

    if (s.is_platform_admin) {
      role = "platform_admin";
      if (s.active_company_id) {
        const c = await db.maybeOne<{ id: string; name: string }>(`select id, name from companies where id = $1`, [s.active_company_id]);
        company = c;
      }
      features = company ? [...(await userFeatures(db, company.id, s.user_id, "platform_admin"))] : [...FEATURE_KEYS];
    } else {
      const m = memberships.find((x) => x.companyId === s.active_company_id && x.companyActive);
      if (!m) return null; // vínculo removido ou empresa desativada => sessão inválida
      company = { id: m.companyId, name: m.companyName };
      role = m.role;
      features = [...(await userFeatures(db, m.companyId, s.user_id, m.role))];
    }

    if (Date.now() - new Date(s.last_seen_at).getTime() > 5 * 60_000) {
      await db.exec(`update sessions set last_seen_at = now(), expires_at = now() + ($2 || ' days')::interval where id = $1`, [s.id, SESSION_DAYS]);
    }

    return {
      sessionId: s.id,
      user: { id: s.user_id, name: s.name, username: s.username, isPlatformAdmin: s.is_platform_admin, mustChangePassword: s.must_change_password },
      company, role, features, memberships,
    };
  });
}

export async function logout(token: string | undefined | null) {
  if (!token) return;
  await withScope(SYSTEM, (db) => db.exec(`delete from sessions where token_hash = $1`, [hashToken(token)]));
}

/** Troca a empresa ativa da sessão (administrador geral ou usuário com vários vínculos). */
export async function switchCompany(ctx: AuthContext, companyId: string | null) {
  await withScope(SYSTEM, async (db) => {
    if (companyId) {
      if (!ctx.user.isPlatformAdmin) {
        const ok = ctx.memberships.some((m) => m.companyId === companyId && m.companyActive);
        if (!ok) throw new AppError("FORBIDDEN", "Você não tem acesso a esta empresa.");
      } else {
        const c = await db.maybeOne(`select 1 from companies where id = $1`, [companyId]);
        if (!c) throw new AppError("NOT_FOUND", "Empresa não encontrada.");
      }
    } else if (!ctx.user.isPlatformAdmin) {
      throw new AppError("FORBIDDEN", "Selecione uma empresa.");
    }
    await db.exec(`update sessions set active_company_id = $2 where id = $1`, [ctx.sessionId, companyId]);
  });
}
