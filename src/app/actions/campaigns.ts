"use server";
import { runAction } from "@/server/action";
import { campaignTransition, contactsLite, saveCampaign, saveSelectionAsList, type CampaignOp, type DraftInput } from "@/server/services/campaigns";
import { aiGenerateMessage, aiImproveMessage, deleteScript, saveScript } from "@/server/services/scripts";
import { createContact } from "@/server/services/contacts";

export async function saveCampaignAction(input: DraftInput, id?: string) {
  return runAction(async (ctx) => ({ data: await saveCampaign(ctx, input, id), message: "Rascunho salvo." }));
}
export async function campaignOpAction(id: string, op: CampaignOp, arg?: string) {
  return runAction(async (ctx) => {
    const r = await campaignTransition(ctx, id, op, arg);
    return { message: r.message, data: r };
  });
}
export async function loadContactsAction(sel: { ids?: string[]; listId?: string }) {
  return runAction(async (ctx) => ({ data: await contactsLite(ctx, sel) }));
}
export async function quickContactAction(input: { name: string; phone: string; organization?: string }) {
  return runAction(async (ctx) => {
    const { id } = await createContact(ctx, input);
    return { data: (await contactsLite(ctx, { ids: [id] }))[0] };
  });
}
export async function saveSelectionAsListAction(name: string, ids: string[]) {
  return runAction(async (ctx) => {
    const r = await saveSelectionAsList(ctx, name, ids);
    return { data: r, message: `Lista "${name}" criada com ${r.count} contato(s).` };
  });
}
export async function saveScriptAction(input: { name: string; body: string }, id?: string) {
  return runAction(async (ctx) => ({ data: await saveScript(ctx, input, id), message: "Modelo salvo." }));
}
export async function deleteScriptAction(id: string) {
  return runAction(async (ctx) => { await deleteScript(ctx, id); });
}
export async function aiGenerateAction(goal: string, audience?: string) {
  return runAction(async (ctx) => ({ data: await aiGenerateMessage(ctx, { goal, audience }) }));
}
export async function aiImproveAction(body: string, instruction?: string) {
  return runAction(async (ctx) => ({ data: await aiImproveMessage(ctx, body, instruction) }));
}
