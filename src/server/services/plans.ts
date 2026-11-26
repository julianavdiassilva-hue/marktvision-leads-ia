import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { AppError, invalid, notFound } from "../errors";
import { assertPlatformAdmin, scopeOf } from "../guards";
import { audit } from "../audit";
import { optionalText, parse, requiredText, uuid } from "../validation";
import { parseLimits } from "./companies";
import { isFeatureKey, type Limits } from "@/lib/features";

export type PlanRow = {
  id: string; name: string; description: string | null; is_active: boolean; limits: Limits;
  features: string[]; companies: number;
};

export async function listPlans(ctx: AuthContext) {
  assertPlatformAdmin(ctx);
  return withScope(scopeOf(ctx), (db) => db.query<PlanRow>(
    `select p.id, p.name, p.description, p.is_active, p.limits,
            coalesce(array_agg(pf.feature_key order by pf.feature_key) filter (where pf.feature_key is not null), '{}') as features,
            (select count(*)::int from companies c where c.plan_id = p.id) as companies
       from plans p left join plan_features pf on pf.plan_id = p.id
      group by p.id order by p.created_at`));
}

const planSchema = z.object({ name: requiredText("o nome do plano", 80), description: optionalText(300) });

export async function createPlan(ctx: AuthContext, raw: { name: string; description?: string; features?: string[]; limits?: Record<string, unknown> }) {
  assertPlatformAdmin(ctx);
  const input = parse(planSchema, raw);
  const limits = parseLimits(raw.limits ?? {});
  return withScope(scopeOf(ctx), async (db) => {
    const id = randomUUID();
    await db.exec(`insert into plans (id, name, description, limits) values ($1,$2,$3,$4)`, [id, input.name, input.description ?? null, limits]);
    for (const f of raw.features ?? []) {
      if (!isFeatureKey(f)) throw invalid("Funcionalidade inválida.");
      await db.exec(`insert into plan_features (plan_id, feature_key) values ($1,$2)`, [id, f]);
    }
    await audit(db, ctx, "plan.create", { type: "plan", id }, { name: input.name });
    return { id };
  });
}

export async function updatePlan(ctx: AuthContext, planId: string, raw: { name: string; description?: string; limits?: Record<string, unknown>; isActive?: boolean }) {
  assertPlatformAdmin(ctx);
  parse(uuid, planId);
  const input = parse(planSchema, raw);
  const limits = parseLimits(raw.limits ?? {});
  return withScope(scopeOf(ctx), async (db) => {
    const n = await db.exec(`update plans set name=$2, description=$3, limits=$4, is_active=coalesce($5, is_active) where id=$1`,
      [planId, input.name, input.description ?? null, limits, raw.isActive ?? null]);
    if (!n) throw notFound("Plano não encontrado.");
    await audit(db, ctx, "plan.update", { type: "plan", id: planId });
  });
}

export async function setPlanFeature(ctx: AuthContext, planId: string, featureKey: string, enabled: boolean) {
  assertPlatformAdmin(ctx);
  parse(uuid, planId);
  if (!isFeatureKey(featureKey)) throw invalid("Funcionalidade inválida.");
  return withScope(scopeOf(ctx), async (db) => {
    if (!(await db.maybeOne(`select 1 from plans where id = $1`, [planId]))) throw notFound("Plano não encontrado.");
    if (enabled) await db.exec(`insert into plan_features (plan_id, feature_key) values ($1,$2) on conflict do nothing`, [planId, featureKey]);
    else await db.exec(`delete from plan_features where plan_id = $1 and feature_key = $2`, [planId, featureKey]);
    await audit(db, ctx, "plan.feature", { type: "plan", id: planId }, { feature: featureKey, enabled });
  });
}

export async function deletePlan(ctx: AuthContext, planId: string) {
  assertPlatformAdmin(ctx);
  parse(uuid, planId);
  return withScope(scopeOf(ctx), async (db) => {
    const { n } = await db.one<{ n: number }>(`select count(*)::int as n from companies where plan_id = $1`, [planId]);
    if (n > 0) throw new AppError("CONFLICT", `Este plano está em uso por ${n} empresa(s). Altere o plano delas antes de excluir.`);
    const d = await db.exec(`delete from plans where id = $1`, [planId]);
    if (!d) throw notFound("Plano não encontrado.");
    await audit(db, ctx, "plan.delete", { type: "plan", id: planId });
  });
}

export async function planOptions(ctx: AuthContext) {
  assertPlatformAdmin(ctx);
  return withScope(scopeOf(ctx), (db) =>
    db.query<{ id: string; name: string }>(`select id, name from plans where is_active order by (name = 'Completo') desc, name`));
}
