import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { closePool } from "@/server/db";
import { createCompany } from "@/server/services/companies";
import { createContact, setConsent, listContacts } from "@/server/services/contacts";
import { campaignTransition, contactsLite, getCampaign, listCampaigns, saveCampaign, saveSelectionAsList } from "@/server/services/campaigns";
import { aiGenerateMessage, listScripts, saveScript } from "@/server/services/scripts";
import { renderTemplate } from "@/lib/template";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/core";
import { ADMIN, loginAs } from "./helpers";

let admin: AuthContext, gestor: AuthContext, outro: AuthContext;
let companyId: string;
const ids: string[] = [];
const expectError = async (p: Promise<unknown>, code: AppError["code"], msg?: RegExp) => {
  const e = await p.then(() => null, (err) => err);
  expect(e, "deveria ter falhado").toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code);
  if (msg) expect((e as AppError).message).toMatch(msg);
};
const owner = async <T>(fn: (c: Client) => Promise<T>) => {
  const c = new Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL }); await c.connect();
  try { return await fn(c); } finally { await c.end(); }
};

beforeAll(async () => {
  admin = await loginAs(ADMIN.username, ADMIN.password);
  companyId = (await createCompany(admin, { name: "Campanhas F4", users: [{ name: "Gestor F4", username: "gestor.f4", password: "gestorsenha", role: "company_admin" }] })).id;
  await createCompany(admin, { name: "Outra F4", users: [{ name: "Outro", username: "outro.f4", password: "outrosenha", role: "company_admin" }] });
  gestor = await loginAs("gestor.f4", "gestorsenha");
  outro = await loginAs("outro.f4", "outrosenha");
  for (const [n, p] of [["Ana Clínica", "91 98400-0001"], ["Bruno Odonto", "91 98400-0002"], ["Carla Sorriso", "91 98400-0003"]])
    ids.push((await createContact(gestor, { name: n, phone: p, organization: `${n} Ltda`, city: "Belém" })).id);
  ids.push((await createContact(gestor, { name: "Sem telefone", email: "sem@tel.com" })).id);
});
afterAll(async () => { vi.unstubAllGlobals(); await closePool(); });

describe("Fase 04 — campanhas", () => {
  it("personalização substitui variáveis e nunca deixa {{...}}", () => {
    expect(renderTemplate("Olá {{primeiro_nome}}, da {{empresa}} em {{cidade}}! Sou {{vendedor}}.", { name: "Ana Souza", organization: "Clínica Ana", city: "Belém" }))
      .toBe("Olá Ana, da Clínica Ana em Belém! Sou nossa equipe.");
  });

  it("cria rascunho numerado com contatos, sem duplicar a seleção", async () => {
    const { id } = await saveCampaign(gestor, { name: "Prospecção de clínicas", messageBody: "Olá {{primeiro_nome}}!", contactIds: [...ids, ids[0]] });
    const { campaign } = await getCampaign(gestor, id);
    expect(campaign.number).toBe(1);
    expect(campaign.status).toBe("draft");
    expect(campaign.total).toBe(4);
    const second = await saveCampaign(gestor, { name: "Segunda", contactIds: [] });
    expect((await getCampaign(gestor, second.id)).campaign.number).toBe(2);
  });

  it("variável desconhecida é recusada", async () => {
    await expectError(saveCampaign(gestor, { name: "X", messageBody: "Oi {{apelido}}" }), "VALIDATION", /apelido/);
  });

  it("edição do rascunho troca a seleção", async () => {
    const c = (await listCampaigns(gestor)).find((x) => x.number === 1)!;
    await saveCampaign(gestor, { name: "Prospecção de clínicas", messageBody: "Olá {{primeiro_nome}}!", contactIds: ids.slice(0, 3) }, c.id);
    expect((await getCampaign(gestor, c.id)).campaign.total).toBe(3);
  });

  it("não inicia sem WhatsApp conectado (sem simular envio)", async () => {
    const c = (await listCampaigns(gestor)).find((x) => x.number === 1)!;
    await expectError(campaignTransition(gestor, c.id, "start"), "INTEGRATION", /número de WhatsApp/);
    expect((await getCampaign(gestor, c.id)).campaign.status).toBe("draft");
  });

  it("com WhatsApp conectado: inicia, ignora descadastrados/sem telefone, enfileira, pausa e retoma sem perder dados", async () => {
    const connId = await owner(async (db) => {
      await db.query("begin"); await db.query("select set_config('app.system','on',true)");
      const r = await db.query(`insert into whatsapp_connections (company_id, display_name, status) values ($1,'Comercial','connected') returning id`, [companyId]);
      await db.query("commit"); return r.rows[0].id as string;
    });
    await setConsent(gestor, [ids[2]], "opted_out", "Pediu para sair");
    const { id } = await saveCampaign(gestor, { name: "Envio real", messageBody: "Olá {{primeiro_nome}}", whatsappConnectionId: connId, contactIds: ids });
    await campaignTransition(gestor, id, "start");
    let d = await getCampaign(gestor, id);
    expect(d.campaign.status).toBe("running");
    expect(d.campaign.skipped).toBe(2);
    expect(d.contacts.find((x) => x.contact_id === ids[2])?.error).toMatch(/descadastrado/);
    const jobs = await owner((db) => db.query(`select type, status from jobs where payload->>'campaignId' = $1`, [id]));
    expect(jobs.rows).toEqual([{ type: "campaign.dispatch", status: "pending" }]);
    await expectError(campaignTransition(gestor, id, "start"), "CONFLICT");
    await campaignTransition(gestor, id, "pause");
    d = await getCampaign(gestor, id);
    expect(d.campaign.status).toBe("paused");
    expect(d.campaign.pending).toBe(2);
    await campaignTransition(gestor, id, "resume");
    expect((await getCampaign(gestor, id)).campaign.status).toBe("running");
    await expectError(campaignTransition(gestor, id, "archive"), "CONFLICT", /Pause ou cancele/);
    await campaignTransition(gestor, id, "cancel");
    await campaignTransition(gestor, id, "archive");
    expect((await listCampaigns(gestor, { archived: true })).map((x) => x.id)).toContain(id);
    await expectError(saveCampaign(gestor, { name: "editar cancelada" }, id), "CONFLICT", /não pode ser editada/);
  });

  it("duplica com contatos como novo rascunho", async () => {
    const c = (await listCampaigns(gestor)).find((x) => x.number === 1)!;
    const r = await campaignTransition(gestor, c.id, "duplicate");
    const dup = await getCampaign(gestor, (r as { id: string }).id);
    expect(dup.campaign.name).toBe("Prospecção de clínicas (cópia)");
    expect(dup.campaign.status).toBe("draft");
    expect(dup.campaign.total).toBe(3);
  });

  it("programação exige data futura e WhatsApp", async () => {
    const c = (await listCampaigns(gestor)).find((x) => x.number === 1)!;
    await expectError(campaignTransition(gestor, c.id, "schedule", "2020-01-01T10:00"), "VALIDATION", /futura/);
  });

  it("salvar seleção como lista e carregar contatos da lista", async () => {
    const l = await saveSelectionAsList(gestor, "Selecionados F4", ids.slice(0, 2));
    expect(l.count).toBe(2);
    expect((await contactsLite(gestor, { listId: l.id })).map((x) => x.name).sort()).toEqual(["Ana Clínica", "Bruno Odonto"]);
  });

  it("modelos de script e IA sem chave com mensagem clara", async () => {
    await saveScript(gestor, { name: "Primeiro contato", body: "Olá {{primeiro_nome}}, tudo bem?" });
    expect((await listScripts(gestor)).map((s) => s.name)).toContain("Primeiro contato");
    delete process.env.ANTHROPIC_API_KEY;
    await expectError(aiGenerateMessage(gestor, { goal: "oferecer manutenção de ar-condicionado" }), "INTEGRATION", /ANTHROPIC_API_KEY/);
  });

  it("isolamento: outra empresa não vê nem opera campanhas; contatos alheios são ignorados", async () => {
    const c = (await listCampaigns(gestor))[0];
    expect(await listCampaigns(outro)).toEqual([]);
    await expectError(getCampaign(outro, c.id), "NOT_FOUND");
    await expectError(campaignTransition(outro, c.id, "pause"), "NOT_FOUND");
    const mine = await saveCampaign(outro, { name: "Tentativa", contactIds: ids });
    expect((await getCampaign(outro, mine.id)).campaign.total).toBe(0);
    expect((await listContacts(outro)).total).toBe(0);
  });
});
