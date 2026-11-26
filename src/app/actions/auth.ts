"use server";
import { redirect } from "next/navigation";
import { login, logout, switchCompany } from "@/server/auth/core";
import { clearSessionCookie, readSessionToken, requestMeta, setSessionCookie } from "@/server/auth/next";
import { invalid, toAppError } from "@/server/errors";
import { runAction, type ActionResult } from "@/server/action";
import { changeOwnPassword } from "@/server/services/users";

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let target = "/";
  try {
    const { token } = await login(String(fd.get("username") ?? ""), String(fd.get("password") ?? ""), await requestMeta());
    await setSessionCookie(token);
    const next = String(fd.get("next") ?? "");
    if (next.startsWith("/") && !next.startsWith("//")) target = next;
  } catch (e) {
    return { ok: false, error: toAppError(e).message };
  }
  redirect(target);
}

export async function logoutAction() {
  await logout(await readSessionToken());
  await clearSessionCookie();
  redirect("/login");
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
