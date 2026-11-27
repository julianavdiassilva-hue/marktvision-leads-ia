import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "@/server/db";
import { createCompany } from "@/server/services/companies";
import { createContact, getContact, listContacts } from "@/server/services/contacts";
import { campaignTransition, getCampaign, saveCampaign } from "@/server/services/campaigns";
import { contactSearch, createOpportunity, deleteStage, getBoard, loseOpportunity, moveOpportunity, moveStage, saveStage, updateOpportunity, winOpportunity } from "@/server/services/crm";
import { distributeLeads, listGoals, saveGoal, sellerIndicators } from "@/server/services/team";
import { dashboardSummary } from "@/server/services/dashboard";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/core";
import { ADMIN, loginAs } from "./helpers";

let admin: AuthContext, gestor: AuthContext, v1: AuthContext, v2: AuthContext, outro: AuthContext;
const expectError = async (p: Promise<unknown>, code: AppError["code"], msg?: RegExp) => {
  const e = await p.then(() => null, (err) => err); expect(e, "deveria ter falhado").toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code); if (msg) expect((e as AppError).message).toMatch(msg);
};
const month = () => { const d = new Date(); return { from: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10) }; };

beforeAll(async () => {
  admin = await loginAs(ADMIN.username, ADMIN.password);
  await createCompany(admin, { name: "CRM F7", users: [
    { name: "Gestor F7", username: "gestor.f7", password: "gestorsenha", role: "company_admin" },
    { name: "Ana Vendas F7", username: "v1.f7", password: "v1senha123", role: "seller" },
    { name: "Beto Vendas F7", username: "v2.f7", password: "v2senha123", role: "seller" }] });
  await createCompany(admin, { name: "Outra F7", users: [{ name: "Outro", username: "outro.f7", password: "outrosenha", role: "company_admin" }] });
  gestor = await loginAs("gestor.f7", "gestorsenha"); v1 = await loginAs("v1.f7", "v1senha123"); v2 = await loginAs("v2.f7", "v2senha123"); outro = await loginAs("outro.f7", "outrosenha");
});
afterAll(async () => { await closePool(); });

describe("Fase 07 — CRM e equipe comercial", () => {
  let oppId: string; let contactId: string; let campaignId: string;

  it("distribuição automática em rodízio entre vendedores (somente sem responsável)", async () => {
    const ids = [];
    for (let i = 1; i <= 5; i++) ids.push((await createContact(gestor, { name: `Lead ${i}`, phone: `91 98700-000${i}` })).id);
    const r = await distributeLeads(gestor, { ids }, [v1.user.id, v2.user.id]);
    expect(r.distributed).toBe(5);
    expect(Object.values(r.per).sort()).toEqual([2, 3]);
    const again = await distributeLeads(gestor, { ids }, [v1.user.id]);
    expect(again).toMatchObject({ distributed: 0, skipped: 5 });
    await expectError(distributeLeads(v1, { ids }, [v1.user.id]), "FORBIDDEN");
  });

  it("negociação criada vinculada ao contato e à campanha de origem", async () => {
    contactId = (await listContacts(v1)).rows[0].id;
    campaignId = (await saveCampaign(gestor, { name: "Campanha F7", contactIds: [contactId] })).id;
    oppId = (await createOpportunity(v1, { contactId, title: "Manutenção anual", value: "1.500,00" })).id;
    const b = await getBoard(v1);
    const card = b.cards.find((c) => c.id === oppId)!;
    expect(card).toMatchObject({ value: "1500.00", owner_name: "Ana Vendas F7", campaign_name: "Campanha F7" });
    expect(b.stages[0]).toMatchObject({ name: "Novo lead", count: 1, total: "1500.00" });
    expect((await listContacts(gestor, { q: (await getContact(gestor, contactId)).contact.name as string })).rows[0].commercial_status).toBe("negotiating");
  });

  it("vendedor só vê e move as próprias negociações", async () => {
    expect((await getBoard(v2)).cards.find((c) => c.id === oppId)).toBeUndefined();
    const st = (await getBoard(v1)).stages;
    await expectError(moveOpportunity(v2, oppId, st[2].id), "NOT_FOUND");
    await moveOpportunity(v1, oppId, st[2].id);
    expect((await getBoard(v1)).cards.find((c) => c.id === oppId)!.stage_id).toBe(st[2].id);
  });

  it("ganho/perda exigem dados próprios (não por arrastar)", async () => {
    const st = (await getBoard(v1)).stages;
    await expectError(moveOpportunity(v1, oppId, st.find((s) => s.kind === "won")!.id), "VALIDATION", /registre a venda/);
    await expectError(winOpportunity(v1, oppId, { amount: "" }), "VALIDATION", /valor da venda/);
  });

  it("venda registrada atualiza contato, vendedor, campanha e dashboard", async () => {
    await winOpportunity(v1, oppId, { amount: "1.800,50" });
    await expectError(winOpportunity(v1, oppId, { amount: "10" }), "CONFLICT");
    expect((await getContact(gestor, contactId)).contact.commercial_status).toBe("customer");
    expect((await getCampaign(gestor, campaignId)).campaign).toMatchObject({ sales_count: 1, sales_amount: "1800.50", converted: 1 });
    expect(await dashboardSummary(v1)).toMatchObject({ sales_count: 1, sales_amount: "1800.50" });
    const ind = (await sellerIndicators(gestor, month())).find((r) => r.name === "Ana Vendas F7")!;
    expect(ind).toMatchObject({ sales_count: 1, sales_amount: "1800.50", won: 1 });
  });

  it("reabrir (mover de volta) desfaz a venda; perda exige motivo", async () => {
    const st = (await getBoard(v1)).stages;
    await moveOpportunity(v1, oppId, st[1].id);
    expect((await getCampaign(gestor, campaignId)).campaign.sales_count).toBe(0);
    await expectError(loseOpportunity(v1, oppId, ""), "VALIDATION", /motivo/);
    await loseOpportunity(v1, oppId, "Preço");
    const card = (await getBoard(v1)).cards.find((c) => c.id === oppId)!;
    expect(card).toMatchObject({ status: "lost", lost_reason: "Preço" });
  });

  it("transferência de negociação só pelo administrador e leva o contato", async () => {
    const id = (await createOpportunity(v1, { contactId, title: "Nova proposta" })).id;
    await expectError(updateOpportunity(v1, id, { ownerUserId: v2.user.id }), "FORBIDDEN");
    await updateOpportunity(gestor, id, { ownerUserId: v2.user.id, value: "900" });
    expect((await getBoard(v2)).cards.map((c) => c.id)).toContain(id);
    expect((await listContacts(v2)).rows.map((r) => r.id)).toContain(contactId);
  });

  it("funil personalizável (somente administrador)", async () => {
    await expectError(saveStage(v1, { name: "Visita" }), "FORBIDDEN");
    const { id } = await saveStage(gestor, { name: "Visita técnica", color: "#2563EB" });
    let st = (await getBoard(gestor)).stages;
    const idx = st.findIndex((s) => s.id === id);
    expect(st[idx + 1].kind).toBe("won"); // entra antes de Venda/Perdido
    await moveStage(gestor, id, -1);
    st = (await getBoard(gestor)).stages;
    expect(st.findIndex((s) => s.id === id)).toBe(idx - 1);
    await expectError(deleteStage(gestor, st.find((s) => s.kind === "won")!.id), "VALIDATION", /obrigatórias/);
    await deleteStage(gestor, id);
  });

  it("metas individuais e coletivas com realizado real", async () => {
    const { from, to } = month();
    const opp = (await createOpportunity(v2, { contactId: (await listContacts(v2)).rows[0].id, value: "500" })).id;
    await winOpportunity(v2, opp, { amount: "500" });
    await saveGoal(gestor, { userId: v2.user.id, metric: "sales_amount", target: "1000", periodStart: from, periodEnd: to });
    await saveGoal(gestor, { userId: "team", metric: "sales_count", target: "4", periodStart: from, periodEnd: to });
    await expectError(saveGoal(v1, { userId: v1.user.id, metric: "sales_amount", target: "1", periodStart: from, periodEnd: to }), "FORBIDDEN");
    const g = await listGoals(v2, { from, to });
    expect(g.find((x) => x.user_id === v2.user.id)).toMatchObject({ achieved: "500.00", progress: 50 });
    expect(g.find((x) => x.user_id === null)).toMatchObject({ achieved: "1", progress: 25 });
    expect((await listGoals(v1, { from, to })).every((x) => x.user_id === null || x.user_id === v1.user.id)).toBe(true);
    expect((await sellerIndicators(gestor, { from, to })).find((r) => r.name === "Beto Vendas F7")!.goal_progress).toBe(50);
  });

  it("busca de contatos para nova negociação e isolamento", async () => {
    expect((await contactSearch(v1, "Lead")).length).toBeGreaterThan(0);
    expect((await contactSearch(v1, "xyz-nada")).length).toBe(0);
    expect((await getBoard(outro)).cards).toEqual([]);
    await expectError(moveOpportunity(outro, oppId, (await getBoard(outro)).stages[0].id), "NOT_FOUND");
  });
});
