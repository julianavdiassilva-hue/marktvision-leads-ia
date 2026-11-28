import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveSession, SESSION_COOKIE, SESSION_DAYS, type AuthContext } from "./core";
import { hasFeature, isCompanyAdmin } from "../guards";
import type { FeatureKey } from "@/lib/features";

/** Sessão da requisição atual (deduplicada por renderização). */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
});

export async function setSessionCookie(token: string) {
  // HTTPS (túnel Cloudflare/hospedagem) → cookie só trafega cifrado; HTTP da rede local continua funcionando.
  const https = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.COOKIE_SECURE === "true" || https,
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}
export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
export async function readSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
export async function requestMeta() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined, userAgent: h.get("user-agent") ?? undefined };
}

// ----- Guardas de página (redirecionam; ações usam as guardas de ../guards) -----
export async function requirePage(): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) {
    const slug = (await cookies()).get("mv_empresa")?.value;
    redirect(slug && /^[a-z0-9-]{2,60}$/.test(slug) ? `/entrar/${slug}?expirada=1` : "/login?expirada=1");
  }
  return ctx;
}
export async function requirePlatformPage() {
  const ctx = await requirePage();
  if (!ctx.user.isPlatformAdmin) redirect("/acesso-negado");
  return ctx;
}
/** Página de módulo da empresa: exige empresa ativa e a funcionalidade liberada. */
export async function requireModulePage(anyOf: FeatureKey[], opts: { adminOnly?: boolean } = {}) {
  const ctx = await requirePage();
  if (!ctx.company) redirect(ctx.user.isPlatformAdmin ? "/admin/empresas?selecione=1" : "/login");
  if (anyOf.length && !anyOf.some((f) => hasFeature(ctx, f))) redirect("/acesso-negado");
  if (opts.adminOnly && !isCompanyAdmin(ctx)) redirect("/acesso-negado");
  return ctx;
}

/** Converte erros de domínio em navegação adequada dentro de páginas. */
export function pageError(e: unknown): never {
  const code = (e as { code?: string })?.code;
  if (code === "NOT_FOUND" || code === "VALIDATION") notFound();
  if (code === "FORBIDDEN") redirect("/acesso-negado");
  throw e;
}
