"use server";
import { runAction } from "@/server/action";
import { deleteDocument, deleteKnowledge, saveKnowledge, uploadDocument } from "@/server/services/knowledge";
import { saveAiSettings, testAgent } from "@/server/services/ai-agent";
import type { ChatMessage } from "@/server/integrations/ai";

export async function saveKnowledgeAction(input: { category: string; title: string; content: string; isActive: boolean }, id?: string) {
  return runAction(async (ctx) => { await saveKnowledge(ctx, input, id); return { message: "Informação salva. O agente já usa este conteúdo." }; });
}
export async function deleteKnowledgeAction(id: string) { return runAction(async (ctx) => { await deleteKnowledge(ctx, id); }); }
export async function uploadDocumentAction(file: { name: string; type: string; base64: string }) {
  return runAction(async (ctx) => { const r = await uploadDocument(ctx, file); return { message: `Documento adicionado (${r.chars.toLocaleString("pt-BR")} caracteres de texto).` }; });
}
export async function deleteDocumentAction(id: string) { return runAction(async (ctx) => { await deleteDocument(ctx, id); }); }
export async function saveAiSettingsAction(input: Record<string, unknown>) {
  return runAction(async (ctx) => { await saveAiSettings(ctx, input as never); return { message: "Configurações do agente salvas." }; });
}
export async function testAgentAction(history: ChatMessage[]) { return runAction(async (ctx) => ({ data: await testAgent(ctx, history) })); }
