/**
 * Processamento dos webhooks do WhatsApp (Meta). Roda em modo sistema e descobre a empresa
 * pelo phone_number_id do número conectado — nunca por dado vindo do cliente.
 * Idempotente: mensagens repetidas (mesmo id da Meta) são ignoradas.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { withScope, SYSTEM, type Db } from "../db";
import { recordEvent } from "../events";
import { ensureConversation } from "../messaging";
import { normalizePhone } from "@/lib/phone";

export const OPT_OUT_WORDS = ["SAIR", "PARAR", "STOP", "CANCELAR", "DESCADASTRAR", "NAO QUERO", "NÃO QUERO"];

export function validSignature(rawBody: string, header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}

export type Conn = { id: string; company_id: string; phone_number: string | null; connection_mode: string };
type WaMessage = { from?: string; from_user_id?: string; to?: string; to_user_id?: string; id: string; timestamp?: string; type: string; [k: string]: unknown };

/** Texto legível de qualquer tipo de mensagem. */
export function messageText(m: WaMessage): { body: string | null; mediaType: string | null } {
  const t = m.type;
  const part = (m[t] ?? {}) as Record<string, unknown>;
  if (t === "text") return { body: String(part.body ?? ""), mediaType: null };
  if (t === "button") return { body: String(part.text ?? ""), mediaType: null };
  if (t === "interactive") {
    const r = (part.button_reply ?? part.list_reply ?? {}) as { title?: string };
    return { body: r.title ?? "[resposta interativa]", mediaType: null };
  }
  if (["image", "video", "document", "audio", "sticker"].includes(t))
    return { body: (part.caption as string) ?? (part.filename as string) ?? null, mediaType: t };
  if (t === "location") return { body: `[localização] ${part.name ?? ""} ${part.address ?? ""}`.trim(), mediaType: "location" };
  if (t === "contacts") return { body: "[contato compartilhado]", mediaType: "contacts" };
  if (t === "reaction") return { body: `[reação] ${part.emoji ?? ""}`, mediaType: "reaction" };
  if (t === "unsupported") return { body: "[mensagem não suportada — veja no aplicativo do WhatsApp]", mediaType: null };
  return { body: `[${t}]`, mediaType: t };
}

/** Localiza ou cria o contato pelo telefone e/ou identificador do WhatsApp (BSUID). */
async function resolveContact(db: Db, companyId: string, p: { phone?: string | null; userId?: string | null; name?: string | null }) {
  const phone = p.phone ? normalizePhone("+" + p.phone.replace(/\D/g, "")) : null;
  const found = await db.maybeOne<{ id: string; wa_user_id: string | null; name: string | null }>(
    `select id, wa_user_id, name from contacts where company_id = $1 and (
        ($2::text is not null and wa_user_id = $2) or ($3::text is not null and (phone_e164 = $3 or whatsapp_e164 = $3)))
      order by (wa_user_id = $2) desc nulls last limit 1`, [companyId, p.userId ?? null, phone]);
  if (found) {
    if (p.userId && !found.wa_user_id) await db.exec(`update contacts set wa_user_id = $2 where id = $1`, [found.id, p.userId]);
    if (!found.name && p.name) await db.exec(`update contacts set name = $2 where id = $1`, [found.id, p.name]);
    return { id: found.id, created: false };
  }
  const id = randomUUID();
  await db.exec(
    `insert into contacts (id, company_id, name, phone_e164, wa_user_id, source, source_detail) values ($1,$2,$3,$4,$5,'whatsapp',$6)`,
    [id, companyId, p.name || (phone ? null : "Contato WhatsApp"), phone, p.userId ?? null, { first_contact: "whatsapp" }]);
  await recordEvent(db, null, companyId, "contact.created", { contactId: id }, { source: "whatsapp" });
  return { id, created: true };
}

async function insertMessage(db: Db, a: { companyId: string; conversationId: string; contactId: string; direction: "inbound" | "outbound";
  senderType: "contact" | "user"; m: WaMessage; channel: "api" | "business_app" | "history"; status: string }) {
  const { body, mediaType } = messageText(a.m);
  const ts = a.m.timestamp ? new Date(Number(a.m.timestamp) * 1000) : new Date();
  const r = await db.query<{ id: string }>(
    `insert into messages (company_id, conversation_id, contact_id, direction, sender_type, body, media_type, provider_message_id, status, channel, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (company_id, provider_message_id) where provider_message_id is not null do nothing returning id`,
    [a.companyId, a.conversationId, a.contactId, a.direction, a.senderType, body, mediaType, a.m.id, a.status, a.channel, ts.toISOString()]);
  return { inserted: r.length > 0, body, at: ts };
}

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };

export async function handleMessages(db: Db, conn: Conn, value: Record<string, unknown>) {
  const contacts = (value.contacts ?? []) as { wa_id?: string; user_id?: string; profile?: { name?: string; username?: string } }[];
  for (const m of (value.messages ?? []) as WaMessage[]) {
    const prof = contacts.find((c) => (m.from_user_id && c.user_id === m.from_user_id) || (m.from && c.wa_id === m.from));
    const contact = await resolveContact(db, conn.company_id, { phone: m.from ?? prof?.wa_id, userId: m.from_user_id ?? prof?.user_id, name: prof?.profile?.name ?? prof?.profile?.username });
    const convId = await ensureConversation(db, conn.company_id, contact.id, conn.id);
    const ins = await insertMessage(db, { companyId: conn.company_id, conversationId: convId, contactId: contact.id, direction: "inbound", senderType: "contact", m, channel: "api", status: "received" });
    if (!ins.inserted) continue; // repetido
    await db.exec(`update conversations set last_inbound_at = $2, last_message_at = $2, last_message_preview = left($3, 160),
                     unread_count = unread_count + 1, status = 'open' where id = $1`, [convId, ins.at.toISOString(), ins.body ?? "[mídia]"]);
    // vínculo com a campanha que gerou a resposta
    const cc = await db.maybeOne<{ id: string; campaign_id: string }>(
      `select cc.id, cc.campaign_id from campaign_contacts cc join campaigns c on c.id = cc.campaign_id
        where cc.contact_id = $1 and c.whatsapp_connection_id = $2 and cc.status in ('sent','delivered','read','replied')
        order by cc.sent_at desc nulls last limit 1`, [contact.id, conn.id]);
    if (cc) {
      await db.exec(`update campaign_contacts set status = 'replied', replied_at = coalesce(replied_at, now()) where id = $1`, [cc.id]);
      await db.exec(`update conversations set origin_campaign_id = coalesce(origin_campaign_id, $2) where id = $1`, [convId, cc.campaign_id]);
    }
    await db.exec(`update contacts set commercial_status = 'in_progress' where id = $1 and commercial_status in ('new','contacted')`, [contact.id]);
    await recordEvent(db, null, conn.company_id, "contact.replied", { contactId: contact.id, campaignId: cc?.campaign_id ?? null }, { conversation_id: convId });
    // descadastramento solicitado pelo contato
    const norm = (ins.body ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
    if (OPT_OUT_WORDS.some((w) => norm === w.normalize("NFD").replace(/[̀-ͯ]/g, ""))) {
      await db.exec(`update contacts set consent_status = 'opted_out', opted_out_at = now(), consent_source = 'Pediu pelo WhatsApp' where id = $1`, [contact.id]);
      await db.exec(`update campaign_contacts set status = 'skipped', error = 'Contato descadastrado (opt-out)' where contact_id = $1 and status = 'pending'`, [contact.id]);
      await recordEvent(db, null, conn.company_id, "contact.consent", { contactId: contact.id }, { consent: "opted_out", source: "whatsapp" });
      await db.exec(`insert into jobs (company_id, type, payload) values ($1,'whatsapp.send_text',$2)`,
        [conn.company_id, { conversationId: convId, body: "Pronto! Você não receberá mais mensagens nossas. Se mudar de ideia, é só nos chamar.", senderType: "system" }]);
    } else {
      // Chatbot IA (Fase 08) atua quando a conversa estiver com IA ativa
      const conv = await db.one<{ ai_enabled: boolean }>(`select ai_enabled from conversations where id = $1`, [convId]);
      if (conv.ai_enabled) await db.exec(`insert into jobs (company_id, type, payload) values ($1,'ai.reply',$2)`, [conn.company_id, { conversationId: convId }]);
    }
  }
  for (const s of (value.statuses ?? []) as { id: string; status: string; errors?: { code?: number; title?: string; message?: string }[] }[]) {
    const msg = await db.maybeOne<{ id: string; status: string }>(`select id, status from messages where company_id = $1 and provider_message_id = $2`, [conn.company_id, s.id]);
    if (!msg) continue;
    if (s.status === "failed") {
      if ((RANK[msg.status] ?? 0) >= 2) continue;
      const err = s.errors?.[0]; const text = `${err?.title ?? "Falha na entrega"}${err?.code ? ` (código ${err.code})` : ""}`;
      await db.exec(`update messages set status = 'failed', error = $2 where id = $1`, [msg.id, text]);
      await db.exec(`update campaign_contacts set status = 'failed', error = $2 where message_id = $1 and status in ('sent','sending')`, [msg.id, text]);
      continue;
    }
    if (!(s.status in RANK) || (RANK[s.status] ?? 0) <= (RANK[msg.status] ?? -1)) continue;
    await db.exec(`update messages set status = $2 where id = $1`, [msg.id, s.status]);
    if (s.status === "delivered") await db.exec(`update campaign_contacts set status = 'delivered', delivered_at = now() where message_id = $1 and status = 'sent'`, [msg.id]);
    if (s.status === "read") await db.exec(`update campaign_contacts set status = 'read', read_at = now(), delivered_at = coalesce(delivered_at, now()) where message_id = $1 and status in ('sent','delivered')`, [msg.id]);
  }
}

/** Mensagens enviadas pelo app WhatsApp Business no celular (coexistência). */
export async function handleEchoes(db: Db, conn: Conn, value: Record<string, unknown>) {
  for (const m of (value.message_echoes ?? []) as WaMessage[]) {
    const contact = await resolveContact(db, conn.company_id, { phone: m.to, userId: m.to_user_id });
    const convId = await ensureConversation(db, conn.company_id, contact.id, conn.id);
    const ins = await insertMessage(db, { companyId: conn.company_id, conversationId: convId, contactId: contact.id, direction: "outbound", senderType: "user", m, channel: "business_app", status: "sent" });
    if (ins.inserted) await db.exec(`update conversations set last_message_at = greatest(coalesce(last_message_at, $2), $2), last_message_preview = left($3, 160) where id = $1`, [convId, ins.at.toISOString(), ins.body ?? "[mídia]"]);
  }
}

/** Histórico de até 6 meses compartilhado pelo cliente na coexistência. */
async function handleHistory(db: Db, conn: Conn, value: Record<string, unknown>) {
  const bizDigits = (conn.phone_number ?? "").replace(/\D/g, "");
  for (const h of (value.history ?? []) as { metadata?: { progress?: number }; threads?: { id?: string; context?: { wa_id?: string; user_id?: string; username?: string }; messages?: WaMessage[] }[]; errors?: { code?: number }[] }[]) {
    if (h.errors?.some((e) => e.code === 2593109)) {
      await db.exec(`update whatsapp_connections set onboarding = onboarding || '{"history_shared": false}' where id = $1`, [conn.id]); continue;
    }
    for (const t of h.threads ?? []) {
      const contact = await resolveContact(db, conn.company_id, { phone: t.context?.wa_id ?? t.id, userId: t.context?.user_id, name: t.context?.username });
      const convId = await ensureConversation(db, conn.company_id, contact.id, conn.id);
      let last: Date | null = null;
      for (const m of t.messages ?? []) {
        const outbound = !m.from_user_id && !!m.from && m.from.replace(/\D/g, "") === bizDigits || (!!m.to && !m.from_user_id);
        const ins = await insertMessage(db, { companyId: conn.company_id, conversationId: convId, contactId: contact.id, direction: outbound ? "outbound" : "inbound",
          senderType: outbound ? "user" : "contact", m, channel: "history", status: outbound ? "sent" : "received" });
        if (ins.inserted && (!last || ins.at > last)) last = ins.at;
      }
      if (last) await db.exec(`update conversations set last_message_at = greatest(coalesce(last_message_at, $2), $2) where id = $1`, [convId, last.toISOString()]);
    }
    if (h.metadata?.progress != null)
      await db.exec(`update whatsapp_connections set onboarding = onboarding || jsonb_build_object('history_shared', true, 'history_progress', $2::int) where id = $1`, [conn.id, h.metadata.progress]);
  }
}

/** Contatos do app WhatsApp Business (coexistência). */
async function handleStateSync(db: Db, conn: Conn, value: Record<string, unknown>) {
  for (const s of (value.state_sync ?? []) as { type: string; action?: string; contact?: { full_name?: string; first_name?: string; phone_number?: string; user_id?: string } }[]) {
    if (s.type !== "contact" || !s.contact || s.action === "remove") continue;
    await resolveContact(db, conn.company_id, { phone: s.contact.phone_number, userId: s.contact.user_id, name: s.contact.full_name || s.contact.first_name });
  }
}

/** Desconexão/reconexão feita pelo cliente no próprio app ou pela Meta. */
async function handleAccountUpdate(db: Db, wabaId: string, value: { event?: string }) {
  const conns = await db.query<{ id: string }>(`select id from whatsapp_connections where business_account_id = $1`, [wabaId]);
  for (const c of conns) {
    if (value.event === "PARTNER_REMOVED" || value.event === "ACCOUNT_OFFBOARDED")
      await db.exec(`update whatsapp_connections set status = 'disconnected', last_error = $2 where id = $1`, [c.id, "O número foi desconectado pelo próprio WhatsApp Business. Clique em Reconectar."]);
    if (value.event === "ACCOUNT_RECONNECTED")
      await db.exec(`update whatsapp_connections set status = 'connected', last_error = null where id = $1`, [c.id]);
  }
}

export async function processWhatsAppWebhook(payload: { object?: string; entry?: { id: string; changes?: { field: string; value: Record<string, unknown> }[] }[] }) {
  if (payload?.object !== "whatsapp_business_account") return { handled: 0 };
  let handled = 0;
  for (const entry of payload.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      await withScope(SYSTEM, async (db) => {
        if (ch.field === "account_update") { await handleAccountUpdate(db, entry.id, ch.value as { event?: string }); handled++; return; }
        const pid = (ch.value?.metadata as { phone_number_id?: string } | undefined)?.phone_number_id;
        if (!pid) return;
        const conn = await db.maybeOne<Conn>(`select id, company_id, phone_number, connection_mode from whatsapp_connections where phone_number_id = $1`, [pid]);
        if (!conn) return; // número não conectado na plataforma: ignorado
        if (ch.field === "messages") await handleMessages(db, conn, ch.value);
        else if (ch.field === "smb_message_echoes") await handleEchoes(db, conn, ch.value);
        else if (ch.field === "history") await handleHistory(db, conn, ch.value);
        else if (ch.field === "smb_app_state_sync") await handleStateSync(db, conn, ch.value);
        else return;
        await db.exec(`update whatsapp_connections set last_sync_at = now() where id = $1`, [conn.id]);
        handled++;
      });
    }
  }
  return { handled };
}
