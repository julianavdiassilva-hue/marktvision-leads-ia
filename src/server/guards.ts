import type { AuthContext } from "./auth/core";
import type { Scope } from "./db";
import { AppError, forbidden } from "./errors";
import type { FeatureKey } from "@/lib/features";
import { featureName } from "@/lib/features";

/** Escopo de banco derivado EXCLUSIVAMENTE da sessão validada no servidor. */
export const scopeOf = (ctx: AuthContext): Scope => ({
  userId: ctx.user.id,
  companyId: ctx.company?.id ?? null,
  platformAdmin: ctx.user.isPlatformAdmin,
});

export function assertPlatformAdmin(ctx: AuthContext) {
  if (!ctx.user.isPlatformAdmin) throw forbidden("Área exclusiva do administrador geral Marktvision.");
}

export function assertCompany(ctx: AuthContext): string {
  if (!ctx.company) throw new AppError("FORBIDDEN", "Selecione uma empresa para continuar.");
  return ctx.company.id;
}

export function hasFeature(ctx: AuthContext, key: FeatureKey) {
  return ctx.features.includes(key);
}

export function assertFeature(ctx: AuthContext, key: FeatureKey) {
  if (!hasFeature(ctx, key))
    throw forbidden(`A funcionalidade "${featureName(key)}" não está liberada para o seu acesso.`);
}

export const isCompanyAdmin = (ctx: AuthContext) => ctx.role === "company_admin" || ctx.role === "platform_admin";

export function assertCompanyAdmin(ctx: AuthContext) {
  if (!isCompanyAdmin(ctx)) throw forbidden("Ação permitida apenas ao administrador da empresa.");
}
