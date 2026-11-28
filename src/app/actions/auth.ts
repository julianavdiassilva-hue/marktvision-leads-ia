"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { login, logout, resolveSession, switchCompany } from "@/server/auth/core";
import { companySlugFor } from "@/server/services/branding";
import { clearSessionCookie, readSessionToken, requestMeta, setSessionCookie } from "@/server/auth/next";
import { invalid, toAppError } from "@/server/errors";
import { runAction, type ActionResult } from "@/server/action";
import { changeOwnPassword } from "@/server/services/users";

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let target = "/";
  try {
    const { token } = await login(String(fd.get("username") ?? ""), String(fd.get("password") ?? ""), await requestMeta());
    await setSessionCookie(token);
    await rememberCompany(token);
    const next = String(fd.get("next") ?? "");
    if (next.startsWith("/") && !next.startsWith("//")) target = next;
  } catch (e) {
    return { ok: false, error: toAppError(e).message };
  }
  redirect(target);
}

/** Endereço de login da empresa: o usuário volta à tela com a identidade visual dela ao sair ou quando a sessão expira. */
const COMPANY_COOKIE = "mv_empresa";
async function rememberCompany(token: string) {
  const store = await cookies();
  const ctx = await resolveSession(token).catch(() => null);
  const slug = ctx ? await companySlugFor(ctx).catch(() => null) : null;
  if (slug) store.set(COMPANY_COOKIE, slug, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 180 * 24 * 3600 });
  else store.delete(COMPANY_COOKIE);
}

export async function logoutAction() {
  await logout(await readSessionToken());
  await clearSessionCookie();
  const slug = (await cookies()).get(COMPANY_COOKIE)?.value;
  redirect(slug && /^[a-z0-9-]{2,60}$/.test(slug) ? `/entrar/${slug}` : "/login");
}

export async function switchCompanyAction(companyId: string | null): Promise<ActionResult> {
  return runAction(async (ctx) => { await switchCompany(ctx, companyId || null); });
}

export async function changeOwnPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => {
    const next = String(fd.get("next") ?? "");
    if (next !== String(fd.get("confirm") ?? ""))
      throw invalid("A confirmação não confere com a nova senha.", { confirm: "As senhas não conferem." });
    await changeOwnPassword(ctx, String(fd.get("current") ?? ""), next);
    return { message: "Senha alterada com sucesso. Outras sessões foram encerradas." };
  });
}
