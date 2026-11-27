import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { closePool } from "@/server/db";
import { createCompany } from "@/server/services/companies";
import { listContacts } from "@/server/services/contacts";
import { getConversation, listConversations, setConversationAi } from "@/server/services/conversations";
import { deleteKnowledge, listKnowledge, saveKnowledge, uploadDocument } from "@/server/services/knowledge";
import { getAiSettings, saveAiSettings, testAgent, withinHours } from "@/server/services/ai-agent";
import { getBoard } from "@/server/services/crm";
import { processEvolutionWebhook } from "@/server/webhooks/evolution";
import { runWorkerOnce } from "@/server/jobs/worker";
import { aiConfig } from "@/server/integrations/ai";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/core";
import { ADMIN, loginAs } from "./helpers";

// provedor de IA (formato chat completions) e Evolution simulados SOMENTE no teste
const aiCalls: { system: string; messages: { role: string; content: string }[] }[] = [];
let nextAi: Record<string, unknown> = { reply: "Olá!", qualified: false, handoff: false };
const sent: { path: string; body: Record<string, unknown> }[] = [];
let seq = 0;
const fake = () => vi.fn(async (url: string, init?: RequestInit) => {
  const u = new URL(url); const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (u.pathname.endsWith("/chat/completions")) {
    aiCalls.push({ system: body.messages[0].content, messages: body.messages.slice(1) });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(nextAi) } }] }), { status: 200 });
  }
  sent.push({ path: u.pathname, body });
  return new Response(JSON.stringify({ key: { id: `AI-OUT${++seq}` } }), { status: 200 });
});
const owner = async <T>(fn: (c: Client) => Promise<T>) => { const c = new Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL }); await c.connect(); try { return await fn(c); } finally { await c.end(); } };
const expectError = async (p: Promise<unknown>, code: AppError["code"], msg?: RegExp) => {
  const e = await p.then(() => null, (err) => err); expect(e, "deveria ter falhado").toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code); if (msg) expect((e as AppError).message).toMatch(msg);
};
const runAiJobs = async () => { await owner((db) => db.query(`update jobs set run_at = now() where type = 'ai.reply' and status = 'pending'`)); await runWorkerOnce(); };

let admin: AuthContext, gestor: AuthContext, vend: AuthContext, outro: AuthContext; let companyId: string; let otherId: string;
const instance = "mv-f8-ia";
const inbound = (id: string, text: string, phone = "5591944440001") =>
  processEvolutionWebhook({ event: "messages.upsert", instance, data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id }, pushName: "Joana Lead", message: { conversation: text } } });

beforeAll(async () => {
  admin = await loginAs(ADMIN.username, ADMIN.password);
  companyId = (await createCompany(admin, { name: "Clima Frio F8", users: [
    { name: "Gestor F8", username: "gestor.f8", password: "gestorsenha", role: "company_admin" },
    { name: "Vend F8", username: "vend.f8", password: "vendsenha1", role: "seller" }] })).id;
  otherId = (await createCompany(admin, { name: "Outra F8", users: [{ name: "Outro", username: "outro.f8", password: "outrosenha", role: "company_admin" }] })).id;
  gestor = await loginAs("gestor.f8", "gestorsenha"); vend = await loginAs("vend.f8", "vendsenha1"); outro = await loginAs("outro.f8", "outrosenha");
  await owner(async (db) => {
    await db.query("begin"); await db.query("select set_config('app.system','on',true)");
    const w = await db.query(`insert into whatsapp_connections (company_id, provider, connection_mode, display_name, instance_name, status) values ($1,'evolution','qr','IA',$2,'connected') returning id`, [companyId, instance]);
    await db.query(`insert into whatsapp_connection_members (company_id, connection_id, user_id) values ($1,$2,$3)`, [companyId, w.rows[0].id, vend.user.id]);
    await db.query("commit");
  });
  process.env.EVOLUTION_API_URL = "http://evolution.local"; process.env.EVOLUTION_API_KEY = "k";
});
beforeEach(() => {
  vi.stubGlobal("fetch", fake()); aiCalls.length = 0; sent.length = 0;
  delete process.env.ANTHROPIC_API_KEY; process.env.AI_PROVIDER = "openai_compat"; process.env.AI_BASE_URL = "http://ia.local/v1"; process.env.AI_MODEL = "modelo-teste";
});
afterAll(async () => { vi.unstubAllGlobals(); delete process.env.AI_PROVIDER; delete process.env.AI_BASE_URL; delete process.env.AI_MODEL; await closePool(); });

describe("Fase 08 — contexto da empresa e chatbot IA", () => {
  it("provedor gratuito compatível reconhecido", () => {
    process.env.AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
    expect(aiConfig()).toMatchObject({ provider: "openai_compat", ready: true, label: "Google Gemini" });
  });

  it("contexto: informações e documento, só o administrador edita", async () => {
    await saveKnowledge(gestor, { category: "prices", title: "Instalação de split", content: "Instalação de ar split 12.000 BTUs: R$ 450,00." });
    await saveKnowledge(gestor, { category: "hours", title: "Horário", content: "Segunda a sexta, 8h às 18h." });
    await uploadDocument(gestor, { name: "politica.txt", type: "text/plain", base64: Buffer.from("Garantia de 90 dias para todos os serviços de instalação.").toString("base64") });
    await expectError(saveKnowledge(vend, { category: "faq", title: "x", content: "y" }), "FORBIDDEN");
    await expectError(uploadDocument(gestor, { name: "foto.jpg", type: "image/jpeg", base64: "AAAA" }), "VALIDATION", /Formato/);
    const k = await listKnowledge(gestor);
    expect(k.entries).toHaveLength(2);
    expect(k.documents[0]).toMatchObject({ filename: "politica.txt" });
    await saveKnowledge(outro, { category: "prices", title: "Preço SECRETO da outra empresa", content: "R$ 1,00" });
  });

  it("configuração do agente; teste na tela usa SOMENTE o conhecimento da própria empresa", async () => {
    await saveAiSettings(gestor, { enabled: true, agentName: "Lia", tone: "simpático", greetingMessage: "Olá! Sou a Lia, assistente virtual.", closingMessage: "Vou chamar um especialista.",
      handoffCriteria: "pedido de orçamento", autoReplyNew: true, hoursEnabled: false });
    nextAi = { reply: "A instalação custa R$ 450,00.", qualified: false, handoff: false };
    const d = await testAgent(gestor, [{ role: "user", content: "Quanto custa instalar?" }]);
    expect(d.reply).toBe("A instalação custa R$ 450,00.");
    expect(aiCalls[0].system).toContain("R$ 450,00");
    expect(aiCalls[0].system).toContain("Garantia de 90 dias");
    expect(aiCalls[0].system).not.toContain("SECRETO");
    expect(aiCalls[0].system).toContain("Nunca invente preços");
    expect((await getAiSettings(gestor)).agent_name).toBe("Lia");
  });

  it("novo contato pelo WhatsApp: IA responde sozinha com saudação, agrupando mensagens seguidas", async () => {
    nextAi = { reply: "Atendemos sim! Qual o modelo do aparelho?", qualified: false, handoff: false };
    await inbound("A1", "Oi"); await inbound("A2", "vocês instalam ar condicionado?");
    await runAiJobs();
    expect(aiCalls).toHaveLength(1);
    expect(aiCalls[0].messages).toEqual([{ role: "user", content: "Oi\nvocês instalam ar condicionado?" }]);
    expect(sent[0].body.text).toBe("Olá! Sou a Lia, assistente virtual.\n\nAtendemos sim! Qual o modelo do aparelho?");
    const conv = (await listConversations(gestor))[0];
    expect(conv).toMatchObject({ ai_enabled: true, handled_by: "ai" });
    expect((await getConversation(gestor, conv.id)).messages.at(-1)).toMatchObject({ sender_type: "ai", direction: "outbound" });
  });

  it("lead qualificado e pedido de orçamento: etiqueta, negociação no CRM e transferência ao vendedor", async () => {
    nextAi = { reply: "Perfeito, Joana!", qualified: true, handoff: true, handoff_reason: "pediu orçamento", intent: "compra", summary: "Quer instalar 2 splits 12.000 BTUs" };
    await inbound("A3", "Quero orçamento para 2 aparelhos 12 mil BTUs");
    await runAiJobs();
    expect(sent.at(-1)!.body.text).toBe("Perfeito, Joana!\n\nVou chamar um especialista.");
    const conv = (await listConversations(vend))[0];
    expect(conv).toMatchObject({ ai_enabled: false, handled_by: "human", assigned_name: "Vend F8" });
    expect(conv.tags.map((t) => t.name)).toContain("Qualificado pela IA");
    expect((await listContacts(vend)).rows[0].commercial_status).toBe("qualified");
    const card = (await getBoard(vend)).cards[0];
    expect(card).toMatchObject({ title: "Lead qualificado pela IA", notes: "Resumo da IA: Quer instalar 2 splits 12.000 BTUs" });
    // depois da transferência a IA não responde mais
    aiCalls.length = 0;
    await inbound("A4", "Obrigada!"); await runAiJobs();
    expect(aiCalls).toHaveLength(0);
  });

  it("fora do horário: mensagem de ausência uma vez, sem chamar a IA", async () => {
    await saveAiSettings(gestor, { enabled: true, agentName: "Lia", autoReplyNew: true, hoursEnabled: true, days: [], start: "08:00", end: "18:00", outsideHoursMessage: "Estamos fora do horário. Respondemos amanhã!" });
    await inbound("B1", "Olá?", "5591944440002"); await runAiJobs();
    await inbound("B2", "Alguém?", "5591944440002"); await runAiJobs();
    expect(aiCalls).toHaveLength(0);
    expect(sent.filter((s) => s.body.text === "Estamos fora do horário. Respondemos amanhã!")).toHaveLength(1);
    expect(withinHours({ enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" })).toBe(true);
  });

  it("resposta fora do formato: envia o texto e transfere por segurança", async () => {
    await saveAiSettings(gestor, { enabled: true, agentName: "Lia", autoReplyNew: true, hoursEnabled: false });
    nextAi = "não é json" as unknown as Record<string, unknown>;
    await inbound("C1", "Oi", "5591944440003"); await runAiJobs();
    const c = (await listConversations(gestor)).find((x) => x.phone_e164 === "+5591944440003")!;
    expect(c).toMatchObject({ handled_by: "human", ai_enabled: false });
  });

  it("sem provedor configurado: mensagem clara; IA desligada pelo vendedor não responde", async () => {
    delete process.env.AI_PROVIDER; delete process.env.AI_BASE_URL;
    await expectError(testAgent(gestor, [{ role: "user", content: "oi" }]), "INTEGRATION", /não foi configurada/);
    const c = (await listConversations(gestor)).find((x) => x.phone_e164 === "+5591944440003")!;
    await setConversationAi(gestor, c.id, false);
    expect((await getConversation(gestor, c.id)).conv.ai_enabled).toBe(false);
  });

  it("isolamento: outra empresa não vê nem apaga o contexto", async () => {
    const mine = (await listKnowledge(gestor)).entries[0];
    expect((await listKnowledge(outro)).entries.map((e) => e.title)).toEqual(["Preço SECRETO da outra empresa"]);
    await deleteKnowledge(outro, mine.id);
    expect((await listKnowledge(gestor)).entries).toHaveLength(2);
    void otherId;
  });
});
