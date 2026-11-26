import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { hashPassword, normalizeUsername, validatePassword, verifyPassword } from "../auth/password";
import { withScope, type Db } from "../db";
import { AppError, forbidden, invalid, notFound } from "../errors";
import { assertCompanyAdmin, assertFeature, isCompanyAdmin, scopeOf } from "../guards";
import { audit } from "../audit";
import { companyFeatures, companyLimits } from "../permissions";
import { parse, requiredText, uuid } from "../validation";
import { FEATURES, isFeatureKey, SELLER_DEFAULT_FEATURES, ADMIN_ONLY_FEATURES, type FeatureKey, type Role } from "@/lib/features";

export const newUserSchema = z.object({
  name: requiredText("o nome", 120),
  username: z.string({ error: "Informe o login." }),
  password: z.string({ error: "Informe a senha." }),
  role: z.enum(["platform_admin", "company_admin", "seller"], { error: "Selecione o tipo de acesso." }),
  companyId: uuid.optional().nullable(),
});
export type NewUserInput = z.input<typeof newUserSchema>;

/**
 * Regras de quem pode criar o quê:
 * - Administrador geral: qualquer perfil, em qualquer empresa.
 * - Administrador da empresa: administradores e vendedores da PRÓPRIA empresa (exige "Equipe Comercial").
 * - Vendedor: não cria usuários.
 */
function authorizeUserManagement(ctx: AuthContext, companyId: string | null | undefined, role?: Role) {
  if (ctx.user.isPlatformAdmin) return;
  assertCompanyAdmin(ctx);
  assertFeature(ctx, "sales_team");
  if (!companyId || companyId !== ctx.company?.id) throw forbidden("Você só pode gerenciar usuários da sua empresa.");
  if (role === "platform_admin") throw forbidden("Somente a Marktvision pode criar administradores gerais.");
}

async function assertUserLimit(db: Db, companyId: string, role: Role) {
  const limits = await companyLimits(db, companyId);
  const { total, sellers } = await db.one<{ total: number; sellers: number }>(
    `select count(*)::int as total, count(*) filter (where role = 'seller')::int as sellers
       from company_memberships where company_id = $1 and is_active`, [companyId]);
  if (limits.max_users != null && total >= limits.max_users)
    throw new AppError("LIMIT", `Limite de ${limits.max_users} usuários do plano atingido.`);
  if (role === "seller" && limits.max_sellers != null && sellers >= limits.max_sellers)
    throw new AppError("LIMIT", `Limite de ${limits.max_sellers} vendedores do plano atingido.`);
}

/** Cria usuário dentro de uma transação existente (usado também no cadastro rápido de empresa). */
export async function insertUser(db: Db, ctx: AuthContext, raw: NewUserInput) {
  const input = parse(newUserSchema, raw);
  const username = normalizeUsername(input.username);
  validatePassword(input.password, username);
  const companyId = input.role === "platform_admin" ? null : input.companyId ?? null;
  if (input.role !== "platform_admin" && !companyId) throw invalid("Selecione a empresa do usuário.", { companyId: "Selecione a empresa." });
  authorizeUserManagement(ctx, companyId, input.role);

  const exists = await db.maybeOne(`select 1 from users where username = $1`, [username]);
  if (exists) throw new AppError("CONFLICT", `O login "${username}" já está em uso. Escolha outro.`, { username: "Login em uso." });
  if (companyId) await assertUserLimit(db, companyId, input.role);

  // id gerado aqui: com RLS, o novo usuário só fica visível após o vínculo com a empresa
  const user = { id: randomUUID() };
  await db.exec(
    `insert into users (id, name, username, password_hash, is_platform_admin, created_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [user.id, input.name, username, await hashPassword(input.password), input.role === "platform_admin", ctx.user.id]);
  if (companyId) {
    await db.exec(`insert into company_memberships (company_id, user_id, role) values ($1, $2, $3)`,
      [companyId, user.id, input.role]);
  }
  await audit(db, ctx, "user.create", { type: "user", id: user.id, companyId }, { username, role: input.role });
  return { id: user.id, username };
}

export async function createUser(ctx: AuthContext, raw: NewUserInput) {
  return withScope(scopeOf(ctx), (db) => insertUser(db, ctx, raw));
}

export type UserRow = {
  id: string; name: string; username: string; is_platform_admin: boolean; is_active: boolean;
  last_login_at: string | null; created_at: string;
  company_id: string | null; company_name: string | null; role: Role; membership_active: boolean | null;
};

export async function listUsers(ctx: AuthContext, filter: { companyId?: string; search?: string } = {}) {
  let companyId = filter.companyId;
  if (!ctx.user.isPlatformAdmin) {
    authorizeUserManagement(ctx, ctx.company?.id);
    companyId = ctx.company!.id;
  }
  return withScope(scopeOf(ctx), (db) => db.query<UserRow>(
    `select u.id, u.name, u.username::text, u.is_platform_admin, u.is_active, u.last_login_at, u.created_at,
            m.company_id, c.name as company_name,
            case when u.is_platform_admin then 'platform_admin' else m.role end as role,
            m.is_active as membership_active
       from users u
       left join company_memberships m on m.user_id = u.id
       left join companies c on c.id = m.company_id
      where ($1::uuid is null or m.company_id = $1)
        and ($2::text is null or u.name ilike '%' || $2 || '%' or u.username ilike '%' || $2 || '%')
      order by u.is_platform_admin desc, c.name nulls first, u.name`,
    [companyId ?? null, filter.search?.trim() || null]));
}

/** Carrega o usuário garantindo que o solicitante pode gerenciá-lo. */
async function loadManagedUser(db: Db, ctx: AuthContext, userId: string) {
  parse(uuid, userId);
  const u = await db.maybeOne<{ id: string; username: string; is_platform_admin: boolean; company_id: string | null; role: Role | null }>(
    `select u.id, u.username::text, u.is_platform_admin, m.company_id, m.role
       from users u left join company_memberships m on m.user_id = u.id and ($2::uuid is null or m.company_id = $2)
      where u.id = $1 limit 1`,
    [userId, ctx.user.isPlatformAdmin ? null : ctx.company?.id ?? null]);
  if (!u) throw notFound("Usuário não encontrado.");
  if (!ctx.user.isPlatformAdmin) {
    if (u.is_platform_admin || u.company_id !== ctx.company?.id) throw notFound("Usuário não encontrado.");
    authorizeUserManagement(ctx, u.company_id);
  }
  return u;
}

export const updateUserSchema = z.object({
  name: requiredText("o nome", 120),
  username: z.string(),
  role: z.enum(["company_admin", "seller"]).optional(),
});

export async function updateUser(ctx: AuthContext, userId: string, raw: z.input<typeof updateUserSchema>) {
  const input = parse(updateUserSchema, raw);
  const username = normalizeUsername(input.username);
  return withScope(scopeOf(ctx), async (db) => {
    const u = await loadManagedUser(db, ctx, userId);
    const clash = await db.maybeOne(`select 1 from users where username = $1 and id <> $2`, [username, userId]);
    if (clash) throw new AppError("CONFLICT", `O login "${username}" já está em uso.`, { username: "Login em uso." });
    await db.exec(`update users set name = $2, username = $3 where id = $1`, [userId, input.name, username]);
    if (input.role && u.company_id && !u.is_platform_admin && input.role !== u.role) {
      if (userId === ctx.user.id) throw forbidden("Você não pode alterar o seu próprio perfil de acesso.");
      if (input.role === "seller") await assertUserLimit(db, u.company_id, "seller");
      await db.exec(`update company_memberships set role = $3 where user_id = $1 and company_id = $2`, [userId, u.company_id, input.role]);
    }
    await audit(db, ctx, "user.update", { type: "user", id: userId, companyId: u.company_id }, { username, role: input.role });
  });
}

export async function setUserActive(ctx: AuthContext, userId: string, active: boolean) {
  if (userId === ctx.user.id) throw forbidden("Você não pode desativar o seu próprio acesso.");
  return withScope(scopeOf(ctx), async (db) => {
    const u = await loadManagedUser(db, ctx, userId);
    if (ctx.user.isPlatformAdmin) {
      await db.exec(`update users set is_active = $2 where id = $1`, [userId, active]);
      if (active && u.company_id) await db.exec(`update company_memberships set is_active = true where user_id = $1`, [userId]);
    } else {
      if (active) await assertUserLimit(db, u.company_id!, u.role ?? "seller");
      await db.exec(`update company_memberships set is_active = $3 where user_id = $1 and company_id = $2`, [userId, u.company_id, active]);
    }
    if (!active) await db.exec(`delete from sessions where user_id = $1`, [userId]);
    await audit(db, ctx, active ? "user.activate" : "user.deactivate", { type: "user", id: userId, companyId: u.company_id });
  });
}

export async function resetPassword(ctx: AuthContext, userId: string, newPassword: string) {
  return withScope(scopeOf(ctx), async (db) => {
    const u = await loadManagedUser(db, ctx, userId);
    validatePassword(newPassword, u.username);
    await db.exec(`update users set password_hash = $2 where id = $1`, [userId, await hashPassword(newPassword)]);
    if (userId !== ctx.user.id) await db.exec(`delete from sessions where user_id = $1`, [userId]);
    await audit(db, ctx, "user.reset_password", { type: "user", id: userId, companyId: u.company_id });
  });
}

export async function changeOwnPassword(ctx: AuthContext, current: string, next: string) {
  return withScope(scopeOf(ctx), async (db) => {
    const u = await db.one<{ password_hash: string }>(`select password_hash from users where id = $1`, [ctx.user.id]);
    if (!(await verifyPassword(current ?? "", u.password_hash)))
      throw invalid("A senha atual está incorreta.", { current: "Senha atual incorreta." });
    validatePassword(next, ctx.user.username);
    await db.exec(`update users set password_hash = $2, must_change_password = false where id = $1`, [ctx.user.id, await hashPassword(next)]);
    await db.exec(`delete from sessions where user_id = $1 and id <> $2`, [ctx.user.id, ctx.sessionId]);
    await audit(db, ctx, "user.change_own_password", { type: "user", id: ctx.user.id });
  });
}

// ---------------------------------------------------------------------
// Permissões individuais
// ---------------------------------------------------------------------
export type UserPermission = {
  key: FeatureKey; name: string; companyHas: boolean; roleDefault: boolean;
  override: boolean | null; effective: boolean;
};

export async function getUserPermissions(ctx: AuthContext, userId: string) {
  return withScope(scopeOf(ctx), async (db) => {
    const u = await loadManagedUser(db, ctx, userId);
    if (!u.company_id || u.is_platform_admin) return { user: u, permissions: [] as UserPermission[] };
    const company = await companyFeatures(db, u.company_id);
    const overrides = await db.query<{ feature_key: string; enabled: boolean }>(
      `select feature_key, enabled from user_feature_overrides where company_id = $1 and user_id = $2`, [u.company_id, userId]);
    const role = u.role ?? "seller";
    const permissions = FEATURES.map((f) => {
      const roleDefault = role === "company_admin" ? true : SELLER_DEFAULT_FEATURES.includes(f.key);
      const o = overrides.find((x) => x.feature_key === f.key);
      const wanted = o ? o.enabled : roleDefault;
      return { key: f.key, name: f.name, companyHas: company.has(f.key), roleDefault, override: o ? o.enabled : null,
        effective: company.has(f.key) && wanted } satisfies UserPermission;
    });
    return { user: u, permissions };
  });
}

export async function setUserFeature(ctx: AuthContext, userId: string, featureKey: string, enabled: boolean) {
  if (!isFeatureKey(featureKey)) throw invalid("Funcionalidade inválida.");
  if (!isCompanyAdmin(ctx)) throw forbidden();
  return withScope(scopeOf(ctx), async (db) => {
    const u = await loadManagedUser(db, ctx, userId);
    if (!u.company_id || u.is_platform_admin) throw invalid("Administradores gerais possuem acesso total.");
    if (userId === ctx.user.id && !enabled) throw forbidden("Você não pode remover as suas próprias permissões.");
    const company = await companyFeatures(db, u.company_id);
    if (enabled && !company.has(featureKey))
      throw forbidden("Esta funcionalidade não está liberada para a empresa. Libere-a primeiro no plano da empresa.");
    const roleDefault = u.role === "company_admin" ? true : SELLER_DEFAULT_FEATURES.includes(featureKey) && !ADMIN_ONLY_FEATURES.includes(featureKey);
    if (enabled === roleDefault) {
      await db.exec(`delete from user_feature_overrides where company_id = $1 and user_id = $2 and feature_key = $3`, [u.company_id, userId, featureKey]);
    } else {
      await db.exec(
        `insert into user_feature_overrides (company_id, user_id, feature_key, enabled) values ($1, $2, $3, $4)
         on conflict (company_id, user_id, feature_key) do update set enabled = excluded.enabled, updated_at = now()`,
        [u.company_id, userId, featureKey, enabled]);
    }
    await audit(db, ctx, "user.permission", { type: "user", id: userId, companyId: u.company_id }, { feature: featureKey, enabled });
  });
}

export async function getUserDetail(ctx: AuthContext, userId: string) {
  const { user, permissions } = await getUserPermissions(ctx, userId);
  const info = await withScope(scopeOf(ctx), (db) => db.one<{
    name: string; is_active: boolean; last_login_at: string | null; created_at: string; company_name: string | null; membership_active: boolean | null;
  }>(`select u.name, u.is_active, u.last_login_at, u.created_at, c.name as company_name, m.is_active as membership_active
        from users u left join company_memberships m on m.user_id = u.id and m.company_id = $2
        left join companies c on c.id = m.company_id where u.id = $1`, [userId, user.company_id]));
  return { ...user, ...info, role: (user.is_platform_admin ? "platform_admin" : user.role ?? "seller") as Role, permissions };
}
