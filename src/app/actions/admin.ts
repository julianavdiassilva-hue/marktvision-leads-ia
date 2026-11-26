"use server";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import {
  createCompany, resetCompanyFeatures, setCompanyActive, setCompanyFeature, setCompanyLimits,
  updateCompany, updateOwnCompanyProfile,
} from "@/server/services/companies";
import { createPlan, deletePlan, setPlanFeature, updatePlan } from "@/server/services/plans";
import { invalid } from "@/server/errors";
import type { NewUserInput } from "@/server/services/users";

/** Lê as linhas opcionais de acesso do formulário: users[0][name], users[0][username]... */
function readUserRows(fd: FormData) {
  const rows: Record<number, Record<string, string>> = {};
  for (const [k, v] of fd.entries()) {
    const m = /^users\[(\d+)\]\[(\w+)\]$/.exec(k);
    if (m) (rows[+m[1]] ??= {})[m[2]] = String(v);
  }
  return Object.values(rows)
    .filter((r) => (r.name ?? "").trim() || (r.username ?? "").trim() || (r.password ?? "").trim())
    .map((r) => ({ name: r.name ?? "", username: r.username ?? "", password: r.password ?? "", role: (r.role || "seller") as NewUserInput["role"] }));
}

export async function createCompanyAction(_: ActionResult | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const data = formToObject(fd);
    const users = readUserRows(fd);
    const r = await createCompany(ctx, { ...data, planId: data.planId || undefined, users } as never);
    const extra = r.users.length ? ` e ${r.users.length} acesso(s) criado(s)` : "";
    return { message: `Empresa "${data.name}" cadastrada${extra}.`, data: { id: r.id } };
  });
}

export async function updateCompanyAction(companyId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => {
    const data = formToObject(fd);
    await updateCompany(ctx, companyId, { ...data, planId: data.planId || null } as never);
    return { message: "Dados da empresa salvos." };
  });
}

export async function updateOwnCompanyAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await updateOwnCompanyProfile(ctx, formToObject(fd) as never);
    return { message: "Dados da empresa salvos." };
  });
}

export async function setCompanyActiveAction(companyId: string, active: boolean) {
  return runAction(async (ctx) => { await setCompanyActive(ctx, companyId, active); });
}
export async function setCompanyFeatureAction(companyId: string, key: string, enabled: boolean) {
  return runAction(async (ctx) => { await setCompanyFeature(ctx, companyId, key, enabled); });
}
export async function resetCompanyFeaturesAction(companyId: string) {
  return runAction(async (ctx) => { await resetCompanyFeatures(ctx, companyId); });
}
export async function setCompanyLimitsAction(companyId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await setCompanyLimits(ctx, companyId, formToObject(fd));
    return { message: "Limites salvos." };
  });
}

export async function createPlanAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => {
    const data = formToObject(fd);
    await createPlan(ctx, { name: data.name, description: data.description, features: fd.getAll("features").map(String), limits: data });
    return { message: `Plano "${data.name}" criado.` };
  });
}
export async function updatePlanAction(planId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => {
    const data = formToObject(fd);
    await updatePlan(ctx, planId, { name: data.name, description: data.description, limits: data, isActive: data.isActive === "on" });
    return { message: "Plano salvo." };
  });
}
export async function setPlanFeatureAction(planId: string, key: string, enabled: boolean) {
  return runAction(async (ctx) => { await setPlanFeature(ctx, planId, key, enabled); });
}
export async function deletePlanAction(planId: string) {
  return runAction(async (ctx) => {
    if (!planId) throw invalid("Plano inválido.");
    await deletePlan(ctx, planId);
  });
}
