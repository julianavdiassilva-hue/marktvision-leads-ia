import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { AppError, invalid, notFound } from "../errors";
import { assertPlatformAdmin, scopeOf } from "../guards";
import { audit } from "../audit";
import { companyFeatures, companyLimits } from "../permissions";
import { optionalText, parse, requiredText, uuid } from "../validation";
import { insertUser, type NewUserInput } from "./users";
import { FEATURES, isFeatureKey, LIMIT_FIELDS, type Limits } from "@/lib/features";

const companySchema = z.object({
  name: requiredText("o nome da empresa", 160),
  legalName: optionalText(200),
  document: optionalText(30),
  phone: optionalText(40),
  email: optionalText(160),
  segment: optionalText(120),
  address: optionalText(300),
  notes: optionalText(2000),
  planId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional().nullable()),
});
export type CompanyInput = z.input<typeof companySchema>;

/**
 * Cadastro rápido: somente o nome é obrigatório. Opcionalmente cria, na mesma
 * transação, os acessos (administradores e vendedores) da empresa.
 * Se qualquer usuário for inválido, nada é gravado (sem cadastros pela metade).
 */
export async function createCompany(ctx: AuthContext, raw: CompanyInput & { users?: Omit<NewUserInput, "companyId">[] }) {
  assertPlatformAdmin(ctx);
  const input = parse(companySchema, raw);
  return withScope(scopeOf(ctx), async (db) => {
    let planId = input.planId ?? null;
    if (raw.planId === undefined) {
      const def = await db.maybeOne<{ id: string }>(`select id from plans where is_active order by (name = 'Completo') desc, created_at limit 1`);
      planId = def?.id ?? null;
    }
    const id = randomUUID();
    await db.exec(
      `insert into companies (id, name, legal_name, document, phone, email, segment, address, notes, plan_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, input.name, input.legalName ?? null, input.document ?? null, input.phone ?? null, input.email ?? null,
       input.segment ?? null, input.address ?? null, input.notes ?? null, planId, ctx.user.id]);
    await audit(db, ctx, "company.create", { type: "company", id, companyId: id }, { name: input.name });

    const created: { id: string; username: string }[] = [];
    for (const [i, u] of (raw.users ?? []).entries()) {
      try {
        created.push(await insertUser(db, ctx, { ...u, companyId: id }));
      } catch (e) {
        if (e instanceof AppError) throw new AppError(e.code, `Acesso ${i + 1}: ${e.message}`, e.fieldErrors);
        throw e;
      }
    }
    return { id, users: created };
  });
}

export async function updateCompany(ctx: AuthContext, companyId: string, raw: CompanyInput) {
  assertPlatformAdmin(ctx);
  parse(uuid, companyId);
  const input = parse(companySchema, raw);
  return withScope(scopeOf(ctx), async (db) => {
    const n = await db.exec(
      `update companies set name=$2, legal_name=$3, document=$4, phone=$5, email=$6, segment=$7, address=$8, notes=$9, plan_id=$10
        where id = $1`,
      [companyId, input.name, input.legalName ?? null, input.document ?? null, input.phone ?? null, input.email ?? null,
       input.segment ?? null, input.address ?? null, input.notes ?? null, input.planId ?? null]);
    if (!n) throw notFound("Empresa não encontrada.");
    await audit(db, ctx, "company.update", { type: "company", id: companyId, companyId });
  });
}

/** Dados cadastrais editáveis pelo próprio administrador da empresa (sem plano/limites). */
export async function updateOwnCompanyProfile(ctx: AuthContext, raw: Omit<CompanyInput, "planId">) {
  if (!ctx.company) throw new AppError("FORBIDDEN", "Selecione uma empresa.");
  if (ctx.role === "seller") throw new AppError("FORBIDDEN", "Ação permitida apenas ao administrador da empresa.");
  const input = parse(companySchema.omit({ planId: true }), raw);
  return withScope({ ...scopeOf(ctx), system: true }, async (db) => {
    // system=on apenas para a escrita na própria linha (companies só é gravável pelo bypass); o id vem da sessão.
    await db.exec(
      `update companies set name=$2, legal_name=$3, document=$4, phone=$5, email=$6, segment=$7, address=$8 where id=$1`,
      [ctx.company!.id, input.name, input.legalName ?? null, input.document ?? null, input.phone ?? null,
       input.email ?? null, input.segment ?? null, input.address ?? null]);
    await audit(db, ctx, "company.update_profile", { type: "company", id: ctx.company!.id });
  });
}

export async function setCompanyActive(ctx: AuthContext, companyId: string, active: boolean) {
  assertPlatformAdmin(ctx);
  parse(uuid, companyId);
  return withScope(scopeOf(ctx), async (db) => {
    const n = await db.exec(`update companies set is_active = $2 where id = $1`, [companyId, active]);
    if (!n) throw notFound("Empresa não encontrada.");
    if (!active) {
      // encerra imediatamente as sessões dos usuários da empresa
      await db.exec(`delete from sessions where active_company_id = $1
                       and user_id in (select id from users where not is_platform_admin)`, [companyId]);
    }
    await audit(db, ctx, active ? "company.activate" : "company.deactivate", { type: "company", id: companyId, companyId });
  });
}

export type CompanyRow = {
  id: string; name: string; segment: string | null; is_active: boolean; created_at: string;
  plan_name: string | null; users: number; sellers: number; contacts: number; campaigns: number;
};

export async function listCompanies(ctx: AuthContext, search?: string) {
  assertPlatformAdmin(ctx);
  return withScope(scopeOf(ctx), (db) => db.query<CompanyRow>(
    `select c.id, c.name, c.segment, c.is_active, c.created_at, p.name as plan_name,
            (select count(*)::int from company_memberships m where m.company_id = c.id and m.is_active) as users,
            (select count(*)::int from company_memberships m where m.company_id = c.id and m.is_active and m.role = 'seller') as sellers,
            (select count(*)::int from contacts x where x.company_id = c.id) as contacts,
            (select count(*)::int from campaigns x where x.company_id = c.id) as campaigns
       from companies c left join plans p on p.id = c.plan_id
      where ($1::text is null or c.name ilike '%' || $1 || '%')
      order by c.created_at desc`, [search?.trim() || null]));
}

export async function getCompany(ctx: AuthContext, companyId: string) {
  assertPlatformAdmin(ctx);
  parse(uuid, companyId);
  return withScope(scopeOf(ctx), async (db) => {
    const company = await db.maybeOne<{
      id: string; name: string; legal_name: string | null; document: string | null; phone: string | null;
      email: string | null; segment: string | null; address: string | null; notes: string | null;
      plan_id: string | null; plan_name: string | null; is_active: boolean; created_at: string; limits_override: Limits;
    }>(`select c.*, p.name as plan_name from companies c left join plans p on p.id = c.plan_id where c.id = $1`, [companyId]);
    if (!company) throw notFound("Empresa não encontrada.");
    const planFeatures = new Set((await db.query<{ feature_key: string }>(
      `select feature_key from plan_features where plan_id = $1`, [company.plan_id])).map((r) => r.feature_key));
    const overrides = await db.query<{ feature_key: string; enabled: boolean }>(
      `select feature_key, enabled from company_features where company_id = $1`, [companyId]);
    const effective = await companyFeatures(db, companyId);
    const features = FEATURES.map((f) => ({
      key: f.key, name: f.name, inPlan: planFeatures.has(f.key),
      override: overrides.find((o) => o.feature_key === f.key)?.enabled ?? null,
      enabled: effective.has(f.key),
    }));
    const limits = await companyLimits(db, companyId);
    const usage = await db.one<Record<string, number>>(
      `select (select count(*)::int from company_memberships where company_id = $1 and is_active) as max_users,
              (select count(*)::int from company_memberships where company_id = $1 and is_active and role='seller') as max_sellers,
              (select count(*)::int from contacts where company_id = $1) as max_contacts,
              (select count(*)::int from whatsapp_connections where company_id = $1) as max_whatsapp_connections,
              (select coalesce(sum(value),0)::int from usage_counters where company_id = $1 and metric='messages_sent' and period = date_trunc('month', now())::date) as max_messages_month,
              (select coalesce(sum(value),0)::int from usage_counters where company_id = $1 and metric='google_searches' and period = date_trunc('month', now())::date) as max_google_searches_month`,
      [companyId]);
    return { company, features, limits, usage };
  });
}

/** Liga/desliga uma funcionalidade na empresa. Se igualar ao plano, remove a exceção. */
export async function setCompanyFeature(ctx: AuthContext, companyId: string, featureKey: string, enabled: boolean) {
  assertPlatformAdmin(ctx);
  parse(uuid, companyId);
  if (!isFeatureKey(featureKey)) throw invalid("Funcionalidade inválida.");
  return withScope(scopeOf(ctx), async (db) => {
    const c = await db.maybeOne<{ plan_id: string | null }>(`select plan_id from companies where id = $1`, [companyId]);
    if (!c) throw notFound("Empresa não encontrada.");
    const inPlan = !!(await db.maybeOne(`select 1 from plan_features where plan_id = $1 and feature_key = $2`, [c.plan_id, featureKey]));
    if (inPlan === enabled) {
      await db.exec(`delete from company_features where company_id = $1 and feature_key = $2`, [companyId, featureKey]);
    } else {
      await db.exec(
        `insert into company_features (company_id, feature_key, enabled) values ($1,$2,$3)
         on conflict (company_id, feature_key) do update set enabled = excluded.enabled, updated_at = now()`,
        [companyId, featureKey, enabled]);
    }
    await audit(db, ctx, "company.feature", { type: "company", id: companyId, companyId }, { feature: featureKey, enabled });
  });
}

export async function resetCompanyFeatures(ctx: AuthContext, companyId: string) {
  assertPlatformAdmin(ctx);
  parse(uuid, companyId);
  return withScope(scopeOf(ctx), async (db) => {
    await db.exec(`delete from company_features where company_id = $1`, [companyId]);
    await audit(db, ctx, "company.features_reset", { type: "company", id: companyId, companyId });
  });
}

export async function setCompanyLimits(ctx: AuthContext, companyId: string, raw: Record<string, unknown>) {
  assertPlatformAdmin(ctx);
  parse(uuid, companyId);
  const limits = parseLimits(raw);
  return withScope(scopeOf(ctx), async (db) => {
    const n = await db.exec(`update companies set limits_override = $2 where id = $1`, [companyId, limits]);
    if (!n) throw notFound("Empresa não encontrada.");
    await audit(db, ctx, "company.limits", { type: "company", id: companyId, companyId }, limits);
  });
}

/** Campos vazios = sem exceção (usa o plano). Números inteiros >= 0. */
export function parseLimits(raw: Record<string, unknown>): Limits {
  const out: Limits = {};
  for (const f of LIMIT_FIELDS) {
    const v = raw[f.key];
    if (v === undefined || v === null || String(v).trim() === "") continue;
    const n = Number(String(v).replace(/\./g, ""));
    if (!Number.isInteger(n) || n < 0) throw invalid(`Limite inválido em "${f.label}".`, { [f.key]: "Use um número inteiro." });
    out[f.key] = n;
  }
  return out;
}

export async function listCompanyOptions(ctx: AuthContext) {
  assertPlatformAdmin(ctx);
  return withScope(scopeOf(ctx), (db) =>
    db.query<{ id: string; name: string; is_active: boolean }>(`select id, name, is_active from companies order by name`));
}

export async function getOwnCompanyProfile(ctx: AuthContext) {
  if (!ctx.company) return null;
  return withScope(scopeOf(ctx), (db) => db.maybeOne<Record<string, string | null>>(
    `select name, legal_name, document, phone, email, segment, address from companies where id = $1`, [ctx.company!.id]));
}
