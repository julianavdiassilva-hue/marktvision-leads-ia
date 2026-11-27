"use server";
import { runAction } from "@/server/action";
import {
  assumeConversation, createOpportunityFromConversation, deleteQuickReply, saveContactNotes, saveQuickReply, sendFile, sendMessage,
  setConversationAi, setConversationStatus, setFollowUp, suggestReply, transferConversation,
} from "@/server/services/conversations";

export async function sendMessageAction(id: string, body: string) { return runAction(async (ctx) => { await sendMessage(ctx, id, body); }); }
export async function sendFileAction(id: string, file: { name: string; type: string; base64: string; caption?: string }) {
  return runAction(async (ctx) => { await sendFile(ctx, id, file); return { message: "Arquivo enviado." }; });
}
export async function transferAction(id: string, userId: string | null) { return runAction(async (ctx) => { await transferConversation(ctx, id, userId); return { message: "Conversa transferida." }; }); }
export async function assumeAction(id: string) { return runAction(async (ctx) => { await assumeConversation(ctx, id); return { message: "Você assumiu o atendimento. A IA foi pausada nesta conversa." }; }); }
export async function aiToggleAction(id: string, enabled: boolean) { return runAction(async (ctx) => { await setConversationAi(ctx, id, enabled); }); }
export async function statusAction(id: string, status: "open" | "closed") { return runAction(async (ctx) => { await setConversationStatus(ctx, id, status); }); }
export async function followUpAction(id: string, when: string | null) { return runAction(async (ctx) => { await setFollowUp(ctx, id, when); return { message: when ? "Retorno agendado." : "Retorno removido." }; }); }
export async function notesAction(id: string, notes: string) { return runAction(async (ctx) => { await saveContactNotes(ctx, id, notes); return { message: "Observações salvas." }; }); }
export async function opportunityAction(id: string) {
  return runAction(async (ctx) => { const r = await createOpportunityFromConversation(ctx, id); return { message: r.existed ? "Esta conversa já tem uma negociação aberta." : "Negociação criada no CRM.", data: r }; });
}
export async function suggestAction(id: string) { return runAction(async (ctx) => ({ data: await suggestReply(ctx, id) })); }
export async function saveQuickReplyAction(shortcut: string, body: string) { return runAction(async (ctx) => { await saveQuickReply(ctx, { shortcut, body }); return { message: "Resposta rápida salva." }; }); }
export async function deleteQuickReplyAction(id: string) { return runAction(async (ctx) => { await deleteQuickReply(ctx, id); }); }
