import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { Client } from "pg";
import { closePool } from "@/server/db";
import { createCompany } from "@/server/services/companies";
import { createContact, getContact, listContacts, setConsent } from "@/server/services/contacts";
import { campaignTransition, getCampaign, saveCampaign } from "@/server/services/campaigns";
import { completeEmbeddedSignup, connectionMembers, disconnectNumber, listConnections, listTemplates, setConnectionMembers, syncTemplates, testConnection } from "@/server/services/whatsapp";
import { processWhatsAppWebhook, validSignature } from "@/server/webhooks/whatsapp";
import { runWorkerOnce } from "@/server/jobs/worker";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/core";
import { ADMIN, loginAs } from "./helpers";

// ---------- simulador local da Graph API (somente teste) ----------
type Call = { method: string; path: string; body: Record<string, unknown> | null; auth: string | null };
const calls: Call[] = [];
let seq = 0;
const failFor = new Map<string, { status: number; code: number }>();
function graph() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url); const path = u.pathname.replace(/^\/v\d+\.\d+\//, "");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init?.method ?? "GET", path: path + (u.search && path.includes("oauth") ? "" : ""), body, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null });
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (path === "oauth/access_token") return u.searchParams.get("code") === "codigo-valido" ? ok({ access_token: `token-${u.searchParams.get("client_id")}-${++seq}`, token_type: "bearer" }) : new Response(JSON.stringify({ error: { code: 100 } }), { status: 400 });
    if (path.endsWith("/phone_numbers")) return ok({ data: [{ id: path.startsWith("900") ? "9001" : "8001", display_phone_number: path.startsWith("900") ? "+55 91 3000-9001" : "+55 91 3000-8001", is_on_biz_app: true }] });
    if (path.endsWith("/subscribed_apps")) return ok({ success: true });
    if (path.endsWith("/register")) return ok({ success: true });
    if (path.endsWith("/smb_app_data")) return ok({ messaging_product: "whatsapp", request_id: "req-" + body?.sync_type });
    if (path.endsWith("/message_templates")) return ok({ data: [
      { name: "primeiro_contato", language: "pt_BR", status: "APPROVED", category: "MARKETING", components: [{ type: "BODY", text: "Olá {{1}}, aqui é da {{2}}. Podemos conversar?" }] },
      { name: "em_analise", language: "pt_BR", status: "PENDING", components: [{ type: "BODY", text: "x" }] }] });
    if (path.endsWith("/messages")) {
      const f = failFor.get(String(body?.to));
      if (f) return new Response(JSON.stringify({ error: { code: f.code, message: "erro" } }), { status: f.status });
      return ok({ messages: [{ id: `wamid.${++seq}` }] });
    }
    const pid = path.split("/")[0];
    return ok({ display_phone_number: pid === "9001" ? "+55 91 3000-9001" : pid === "7001" ? "+55 91 3000-7001" : "+55 91 3000-8001", verified_name: "Empresa Teste", quality_rating: "GREEN" });
  });
}
const owner = async <T>(fn: (c: Client) => Promise<T>) => { const c = new Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL }); await c.connect(); try { return await fn(c); } finally { await c.end(); } };
const msgPayload = (pid: string, value: Record<string, unknown>, field = "messages") => ({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field, value: { messaging_product: "whatsapp", metadata: { phone_number_id: pid }, ...value } }] }] });
const expectError = async (p: Promise<unknown>, code: AppError["code"], msg?: RegExp) => {
  const e = await p.then(() => null, (err) => err); expect(e, "deveria ter falhado").toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code); if (msg) expect((e as AppError).message).toMatch(msg);
};

let admin: AuthContext, gestor: AuthContext, vend: AuthContext, outro: AuthContext;
let companyId: string; let coexId: string; let cloudId: string;

beforeAll(async () => {
  admin = await loginAs(ADMIN.username, ADMIN.password);
  companyId = (await createCompany(admin, { name: "WhatsApp F5", users: [
    { name: "Gestor F5", username: "gestor.f5", password: "gestorsenha", role: "company_admin" },
    { name: "Vend F5", username: "vend.f5", password: "vendsenha1", role: "seller" }] })).id;
  await createCompany(admin, { name: "Outra F5", users: [{ name: "Outro", username: "outro.f5", password: "outrosenha", role: "company_admin" }] });
  gestor = await loginAs("gestor.f5", "gestorsenha"); vend = await loginAs("vend.f5", "vendsenha1"); outro = await loginAs("outro.f5", "outrosenha");
});
beforeEach(() => { vi.stubGlobal("fetch", graph()); calls.length = 0; process.env.META_APP_ID = "app123"; process.env.META_APP_SECRET = "segredo-app"; process.env.ENCRYPTION_KEY ||= "chave-de-teste-com-mais-de-16"; });
afterAll(async () => { vi.unstubAllGlobals(); await closePool(); });

describe("Fase 05 — conexão pelo próprio cliente (Embedded Signup)", () => {
  it("sem credenciais da plataforma na Meta: mensagem clara", async () => {
    delete process.env.META_APP_ID;
    await expectError(completeEmbeddedSignup(gestor, { code: "codigo-valido", event: "FINISH", wabaId: "800", phoneNumberId: "8001" }), "INTEGRATION", /META_APP_ID/);
  });

  it("vendedor não conecta números", async () => {
    await expectError(completeEmbeddedSignup(vend, { code: "codigo-valido", event: "FINISH", wabaId: "800", phoneNumberId: "8001" }), "FORBIDDEN");
  });

  it("coexistência: troca o código, inscreve o WABA, NÃO registra o número e agenda a sincronização", async () => {
    const r = await completeEmbeddedSignup(gestor, { code: "codigo-valido", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", wabaId: "900" });
    coexId = r.id;
    expect(r.mode).toBe("coexistence");
    expect(calls.map((c) => c.path)).toEqual(["oauth/access_token", "900/phone_numbers", "900/subscribed_apps", "9001"]);
    const [c] = (await listConnections(gestor)).filter((x) => x.id === coexId);
    expect(c).toMatchObject({ status: "connected", connection_mode: "coexistence", phone_number: "+55 91 3000-9001", phone_number_id: "9001" });
    const stored = await owner((db) => db.query(`select credentials_encrypted from whatsapp_connections where id = $1`, [coexId]));
    expect(stored.rows[0].credentials_encrypted).toMatch(/^v1:/);
    expect(stored.rows[0].credentials_encrypted).not.toContain("token-app123");
    calls.length = 0;
    await runWorkerOnce();
    expect(calls.filter((x) => x.path === "9001/smb_app_data").map((x) => x.body?.sync_type)).toEqual(["smb_app_state_sync", "history"]);
    expect(calls.every((x) => x.auth?.startsWith("Bearer token-app123"))).toBe(true);
  });

  it("número novo (Cloud API): registra com PIN de 6 dígitos guardado criptografado", async () => {
    const r = await completeEmbeddedSignup(gestor, { code: "codigo-valido", event: "FINISH", wabaId: "800", phoneNumberId: "8001", displayName: "Comercial" });
    cloudId = r.id;
    const reg = calls.find((c) => c.path === "8001/register")!;
    expect(String(reg.body?.pin)).toMatch(/^\d{6}$/);
    const pin = await owner((db) => db.query(`select register_pin_encrypted from whatsapp_connections where id = $1`, [cloudId]));
    expect(pin.rows[0].register_pin_encrypted).toMatch(/^v1:/);
  });

  it("código expirado/inválido: orientação para refazer", async () => {
    await expectError(completeEmbeddedSignup(gestor, { code: "codigo-expirado", event: "FINISH", wabaId: "800", phoneNumberId: "8001" }), "INTEGRATION", /expira em 5 minutos/);
  });

  it("o mesmo número não pode ser conectado por outra empresa; reconexão na mesma empresa atualiza", async () => {
    await expectError(completeEmbeddedSignup(outro, { code: "codigo-valido", event: "FINISH", wabaId: "800", phoneNumberId: "8001" }), "CONFLICT", /outra empresa/);
    const again = await completeEmbeddedSignup(gestor, { code: "codigo-valido", event: "FINISH", wabaId: "800", phoneNumberId: "8001" });
    expect(again).toMatchObject({ id: cloudId, reconnected: true });
    expect(await listConnections(outro)).toEqual([]);
  });

  it("vendedores responsáveis por número e testes de conexão", async () => {
    await setConnectionMembers(gestor, cloudId, [vend.user.id]);
    expect((await connectionMembers(gestor)).map((m) => m.name)).toEqual(["Vend F5"]);
    expect((await testConnection(gestor, cloudId)).ok).toBe(true);
  });
});

describe("Fase 05 — envio de campanhas pela fila", () => {
  let campaignId: string; const ids: string[] = [];
  it("sincroniza modelos aprovados", async () => {
    expect(await syncTemplates(gestor, cloudId)).toEqual({ total: 2, approved: 1 });
    expect((await listTemplates(gestor)).map((t) => [t.name, t.params])).toEqual([["primeiro_contato", 2]]);
  });

  it("dispara com modelo aprovado, personaliza parâmetros e registra tudo; contato descadastrado é ignorado", async () => {
    for (const [n, p] of [["Ana Lima", "91 98500-0001"], ["Bia Souza", "91 98500-0002"], ["Caio Reis", "91 98500-0003"], ["Duda Alves", "91 98500-0004"]])
      ids.push((await createContact(gestor, { name: n, phone: p })).id);
    await setConsent(gestor, [ids[3]], "opted_out", "pediu");
    failFor.set("5591985000003", { status: 400, code: 131026 });
    const t = (await listTemplates(gestor))[0];
    campaignId = (await saveCampaign(gestor, { name: "Envio real", whatsappConnectionId: cloudId, templateId: t.id, templateParams: ["primeiro_nome", "minha_empresa"], contactIds: ids })).id;
    await campaignTransition(gestor, campaignId, "start");
    await runWorkerOnce();
    const sends = calls.filter((c) => c.path === "8001/messages");
    expect(sends).toHaveLength(3);
    expect(sends.find((x) => x.body?.to === "5591985000001")?.body).toMatchObject({ to: "5591985000001", type: "template", template: { name: "primeiro_contato", language: { code: "pt_BR" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "WhatsApp F5" }] }] } });
    const { campaign, contacts } = await getCampaign(gestor, campaignId);
    expect(campaign).toMatchObject({ status: "completed", sent: 2, failed: 1, skipped: 1 });
    expect(contacts.find((c) => c.name === "Caio Reis")?.error).toMatch(/não pode receber/);
    const hist = await owner((db) => db.query(`select body, channel, sender_type from messages where campaign_id = $1 and body like 'Olá Ana%'`, [campaignId]));
    expect(hist.rows[0]).toMatchObject({ body: "Olá Ana, aqui é da WhatsApp F5. Podemos conversar?", channel: "api", sender_type: "campaign" });
    // conversas atribuídas ao vendedor do número
    const conv = await owner((db) => db.query(`select assigned_user_id, origin_campaign_id from conversations where contact_id = $1`, [ids[0]]));
    expect(conv.rows[0]).toMatchObject({ assigned_user_id: vend.user.id, origin_campaign_id: campaignId });
  });

  it("sem modelo e com janela de 24h fechada: não envia (regra da Meta)", async () => {
    const id = (await saveCampaign(gestor, { name: "Texto livre", whatsappConnectionId: cloudId, messageBody: "Oi {{primeiro_nome}}", contactIds: [ids[1]] })).id;
    await campaignTransition(gestor, id, "start");
    calls.length = 0;
    await runWorkerOnce();
    expect(calls.filter((c) => c.path.endsWith("/messages"))).toHaveLength(0);
    expect((await getCampaign(gestor, id)).contacts[0].error).toMatch(/janela de 24h/);
  });

  it("erro temporário volta à fila; após 3 tentativas registra falha; nunca duplica", async () => {
    const c = (await createContact(gestor, { name: "Eva Temp", phone: "91 98500-0005" })).id;
    failFor.set("5591985000005", { status: 503, code: 1 });
    const t = (await listTemplates(gestor))[0];
    const id = (await saveCampaign(gestor, { name: "Retentativa", whatsappConnectionId: cloudId, templateId: t.id, templateParams: ["primeiro_nome", "minha_empresa"], contactIds: [c] })).id;
    await campaignTransition(gestor, id, "start");
    for (let i = 0; i < 3; i++) { await runWorkerOnce(); await owner((db) => db.query(`update jobs set run_at = now() where payload->>'campaignId' = $1 and status = 'pending'`, [id])); }
    const r = await getCampaign(gestor, id);
    expect(r.campaign.failed).toBe(1);
    expect(calls.filter((x) => x.body?.to === "5591985000005")).toHaveLength(3);
    failFor.clear();
  });

  it("WhatsApp desconectado pausa a campanha sem perder os pendentes", async () => {
    const c = (await createContact(gestor, { name: "Fabi", phone: "91 98500-0006" })).id;
    const t = (await listTemplates(gestor))[0];
    const id = (await saveCampaign(gestor, { name: "Pausa automática", whatsappConnectionId: cloudId, templateId: t.id, templateParams: ["primeiro_nome", "minha_empresa"], contactIds: [c] })).id;
    await campaignTransition(gestor, id, "start");
    await owner((db) => db.query(`update whatsapp_connections set status = 'error' where id = $1`, [cloudId]));
    await runWorkerOnce();
    const r = await getCampaign(gestor, id);
    expect(r.campaign).toMatchObject({ status: "paused", pending: 1 });
    await owner((db) => db.query(`update whatsapp_connections set status = 'connected' where id = $1`, [cloudId]));
  });
});

describe("Fase 05 — webhooks", () => {
  it("assinatura HMAC obrigatória", () => {
    const body = JSON.stringify({ a: 1 });
    const sig = "sha256=" + createHmac("sha256", "segredo-app").update(body).digest("hex");
    expect(validSignature(body, sig, "segredo-app")).toBe(true);
    expect(validSignature(body, sig, "outro")).toBe(false);
    expect(validSignature(body, null, "segredo-app")).toBe(false);
  });

  it("status de entrega/leitura atualizam mensagem e campanha (sem retroceder)", async () => {
    const m = await owner((db) => db.query(`select provider_message_id, campaign_id from messages where body like 'Olá Ana%'`));
    const id = m.rows[0].provider_message_id;
    for (const status of ["delivered", "read", "delivered"]) await processWhatsAppWebhook(msgPayload("8001", { statuses: [{ id, status }] }) as never);
    const r = await getCampaign(gestor, m.rows[0].campaign_id);
    expect(r.contacts.find((c) => c.name === "Ana Lima")?.status).toBe("read");
    expect(r.campaign.delivered).toBe(2 - 1); // Ana (lida) conta como entregue; Bia ainda "enviada"
  });

  it("resposta do contato cria/atualiza conversa, marca a campanha e é idempotente", async () => {
    const p = msgPayload("8001", { contacts: [{ wa_id: "5591985000001", profile: { name: "Ana" } }], messages: [{ from: "5591985000001", id: "wamid.in1", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Tenho interesse!" } }] });
    await processWhatsAppWebhook(p as never); await processWhatsAppWebhook(p as never);
    const conv = await owner((db) => db.query(`select c.unread_count, c.last_message_preview, (select count(*)::int from messages m where m.conversation_id = c.id and m.direction='inbound') as n
                                                 from conversations c join contacts ct on ct.id = c.contact_id where ct.phone_e164 = '+5591985000001'`));
    expect(conv.rows[0]).toMatchObject({ unread_count: 1, last_message_preview: "Tenho interesse!", n: 1 });
    const ana = (await listContacts(gestor, { q: "Ana Lima" })).rows[0];
    expect(ana.commercial_status).toBe("in_progress");
    const { campaigns } = await getContact(gestor, ana.id);
    expect(campaigns[0].status).toBe("replied");
  });

  it("SAIR: descadastra e envia confirmação dentro da janela", async () => {
    await processWhatsAppWebhook(msgPayload("8001", { messages: [{ from: "5591985000001", id: "wamid.in2", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "sair" } }] }) as never);
    const ana = (await listContacts(gestor, { q: "Ana Lima" })).rows[0];
    expect(ana.consent_status).toBe("opted_out");
    calls.length = 0;
    await runWorkerOnce();
    expect(calls.find((c) => c.path === "8001/messages")?.body).toMatchObject({ type: "text", text: { body: expect.stringMatching(/não receberá mais/) } });
  });

  it("contato novo pelo WhatsApp entra na base e vai para o vendedor do número", async () => {
    await processWhatsAppWebhook(msgPayload("8001", { contacts: [{ wa_id: "5591977770000", profile: { name: "Novo Lead" } }], messages: [{ from: "5591977770000", id: "wamid.in3", type: "text", text: { body: "Olá" } }] }) as never);
    const c = (await listContacts(gestor, { q: "Novo Lead" })).rows[0];
    expect(c).toMatchObject({ source: "whatsapp", owner_name: null });
    const conv = await owner((db) => db.query(`select assigned_user_id from conversations where contact_id = $1`, [c.id]));
    expect(conv.rows[0].assigned_user_id).toBe(vend.user.id);
  });

  it("coexistência: mensagens do celular, histórico e contatos (inclusive sem telefone)", async () => {
    await processWhatsAppWebhook(msgPayload("9001", { message_echoes: [{ from: "559130009001", to: "5591966660000", id: "wamid.echo1", timestamp: "1764000000", type: "text", text: { body: "Enviei pelo celular" } }] }, "smb_message_echoes") as never);
    await processWhatsAppWebhook(msgPayload("9001", { history: [{ metadata: { phase: 0, chunk_order: 1, progress: 100 }, threads: [{ id: "5591955550000", context: { wa_id: "5591955550000", user_id: "BR.BSUID1" },
      messages: [{ from: "5591955550000", from_user_id: "BR.BSUID1", id: "wamid.h1", timestamp: "1760000000", type: "text", text: { body: "Mensagem antiga" } },
                 { from: "559130009001", to: "5591955550000", id: "wamid.h2", timestamp: "1760000100", type: "text", text: { body: "Resposta antiga" } }] }] }] }, "history") as never);
    await processWhatsAppWebhook(msgPayload("9001", { state_sync: [{ type: "contact", action: "add", contact: { full_name: "Contato Só BSUID", user_id: "BR.BSUID2" } }] }, "smb_app_state_sync") as never);
    const rows = await owner((db) => db.query(`select body, direction, channel from messages where company_id = $1 and channel in ('business_app','history') order by created_at`, [companyId]));
    expect(rows.rows).toEqual([
      { body: "Mensagem antiga", direction: "inbound", channel: "history" },
      { body: "Resposta antiga", direction: "outbound", channel: "history" },
      { body: "Enviei pelo celular", direction: "outbound", channel: "business_app" }]);
    expect((await listContacts(gestor, { q: "Só BSUID" })).total).toBe(1);
    const c = await owner((db) => db.query(`select onboarding from whatsapp_connections where id = $1`, [coexId]));
    expect(c.rows[0].onboarding).toMatchObject({ history_shared: true, history_progress: 100 });
  });

  it("isolamento: webhook de um número nunca grava em outra empresa; número desconhecido é ignorado", async () => {
    await processWhatsAppWebhook(msgPayload("0000", { messages: [{ from: "5591900000000", id: "wamid.x", type: "text", text: { body: "?" } }] }) as never);
    expect((await listContacts(outro)).total).toBe(0);
  });

  it("desconexão feita pelo cliente no app (PARTNER_REMOVED) e desconexão manual", async () => {
    await processWhatsAppWebhook({ object: "whatsapp_business_account", entry: [{ id: "900", changes: [{ field: "account_update", value: { event: "PARTNER_REMOVED" } }] }] } as never);
    expect((await listConnections(gestor)).find((c) => c.id === coexId)).toMatchObject({ status: "disconnected", last_error: expect.stringMatching(/Reconectar/) });
    await disconnectNumber(gestor, cloudId);
    const w = (await listConnections(gestor)).find((c) => c.id === cloudId)!;
    expect(w.status).toBe("disconnected");
    const cred = await owner((db) => db.query(`select credentials_encrypted from whatsapp_connections where id = $1`, [cloudId]));
    expect(cred.rows[0].credentials_encrypted).toBeNull();
  });
});
