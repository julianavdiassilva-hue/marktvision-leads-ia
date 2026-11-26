"use server";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import { createUser, resetPassword, setUserActive, setUserFeature, updateUser } from "@/server/services/users";

export async function createUserAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => {
    const d = formToObject(fd);
    const companyId = ctx.user.isPlatformAdmin ? d.companyId || null : ctx.company?.id ?? null;
    const r = await createUser(ctx, { name: d.name, username: d.username, password: d.password, role: d.role as never, companyId });
    return { message: `Acesso criado. Login: ${r.username}` };
  });
}
export async function updateUserAction(userId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => {
    const d = formToObject(fd);
    await updateUser(ctx, userId, { name: d.name, username: d.username, role: (d.role || undefined) as never });
    return { message: "Usuário atualizado." };
  });
}
export async function resetPasswordAction(userId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => {
    await resetPassword(ctx, userId, String(fd.get("password") ?? ""));
    return { message: "Senha redefinida. As sessões abertas desse usuário foram encerradas." };
  });
}
export async function setUserActiveAction(userId: string, active: boolean) {
  return runAction(async (ctx) => { await setUserActive(ctx, userId, active); });
}
export async function setUserFeatureAction(userId: string, key: string, enabled: boolean) {
  return runAction(async (ctx) => { await setUserFeature(ctx, userId, key, enabled); });
}
