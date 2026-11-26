"use server";
import { runAction } from "@/server/action";
import { AppError } from "@/server/errors";
import {
  completeEmbeddedSignup, connectNumber, disconnectNumber, setConnectionMembers, syncTemplates, testConnection,
  updateConnectionSettings, type ConnectInput, type SignupInput,
} from "@/server/services/whatsapp";

export async function completeSignupAction(input: SignupInput) {
  return runAction(async (ctx) => {
    const r = await completeEmbeddedSignup(ctx, input);
    return { data: r, message: r.mode === "coexistence"
      ? `WhatsApp ${r.displayPhone} conectado. Você continua usando o WhatsApp Business no celular; contatos e histórico estão sendo sincronizados.`
      : `WhatsApp ${r.displayPhone} conectado e pronto para uso.` };
  });
}
export async function manualConnectAction(input: ConnectInput) {
  return runAction(async (ctx) => { const r = await connectNumber(ctx, input); return { data: r, message: `Número ${r.displayPhone} conectado.${r.subscribeWarning ? ` Atenção: ${r.subscribeWarning}` : ""}` }; });
}
export async function testConnectionAction(id: string) {
  return runAction(async (ctx) => { const r = await testConnection(ctx, id); if (!r.ok) throw new AppError("INTEGRATION", r.message); return { message: r.message }; });
}
export async function syncTemplatesAction(id: string) {
  return runAction(async (ctx) => { const r = await syncTemplates(ctx, id); return { message: `${r.total} modelo(s) sincronizados, ${r.approved} aprovado(s) pela Meta.` }; });
}
export async function disconnectAction(id: string, remove = false) {
  return runAction(async (ctx) => { await disconnectNumber(ctx, id, remove); return { message: remove ? "Conexão excluída." : "Número desconectado." }; });
}
export async function setMembersAction(id: string, userIds: string[]) {
  return runAction(async (ctx) => { const r = await setConnectionMembers(ctx, id, userIds); return { message: `${r.count} vendedor(es) responsáveis por este número.` }; });
}
export async function setRateAction(id: string, perMinute: number) {
  return runAction(async (ctx) => { await updateConnectionSettings(ctx, id, perMinute); return { message: "Ritmo de envio atualizado." }; });
}
