import type { Db } from "./db";
import {
  ADMIN_ONLY_FEATURES, FEATURE_KEYS, SELLER_DEFAULT_FEATURES,
  type FeatureKey, type Limits, type Role,
} from "@/lib/features";

/** Funcionalidades liberadas para a empresa = plano + liberações − bloqueios individuais. */
export async function companyFeatures(db: Db, companyId: string): Promise<Set<FeatureKey>> {
  const rows = await db.query<{ key: FeatureKey }>(
    `select f.key from features f
      where (
        exists (select 1 from companies c join plan_features pf on pf.plan_id = c.plan_id
                 where c.id = $1 and pf.feature_key = f.key)
        and not exists (select 1 from company_features cf
                         where cf.company_id = $1 and cf.feature_key = f.key and cf.enabled = false)
      ) or exists (select 1 from company_features cf
                    where cf.company_id = $1 and cf.feature_key = f.key and cf.enabled = true)`,
    [companyId],
  );
  return new Set(rows.map((r) => r.key));
}

/**
 * Funcionalidades efetivas de um usuário dentro da empresa.
 * - Administrador geral / administrador da empresa: tudo o que a empresa possui.
 * - Vendedor: padrão de vendedor ∩ empresa, ajustado por permissões individuais.
 * Permissão individual NUNCA ultrapassa o que a empresa contratou.
 */
export function resolveUserFeatures(
  company: Set<FeatureKey>,
  role: Role,
  overrides: { feature_key: string; enabled: boolean }[],
): Set<FeatureKey> {
  const base = new Set<FeatureKey>(
    role === "seller" ? SELLER_DEFAULT_FEATURES : FEATURE_KEYS,
  );
  for (const o of overrides) {
    const k = o.feature_key as FeatureKey;
    if (o.enabled) base.add(k);
    else base.delete(k);
  }
  const result = new Set<FeatureKey>();
  for (const k of base) {
    if (!company.has(k)) continue;
    if (role === "seller" && ADMIN_ONLY_FEATURES.includes(k) && !overrides.some((o) => o.feature_key === k && o.enabled)) continue;
    result.add(k);
  }
  return result;
}

export async function userFeatures(db: Db, companyId: string, userId: string, role: Role) {
  const company = await companyFeatures(db, companyId);
  if (role !== "seller") {
    const overrides = role === "company_admin"
      ? await db.query<{ feature_key: string; enabled: boolean }>(
          `select feature_key, enabled from user_feature_overrides where company_id = $1 and user_id = $2 and enabled = false`,
          [companyId, userId])
      : [];
    return resolveUserFeatures(company, role, overrides);
  }
  const overrides = await db.query<{ feature_key: string; enabled: boolean }>(
    `select feature_key, enabled from user_feature_overrides where company_id = $1 and user_id = $2`,
    [companyId, userId],
  );
  return resolveUserFeatures(company, role, overrides);
}

/** Limites efetivos: plano sobrescrito pelos limites individuais da empresa. */
export async function companyLimits(db: Db, companyId: string): Promise<Limits> {
  const row = await db.maybeOne<{ plan_limits: Limits | null; override: Limits }>(
    `select p.limits as plan_limits, c.limits_override as override
       from companies c left join plans p on p.id = c.plan_id where c.id = $1`,
    [companyId],
  );
  if (!row) return {};
  return { ...(row.plan_limits ?? {}), ...stripNulls(row.override ?? {}) };
}

function stripNulls(l: Limits): Limits {
  return Object.fromEntries(Object.entries(l).filter(([, v]) => v !== null && v !== undefined)) as Limits;
}
