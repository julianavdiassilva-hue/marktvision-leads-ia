import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { closePool } from "@/server/db";
import { createCompany } from "@/server/services/companies";
import { listContacts, getContact } from "@/server/services/contacts";
import {
  assumeConversation, createOpportunityFromConversation, getConversation, listConversations, listQuickReplies, saveContactNotes,
  saveQuickReply, sendFile, sendMessage, setConversationAi, setConversationStatus, setFollowUp, suggestReply, transferConversation, unreadCount,
} from "@/server/services/conversations";
import { setUserFeature } from "@/server/services/users";
import { processEvolutionWebhook } from "@/server/webhooks/evolution";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/core";
import { ADMIN, loginAs } from "./helpers";

const sent: { path: string; body: Record<string, unknown> }[] = [];
let seq = 0; let failNext = false;
const evo = () => vi.fn(async (url: string, init?: RequestInit) => {
  const u = new URL(url); const body = init?.body ? JSON.parse(String(init.body)) : {};
  sent.push({ path: u.pathname, body });
  if (failNext) { failNext = false; return new Response("{}", { status: 500 }); }
  return new Response(JSON.stringify({ key: { id: `OUT${++seq}` } }), { status: 200 });
});
const owner = async <T>(fn: (c: Client) => Promise<T>) => { const c = new Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL }); await c.connect(); try { return await fn(c); } finally { await c.end(); } };
const expectError = async (p: Promise<unknown>, code: AppError["code"], msg?: RegExp) => {
  const e = await p.then(() => null, (err) => err); expect(e, "deveria ter falhado").toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code); if (msg) expect((e as AppError).message).toMatch(msg);
};

let admin: AuthContext, gestor: AuthContext, v1: AuthContext, v2: AuthContext, outro: AuthContext;
let companyId: string; let convId: string; const instance = "mv-f6-teste";

beforeAll(async () => {
  admin = await loginAs(ADMIN.username, ADMIN.password);
  companyId = (await createCompany(admin, { name: "Conversas F6", users: [
    { name: "Gestor F6", username: "gestor.f6", password: "gestorsenha", role: "company_admin" },
    { name: "Vend Um F6", username: "v1.f6", password: "v1senha123", role: "seller" },
    { name: "Vend Dois F6", username: "v2.f6", password: "v2senha123", role: "seller" }] })).id;
  await createCompany(admin, { name: "Outra F6", users: [{ name: "Outro", username: "outro.f6", password: "outrosenha", role: "company_admin" }] });
  gestor = await loginAs("gestor.f6", "gestorsenha"); v1 = await loginAs("v1.f6", "v1senha123"); v2 = await loginAs("v2.f6", "v2senha123"); outro = await loginAs("outro.f6", "outrosenha");
  await owner(async (db) => {
    await db.query("begin"); await db.query("select set_config('app.system','on',true)");
    const w = await db.query(`insert into whatsapp_connections (company_id, provider, connection_mode, display_name, instance_name, status, phone_number)
                              values ($1,'evolution','qr','Comercial',$2,'connected','+559130006666') returning id`, [companyId, instance]);
    await db.query(`insert into whatsapp_connection_members (company_id, connection_id, user_id) values ($1,$2,$3)`, [companyId, w.rows[0].id, v1.user.id]);
    await db.query("commit");
  });
  process.env.EVOLUTION_API_URL = "http://evolution.local"; process.env.EVOLUTION_API_KEY = "k";
});
beforeEach(() => { vi.stubGlobal("fetch", evo()); sent.length = 0; });
afterAll(async () => { vi.unstubAllGlobals(); await closePool(); });

const inbound = (id: string, text: string, phone = "5591955551111", name = "Marina Cliente") =>
  processEvolutionWebhook({ event: "messages.upsert", instance, data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id }, pushName: name, message: { conversation: text }, messageTimestamp: Math.floor(Date.now() / 1000) } });

describe("Fase 06 — central de conversas", () => {
  it("mensagem recebida aparece para o vendedor do número, com não lidas", async () => {
    await inbound("IN1", "Olá, quero saber preços");
    await inbound("IN2", "Vocês atendem em Ananindeua?");
    const list = await listConversations(v1);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ contact_name: "Marina Cliente", unread_count: 2, last_message_preview: "Vocês atendem em Ananindeua?", assigned_name: "Vend Um F6" });
    convId = list[0].id;
    expect(await unreadCount(v1)).toBe(2);
    expect(await listConversations(v2)).toHaveLength(0);
    expect((await listConversations(gestor)).map((c) => c.id)).toEqual([convId]);
  });

  it("abrir marca como lida e mostra o histórico completo", async () => {
    const d = await getConversation(v1, convId);
    expect(d.messages.map((m) => m.body)).toEqual(["Olá, quero saber preços", "Vocês atendem em Ananindeua?"]);
    expect(d.conv.connection_name).toBe("Comercial");
    expect(await unreadCount(v1)).toBe(0);
  });

  it("vendedor responde: envio real pelo provedor, histórico e IA desligada", async () => {
    await setConversationAi(gestor, convId, false).catch(() => {});
    await sendMessage(v1, convId, "Olá Marina! Atendemos sim.");
    expect(sent[0]).toMatchObject({ path: `/message/sendText/${instance}`, body: { number: "5591955551111", text: "Olá Marina! Atendemos sim." } });
    const d = await getConversation(v1, convId);
    expect(d.messages.at(-1)).toMatchObject({ direction: "outbound", sender_type: "user", sender_name: "Vend Um F6", status: "sent" });
    expect(d.conv.handled_by).toBe("human");
    expect((await listContacts(gestor, { q: "Marina" })).rows[0].commercial_status).toBe("in_progress");
  });

  it("falha no envio é informada e registrada (sem fingir sucesso)", async () => {
    failNext = true;
    await expectError(sendMessage(v1, convId, "teste falha"), "INTEGRATION", /não enviada/);
    const d = await getConversation(v1, convId);
    expect(d.messages.at(-1)).toMatchObject({ body: "teste falha", status: "failed" });
  });

  it("envio de arquivo (imagem) pelo provedor", async () => {
    await sendFile(v1, convId, { name: "catalogo.png", type: "image/png", base64: Buffer.from("png").toString("base64"), caption: "Nosso catálogo" });
    expect(sent.at(-1)).toMatchObject({ path: `/message/sendMedia/${instance}`, body: { mediatype: "image", mimetype: "image/png", fileName: "catalogo.png", caption: "Nosso catálogo" } });
    expect((await getConversation(v1, convId)).messages.at(-1)).toMatchObject({ media_type: "image", body: "Nosso catálogo" });
  });

  it("IA por conversa: ligar exige Chatbot IA; vendedor assumir desliga a IA", async () => {
    await expectError(setConversationAi(v1, convId, true), "FORBIDDEN", /Chatbot IA/);
    await setConversationAi(gestor, convId, true);
    expect((await getConversation(gestor, convId)).conv).toMatchObject({ ai_enabled: true, handled_by: "ai" });
    await assumeConversation(v1, convId);
    expect((await getConversation(gestor, convId)).conv).toMatchObject({ ai_enabled: false, handled_by: "human" });
  });

  it("transferência entre vendedores leva junto o contato (Contatos e CRM)", async () => {
    await expectError(transferConversation(v2, convId, v2.user.id), "NOT_FOUND");
    await transferConversation(v1, convId, v2.user.id);
    expect(await listConversations(v1)).toHaveLength(0);
    expect((await listConversations(v2)).map((c) => c.id)).toEqual([convId]);
    expect((await listContacts(v2, { q: "Marina" })).total).toBe(1);
    const c = (await listContacts(gestor, { q: "Marina" })).rows[0];
    expect((await getContact(gestor, c.id)).events.map((e) => e.type)).toContain("conversation.transferred");
  });

  it("negociação no CRM a partir da conversa, com campanha/conversa vinculadas e sem duplicar", async () => {
    const a = await createOpportunityFromConversation(v2, convId);
    const b = await createOpportunityFromConversation(v2, convId);
    expect(b).toEqual({ id: a.id, existed: true });
    const d = await getConversation(v2, convId);
    expect(d.opportunity).toMatchObject({ id: a.id, stage: "Novo lead", status: "open" });
  });

  it("próximo retorno, observações e encerramento", async () => {
    const when = new Date(Date.now() + 86400_000).toISOString();
    await setFollowUp(v2, convId, when);
    await saveContactNotes(v2, convId, "Quer orçamento de 3 aparelhos");
    await setConversationStatus(v2, convId, "closed");
    expect(await listConversations(v2)).toHaveLength(0);
    expect((await listConversations(v2, { filter: "closed" })).map((c) => c.id)).toEqual([convId]);
    const d = await getConversation(v2, convId);
    expect(d.conv.notes).toBe("Quer orçamento de 3 aparelhos");
    expect(new Date(d.conv.next_follow_up_at!).toISOString()).toBe(when);
    await inbound("IN3", "Voltei!");
    expect((await listConversations(v2)).map((c) => c.id)).toEqual([convId]); // nova mensagem reabre
  });

  it("respostas rápidas", async () => {
    await saveQuickReply(gestor, { shortcut: "/horario", body: "Atendemos de 8h às 18h." });
    await expectError(saveQuickReply(gestor, { shortcut: "com espaço", body: "x" }), "VALIDATION");
    expect((await listQuickReplies(v1)).map((q) => q.shortcut)).toEqual(["horario"]);
  });

  it("sugestão com IA exige a funcionalidade e a chave", async () => {
    await expectError(suggestReply(v2, convId), "FORBIDDEN").catch(async () => {
      // vendedores têm "Mensagens com IA" por padrão; sem chave a mensagem é clara
      delete process.env.ANTHROPIC_API_KEY;
      await expectError(suggestReply(v2, convId), "INTEGRATION", /ANTHROPIC_API_KEY/);
    });
    await setUserFeature(gestor, v2.user.id, "ai_messages", false);
    await expectError(suggestReply(await loginAs("v2.f6", "v2senha123"), convId), "FORBIDDEN");
  });

  it("isolamento: outra empresa não vê nem envia", async () => {
    expect(await listConversations(outro)).toEqual([]);
    await expectError(getConversation(outro, convId), "NOT_FOUND");
    await expectError(sendMessage(outro, convId, "invasão"), "NOT_FOUND");
  });
});
