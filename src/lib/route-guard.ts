import { MAIN_NAV } from "./navigation";
import type { FeatureKey } from "./features";

export type RouteRule = { prefix: string; anyOf: FeatureKey[]; adminOnly?: boolean; platformOnly?: boolean; needsCompany?: boolean };

/** Regras de acesso por rota, derivadas do menu (fonte única). Avaliadas no layout, antes de qualquer renderização. */
export const ROUTE_RULES: RouteRule[] = [
  { prefix: "/admin", anyOf: [], platformOnly: true },
  ...MAIN_NAV.filter((i) => i.href !== "/configuracoes").map((i) => ({ prefix: i.href, anyOf: i.anyOf, adminOnly: i.adminOnly, needsCompany: true })),
];

export function ruleFor(pathname: string) {
  return ROUTE_RULES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
}
