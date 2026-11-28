"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { removeLogo, resetBranding, saveBranding, uploadLogo } from "@/server/services/branding";

const refresh = () => revalidatePath("/", "layout");

export async function saveBrandingAction(companyId: string, input: Record<string, string | undefined>) {
  return runAction(async (ctx) => { await saveBranding(ctx, companyId, input); refresh(); return { message: "Identidade visual salva. Ela já vale para todos os usuários desta empresa." }; });
}
export async function uploadLogoAction(companyId: string, file: { name: string; base64: string }) {
  return runAction(async (ctx) => { const r = await uploadLogo(ctx, companyId, file); refresh(); return { message: "Logomarca atualizada.", data: r }; });
}
export async function removeLogoAction(companyId: string) {
  return runAction(async (ctx) => { await removeLogo(ctx, companyId); refresh(); return { message: "Logomarca removida." }; });
}
export async function resetBrandingAction(companyId: string) {
  return runAction(async (ctx) => { await resetBranding(ctx, companyId); refresh(); return { message: "Padrão Marktvision restaurado." }; });
}
