import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { closePool } from "@/server/db";
import { createCompany } from "@/server/services/companies";
import { createContact, listContacts } from "@/server/services/contacts";
import { campaignTransition, getCampaign, saveCampaign } from "@/server/services/campaigns";
import { disconnectNumber, listConnections, pollQrConnection, setConnectionMembers, startQrConnection } from "@/server/services/whatsapp";
import { authenticateEvolution, peerOf, processEvolutionWebhook } from "@/server/webhooks/evolution";
import { runWorkerOnce } from "@/server/jobs/worker";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/core";
import { ADMIN, loginAs } from "./helpers";

// ---------- simulador local da Evolution API (somente teste) ----------
type Call = { method: string; path: string; body: Record<string, unknown> | null; apikey: string | null };
const calls: Call[] = [];
const state = new Map<string, string>();
let seq = 0;
function evo() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url); const path = u.pathname + u.search; const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init?.method ?? "GET", path, body, apikey: (init?.headers as Record<string, string>)?.apikey ?? null });
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (u.pathname === "/instance/create") { state.set(body.instanceName, "close"); return ok({ instance: { instanceName: body.instanceName }, hash: "H", qrcode: { base64: "data:image/png;base64,QR1", code: "1@abc" } }); }
    const name = decodeURIComponent(u.pathname.split("/").pop()!);
    if (u.pathname.startsWith("/instance/connectionState/")) return state.has(name) ? ok({ instance: { instanceName: name, state: state.get(name) } }) : new Response("{}", { status: 404 });
    if (u.pathname.startsWith("/instance/connect/")) return ok(u.searchParams.get("number") ? { pairingCode: "ABCD-1234", code: "2@x" } : { base64: "data:image/png;base64,QR2", code: "2@x" });
    if (u.pathname.startsWith("/instance/logout/")) { state.set(name, "close"); return ok({ status: "SUCCESS" }); }
    if (u.pathname.startsWith("/instance/delete/")) { state.delete(name); return ok({ status: "SUCCESS" }); }
    if (u.pathname.startsWith("/message/sendText/")) return ok({ key: { id: `EVO${++seq}`, remoteJid: `${body.number}@s.whatsapp.net`, fromMe: true } });
    return new Response("{}", { status: 404 });
  });
}
const owner = async <T>(fn: (c: Client) => Promise<T>) => { const c = new Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL }); await c.connect(); try { return await fn(c); } finally { await c.end(); } };
const expectError = async (p: Promise<unknown>, code: AppError["code"], msg?: RegExp) => {
  const e = await p.then(() => null, (err) => err); expect(e, "deveria ter falhado").toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code); if (msg) expect((e as AppError).message).toMatch(msg);
};

let admin: AuthContext, gestor: AuthContext, vend: AuthContext, outro: AuthContext;
let connId: string; let instance: string; let secret: string;

beforeAll(async () => {
  admin = await loginAs(ADMIN.username, ADMIN.password);
  await createCompany(admin, { name: "QR Code F5b", users: [
    { name: "Gestor QR", username: "gestor.qr", password: "gestorsenha", role: "company_admin" },
    { name: "Vend QR", username: "vend.qr", password: "vendsenha1", role: "seller" }] });
  await createCompany(admin, { name: "Outra QR", users: [{ name: "Outro", username: "outro.qr", password: "outrosenha", role: "company_admin" }] });
  gestor = await loginAs("gestor.qr", "gestorsenha"); vend = await loginAs("vend.qr", "vendsenha1"); outro = await loginAs("outro.qr", "outrosenha");
});
beforeEach(() => { vi.stubGlobal("fetch", evo()); calls.length = 0; process.env.EVOLUTION_API_URL = "http://evolution.local"; process.env.EVOLUTION_API_KEY = "chave-global-evo"; process.env.APP_URL = "https://app.marktvision.test"; });
afterAll(async () => { vi.unstubAllGlobals(); await closePool(); });

const upsert = (m: Record<string, unknown>) => processEvolutionWebhook({ event: "messages.upsert", instance, data: m });

describe("Conexão por QR Code (Evolution API)", () => {
  it("sem servidor configurado: mensagem clara", async () => {
    delete process.env.EVOLUTION_API_URL;
    await expectError(startQrConnection(gestor, "Comercial"), "INTEGRATION", /EVOLUTION_API_URL/);
  });

  it("vendedor não conecta", async () => {
    await expectError(startQrConnection(vend, "Comercial"), "FORBIDDEN");
  });

  it("cria sessão própria da empresa com webhook e segredo individual; QR devolvido", async () => {
    const r = await startQrConnection(gestor, "Comercial");
    connId = r.id;
    expect(r.qr.base64).toBe("data:image/png;base64,QR1");
    const create = calls.find((c) => c.path === "/instance/create")!;
    instance = String(create.body!.instanceName);
    expect(instance).toMatch(/^mv-[0-9a-f]{8}-[0-9a-f]{6}$/);
    expect(create.apikey).toBe("chave-global-evo");
    expect(create.body).toMatchObject({ qrcode: true, integration: "WHATSAPP-BAILEYS", groupsIgnore: true,
      webhook: { enabled: true, url: "https://app.marktvision.test/api/webhooks/evolution", events: expect.arrayContaining(["MESSAGES_UPSERT", "CONNECTION_UPDATE"]) } });
    secret = String((create.body!.webhook as { headers: Record<string, string> }).headers["x-mv-webhook-secret"]);
    const row = await owner((db) => db.query(`select status, provider, connection_mode, webhook_secret_hash from whatsapp_connections where id = $1`, [connId]));
    expect(row.rows[0]).toMatchObject({ status: "pending", provider: "evolution", connection_mode: "qr" });
    expect(row.rows[0].webhook_secret_hash).not.toContain(secret);
  });

  it("enquanto não escaneia: QR renovado; com número: código de pareamento", async () => {
    expect((await pollQrConnection(gestor, connId)).qr?.base64).toBe("data:image/png;base64,QR2");
    expect((await pollQrConnection(gestor, connId, "(91) 98888-0000")).qr?.pairingCode).toBe("ABCD-1234");
    expect(calls.some((c) => c.path.includes("number=91988880000"))).toBe(true);
  });

  it("outra empresa não consulta a sessão", async () => {
    await expectError(pollQrConnection(outro, connId), "NOT_FOUND");
  });

  it("webhook exige o segredo da sessão", async () => {
    expect(await authenticateEvolution(instance, secret)).toBe(true);
    expect(await authenticateEvolution(instance, "errado")).toBe(false);
    expect(await authenticateEvolution("mv-inexistente", secret)).toBe(false);
  });

  it("escaneou: conexão aberta registra o número", async () => {
    state.set(instance, "open");
    await processEvolutionWebhook({ event: "connection.update", instance, data: { state: "open", wuid: "5591930001111@s.whatsapp.net" } });
    expect((await pollQrConnection(gestor, connId)).connected).toBe(true);
    expect((await listConnections(gestor)).find((c) => c.id === connId)).toMatchObject({ status: "connected", phone_number: "+5591930001111" });
    await setConnectionMembers(gestor, connId, [vend.user.id]);
  });

  it("identifica contato por telefone, por LID com número alternativo, e ignora grupos", () => {
    expect(peerOf({ remoteJid: "5591988887777@s.whatsapp.net" })).toEqual({ phone: "5591988887777", userId: null });
    expect(peerOf({ remoteJid: "123456@lid", remoteJidAlt: "5591988887777@s.whatsapp.net" })).toEqual({ phone: "5591988887777", userId: "123456@lid" });
    expect(peerOf({ remoteJid: "120363@g.us" })).toBeNull();
    expect(peerOf({ remoteJid: "status@broadcast" })).toBeNull();
  });

  it("mensagem recebida: contato, conversa com o vendedor do número, idempotente", async () => {
    const m = { key: { remoteJid: "5591977771111@s.whatsapp.net", fromMe: false, id: "MSG1" }, pushName: "Lia Cliente", message: { conversation: "Bom dia, quero orçamento" }, messageType: "conversation", messageTimestamp: Math.floor(Date.now() / 1000) };
    await upsert(m); await upsert(m);
    await upsert({ key: { remoteJid: "120363@g.us", fromMe: false, id: "GRP1", participant: "x" }, message: { conversation: "grupo" } });
    const c = (await listContacts(gestor, { q: "Lia Cliente" })).rows[0];
    expect(c).toMatchObject({ source: "whatsapp", phone_e164: "+5591977771111" });
    const conv = await owner((db) => db.query(`select assigned_user_id, unread_count, (select count(*)::int from messages m where m.conversation_id = c.id) as n from conversations c where contact_id = $1`, [c.id]));
    expect(conv.rows[0]).toMatchObject({ assigned_user_id: vend.user.id, unread_count: 1, n: 1 });
    expect((await listContacts(gestor, { q: "grupo" })).total).toBe(0);
  });

  it("mensagem enviada pelo celular aparece como saída", async () => {
    await upsert({ key: { remoteJid: "5591977771111@s.whatsapp.net", fromMe: true, id: "MSG2" }, message: { extendedTextMessage: { text: "Claro! Envio já." } }, messageTimestamp: Math.floor(Date.now() / 1000) });
    const r = await owner((db) => db.query(`select direction, channel from messages where provider_message_id = 'MSG2'`));
    expect(r.rows[0]).toEqual({ direction: "outbound", channel: "business_app" });
  });

  it("campanha pela conexão QR: envia texto livre, status de entrega e resposta atualizam a campanha", async () => {
    const ids = [(await createContact(gestor, { name: "Rafa Lima", phone: "91 98600-0001" })).id, (await createContact(gestor, { name: "Sol Dias", phone: "91 98600-0002" })).id];
    const id = (await saveCampaign(gestor, { name: "Campanha QR", whatsappConnectionId: connId, messageBody: "Oi {{primeiro_nome}}!", contactIds: ids })).id;
    await campaignTransition(gestor, id, "start");
    await runWorkerOnce();
    const sends = calls.filter((c) => c.path.startsWith(`/message/sendText/${instance}`));
    expect(sends.map((s) => s.body)).toEqual(expect.arrayContaining([{ number: "5591986000001", text: "Oi Rafa!" }, { number: "5591986000002", text: "Oi Sol!" }]));
    const msgs = await owner((db) => db.query(`select provider_message_id from messages where campaign_id = $1 order by provider_message_id`, [id]));
    // eco do próprio envio (fromMe) não duplica
    await upsert({ key: { remoteJid: "5591986000001@s.whatsapp.net", fromMe: true, id: msgs.rows[0].provider_message_id }, message: { conversation: "Oi Rafa!" } });
    await processEvolutionWebhook({ event: "messages.update", instance, data: { keyId: msgs.rows[0].provider_message_id, fromMe: true, status: "DELIVERY_ACK" } });
    await processEvolutionWebhook({ event: "messages.update", instance, data: { keyId: msgs.rows[1].provider_message_id, fromMe: true, status: "READ" } });
    await upsert({ key: { remoteJid: "5591986000001@s.whatsapp.net", fromMe: false, id: "R1" }, pushName: "Rafa", message: { conversation: "Tenho interesse" } });
    const r = await getCampaign(gestor, id);
    expect(r.campaign).toMatchObject({ status: "completed", total: 2, sent: 2, delivered: 2, replies: 1 });
    const dup = await owner((db) => db.query(`select count(*)::int as n from messages where campaign_id = $1`, [id]));
    expect(dup.rows[0].n).toBe(2);
  });

  it("SAIR descadastra e confirma (sem regra de 24h nesta modalidade)", async () => {
    await upsert({ key: { remoteJid: "5591986000002@s.whatsapp.net", fromMe: false, id: "S1" }, message: { conversation: "Parar" } });
    calls.length = 0;
    await runWorkerOnce();
    expect(calls.find((c) => c.path.startsWith("/message/sendText/"))?.body).toMatchObject({ number: "5591986000002", text: expect.stringMatching(/não receberá mais/) });
    expect((await listContacts(gestor, { q: "Sol Dias" })).rows[0].consent_status).toBe("opted_out");
  });

  it("desconexão pelo celular, desconectar e excluir pela plataforma", async () => {
    await processEvolutionWebhook({ event: "connection.update", instance, data: { state: "close", statusReason: 401 } });
    expect((await listConnections(gestor)).find((c) => c.id === connId)).toMatchObject({ status: "disconnected", last_error: expect.stringMatching(/novo QR Code/) });
    calls.length = 0;
    await disconnectNumber(gestor, connId, true);
    expect(calls.map((c) => c.method + " " + c.path)).toEqual([`DELETE /instance/delete/${instance}`]);
    expect(await listConnections(gestor)).toEqual([]);
  });
});
