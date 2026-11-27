"use server";
import { runAction } from "@/server/action";
import { contactSearch, createOpportunity, deleteStage, loseOpportunity, moveOpportunity, moveStage, saveStage, updateOpportunity, winOpportunity } from "@/server/services/crm";
import { deleteGoal, distributeLeads, saveGoal } from "@/server/services/team";
import type { ContactFilters } from "@/server/services/contacts";

export async function moveOppAction(id: string, stageId: string, beforeId?: string | null) { return runAction(async (ctx) => { await moveOpportunity(ctx, id, stageId, beforeId); }); }
export async function winOppAction(id: string, amount: string, notes?: string) { return runAction(async (ctx) => { await winOpportunity(ctx, id, { amount, notes }); return { message: "Venda registrada! Dashboard, vendedor e campanha atualizados." }; }); }
export async function loseOppAction(id: string, reason: string) { return runAction(async (ctx) => { await loseOpportunity(ctx, id, reason); return { message: "Negociação marcada como perdida." }; }); }
export async function createOppAction(input: { contactId: string; title?: string; value?: string; stageId?: string; ownerUserId?: string; nextFollowUpAt?: string; notes?: string }) {
  return runAction(async (ctx) => ({ data: await createOpportunity(ctx, input), message: "Negociação criada." }));
}
export async function updateOppAction(id: string, input: { title?: string; value?: string; ownerUserId?: string | null; nextFollowUpAt?: string; notes?: string }) {
  return runAction(async (ctx) => { await updateOpportunity(ctx, id, input); return { message: "Negociação salva." }; });
}
export async function searchContactsAction(q: string) { return runAction(async (ctx) => ({ data: await contactSearch(ctx, q) })); }
export async function saveStageAction(name: string, color: string, id?: string) { return runAction(async (ctx) => { await saveStage(ctx, { name, color }, id); }); }
export async function moveStageAction(id: string, dir: -1 | 1) { return runAction(async (ctx) => { await moveStage(ctx, id, dir); }); }
export async function deleteStageAction(id: string) { return runAction(async (ctx) => { await deleteStage(ctx, id); }); }
export async function distributeAction(sel: { ids?: string[]; filters?: ContactFilters }, userIds: string[], onlyUnassigned: boolean) {
  return runAction(async (ctx) => { const r = await distributeLeads(ctx, sel, userIds, onlyUnassigned); return { message: `${r.distributed} lead(s) distribuídos${r.skipped ? `; ${r.skipped} já tinham responsável` : ""}.` }; });
}
export async function saveGoalAction(input: { userId: string; metric: string; target: string; periodStart: string; periodEnd: string }) {
  return runAction(async (ctx) => { await saveGoal(ctx, input as never); return { message: "Meta salva." }; });
}
export async function deleteGoalAction(id: string) { return runAction(async (ctx) => { await deleteGoal(ctx, id); }); }
