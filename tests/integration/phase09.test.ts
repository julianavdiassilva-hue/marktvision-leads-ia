import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { closePool } from "@/server/db";
import { createCompany } from "@/server/services/companies";
import { createContact } from "@/server/services/contacts";
import { saveCampaign } from "@/server/services/campaigns";
import { createOpportunity, loseOpportunity, winOpportunity } from "@/server/services/crm";
import { saveGoal } from "@/server/services/team";
import { dashboardData } from "@/server/services/dashboard";
import { buildReport, REPORTS, reportCsv, reportXlsx } from "@/server/services/reports";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/core";
import { ADMIN, loginAs } from "./helpers";

let admin: AuthContext, gestor: AuthContext, v1: AuthContext, v2: AuthContext, outro: AuthContext;
const today = new Date().toISOString().slice(0, 10);
const P = { from: new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), to: today };
let campaignId: string;

beforeAll(async () => {
  admin = await loginAs(ADMIN.username, ADMIN.password);
  await createCompany(admin, { name: "Relatórios F9", users: [
    { name: "Gestor F9", username: "gestor.f9", password: "gestorsenha", role: "company_admin" },
    { name: "Ana F9", username: "v1.f9", password: "v1senha123", role: "seller" },
    { name: "Beto F9", username: "v2.f9", password: "v2senha123", role: "seller" }] });
  await createCompany(admin, { name: "Outra F9", users: [{ name: "Outro F9", username: "outro.f9", password: "outrosenha", role: "company_admin" }] });
  [gestor, v1, v2, outro] = await Promise.all([loginAs("gestor.f9", "gestorsenha"), loginAs("v1.f9", "v1senha123"), loginAs("v2.f9", "v2senha123"), loginAs("outro.f9", "outrosenha")]);
  const a = await createContact(gestor, { name: "=Cliente Ana", phone: "91 98100-0001", ownerUserId: v1.user.id });
  const b = await createContact(gestor, { name: "Cliente Beto", phone: "91 98100-0002", ownerUserId: v2.user.id });
  const c = await createContact(gestor, { name: "Cliente Perdido", phone: "91 98100-0003", ownerUserId: v2.user.id });
  campaignId = (await saveCampaign(gestor, { name: "Campanha F9", contactIds: [a.id, b.id, c.id] })).id;
  const o1 = (await createOpportunity(v1, { contactId: a.id, title: "Venda Ana", value: "1000" })).id;
  const o2 = (await createOpportunity(v2, { contactId: b.id, title: "Venda Beto", value: "300" })).id;
  const o3 = (await createOpportunity(v2, { contactId: c.id, title: "Perdida", value: "200" })).id;
  await winOpportunity(v1, o1, { amount: "1.000,00" });
  await winOpportunity(v2, o2, { amount: "300" });
  await loseOpportunity(v2, o3, "Preço");
  await saveGoal(gestor, { userId: v1.user.id, metric: "sales_amount", target: "2000", periodStart: P.from, periodEnd: P.to });
});
afterAll(async () => { await closePool(); });

describe("Fase 09 — Dashboard, metas e relatórios", () => {
  it("dashboard da empresa consolida dados reais e respeita filtros", async () => {
    const d = await dashboardData(gestor, P);
    expect(d.k).toMatchObject({ contacts: 3, sales_count: 2 });
    expect(Number(d.k.sales_amount)).toBe(1300);
    const byCamp = await dashboardData(gestor, { ...P, campaignId });
    expect(byCamp.k.sales_count).toBe(2);
    const bySeller = await dashboardData(gestor, { ...P, sellerId: v2.user.id });
    expect(Number(bySeller.k.sales_amount)).toBe(300);
  });

  it("vendedor vê apenas os próprios números, mesmo tentando filtrar outro vendedor", async () => {
    const d = await dashboardData(v1, { ...P, sellerId: v2.user.id });
    expect(d.k.sales_count).toBe(1); expect(Number(d.k.sales_amount)).toBe(1000);
    const r = await buildReport(v1, "vendas", { ...P, sellerId: v2.user.id });
    expect(r.rows.map((x) => x.seller)).toEqual(["Ana F9"]);
  });

  it("relatórios de vendas, campanhas, perdas, prospecção e metas", async () => {
    const vendas = await buildReport(gestor, "vendas", P);
    expect(vendas.rows).toHaveLength(2);
    const camp = await buildReport(gestor, "campanhas", P);
    expect(camp.rows[0]).toMatchObject({ campaign: "#" + camp.rows[0].campaign!.toString().split(" ")[0].slice(1) + " Campanha F9", total: 3, sales_count: 2, converted: 3 });
    const perdas = await buildReport(gestor, "perdas", P);
    expect(perdas.title).toMatch(/2 ganha\(s\), 1 perdida\(s\), conversão 66,7%|conversão 66.7%/);
    expect(perdas.rows.find((r) => r.result === "Perdida")).toMatchObject({ reason: "Preço", qty: 1 });
    const prosp = await buildReport(gestor, "prospeccao", P);
    expect(prosp.rows.reduce((a, r) => a + Number(r.leads), 0)).toBe(3);
    const metas = await buildReport(gestor, "metas", P);
    expect(metas.rows[0]).toMatchObject({ who: "Ana F9", target: expect.anything() });
    const msgs = await buildReport(gestor, "mensagens", P);
    expect(msgs.rows).toHaveLength(8);
  });

  it("relatório de atendimento é exclusivo do administrador", async () => {
    expect(REPORTS.atendimento.adminOnly).toBe(true);
    const r = await buildReport(gestor, "atendimento", P);
    expect(r.rows.map((x) => x.name)).toEqual(expect.arrayContaining(["Ana F9", "Beto F9"]));
    const e = await buildReport(v1, "atendimento", P).catch((x) => x);
    expect(e).toBeInstanceOf(AppError); expect((e as AppError).code).toBe("FORBIDDEN");
  });

  it("isolamento entre empresas e tipo inválido", async () => {
    expect((await buildReport(outro, "vendas", P)).rows).toHaveLength(0);
    expect((await dashboardData(outro, { ...P, campaignId })).k.sales_count).toBe(0);
    const e = await buildReport(gestor, "inexistente", P).catch((x) => x);
    expect((e as AppError).code).toBe("VALIDATION");
  });

  it("exportação CSV (Excel PT-BR, sem injeção de fórmula) e XLSX com números", async () => {
    const r = await buildReport(gestor, "vendas", P);
    const csv = reportCsv(r);
    expect(csv.startsWith("﻿Data;Cliente;Vendedor")).toBe(true);
    expect(csv).toContain("'=Cliente Ana");
    expect(csv).toMatch(/R\$\s?1\.000,00/);
    const wb = XLSX.read(await reportXlsx(r), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Relatório"], { header: 1 });
    expect(rows[3]).toContain("Valor");
    const amounts = rows.slice(4).map((x) => x[5]).sort();
    expect(amounts).toEqual([1000, 300].sort());
  });
});
