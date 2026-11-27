import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope, type Db } from "../db";
import { AppError, forbidden, invalid, notFound } from "../errors";
import { assertCompany, assertFeature, hasFeature, isCompanyAdmin, scopeOf } from "../guards";
import { recordEvent } from "../events";
import { sendAndRecord, windowOpen } from "../messaging";
import { credentialsOf } from "./whatsapp";
import { PROVIDERS } from "../integrations/whatsapp/meta";
import { ProviderError } from "../integrations/whatsapp/provider";
import { generateText } from "../integrations/ai";
import { parse, requiredText, uuid } from "../validation";

export type ConvFilter = "mine" | "all" | "unassigned" | "unread" | "closed";
export type ConversationRow = {
  id: string; contact_id: string; contact_name: string | null; organization: string | null; phone_e164: string | null;
  last_message_preview: string | null; last_message_at: string | null; unread_count: number; status: string; ai_enabled: boolean;
  handled_by: string; assigned_user_id: string | null; assigned_name: string | null; connection_name: string | null; provider: string | null;
  tags: { id: string; name: string; color: string }[];
};

/** Vendedor: somente conversas atribuídas a ele. Admin: todas da empresa. */
const visibility = (ctx: AuthContext, alias = "cv") => ctx.role === "seller" ? `and ${alias}.assigned_user_id = '${ctx.user.id}'::uuid` : "";

async function loadConv(db: Db, ctx: AuthContext, id: string) {
  parse(uuid, id);
  const c = await db.maybeOne<{ id: string; contact_id: string; assigned_user_id: string | null; whatsapp_connection_id: string | null; ai_enabled: boolean; status: string }>(
    `select cv.id, cv.contact_id, cv.assigned_user_id, cv.whatsapp_connection_id, cv.ai_enabled, cv.status from conversations cv
      where cv.id = $1 and cv.company_id = $2 ${visibility(ctx)}`, [id, ctx.company!.id]);
  if (!c) throw notFound("Conversa não encontrada.");
  return c;
}

export async function listConversations(ctx: AuthContext, f: { filter?: ConvFilter; q?: string; connectionId?: string } = {}) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "conversations");
  const filter = f.filter ?? (ctx.role === "seller" ? "mine" : "all");
  const p: unknown[] = [companyId, ctx.user.id];
  const w: string[] = [];
  if (filter === "mine") w.push(`cv.assigned_user_id = $2`);
  if (filter === "unassigned") w.push(`cv.assigned_user_id is null`);
  if (filter === "unread") w.push(`cv.unread_count > 0`);
  w.push(filter === "closed" ? `cv.status = 'closed'` : `cv.status <> 'closed'`);
  if (f.q?.trim()) { p.push(`%${f.q.trim()}%`); const d = f.q.replace(/\D/g, ""); w.push(`(c.name ilike $${p.length} or c.organization ilike $${p.length}${d.length >= 4 ? ` or c.phone_e164 like '%${d}%'` : ""} or cv.last_message_preview ilike $${p.length})`); }
  if (f.connectionId && uuid.safeParse(f.connectionId).success) { p.push(f.connectionId); w.push(`cv.whatsapp_connection_id = $${p.length}`); }
  return withScope(scopeOf(ctx), (db) => db.query<ConversationRow>(
    `select cv.id, cv.contact_id, c.name as contact_name, c.organization, c.phone_e164, cv.last_message_preview, cv.last_message_at, cv.unread_count,
            cv.status, cv.ai_enabled, cv.handled_by, cv.assigned_user_id, u.name as assigned_name, w.display_name as connection_name, w.provider,
            coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name)
                        from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = c.id), '[]') as tags
       from conversations cv join contacts c on c.id = cv.contact_id
       left join users u on u.id = cv.assigned_user_id left join whatsapp_connections w on w.id = cv.whatsapp_connection_id
      where cv.company_id = $1 ${visibility(ctx)} ${w.length ? "and " + w.join(" and ") : ""} and ($2::uuid is not null)
      order by cv.last_message_at desc nulls last limit 300`, p));
}

export type MessageRow = {
  id: string; direction: "inbound" | "outbound"; sender_type: string; sender_name: string | null; body: string | null; media_type: string | null;
  status: string; error: string | null; channel: string; created_at: string; template_name: string | null;
};

export async function getConversation(ctx: AuthContext, id: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "conversations");
  return withScope(scopeOf(ctx), async (db) => {
    await loadConv(db, ctx, id);
    // abrir a conversa marca como lida
    await db.exec(`update conversations set unread_count = 0 where id = $1 and unread_count > 0`, [id]);
    const conv = await db.one<ConversationRow & { origin_campaign_id: string | null; campaign_name: string | null; campaign_number: number | null;
      next_follow_up_at: string | null; last_inbound_at: string | null; whatsapp_connection_id: string | null; notes: string | null; email: string | null;
      city: string | null; commercial_status: string; consent_status: string; window_open: boolean }>(
      `select cv.*, c.name as contact_name, c.organization, c.phone_e164, c.email::text, c.city, c.notes, c.commercial_status, c.consent_status,
              u.name as assigned_name, w.display_name as connection_name, w.provider, ca.name as campaign_name, ca.number as campaign_number,
              coalesce(cv.last_inbound_at > now() - interval '24 hours', false) as window_open, '[]'::json as tags
         from conversations cv join contacts c on c.id = cv.contact_id left join users u on u.id = cv.assigned_user_id
         left join whatsapp_connections w on w.id = cv.whatsapp_connection_id left join campaigns ca on ca.id = cv.origin_campaign_id
        where cv.id = $1`, [id]);
    const [messages, tags, opportunity, events] = await Promise.all([
      db.query<MessageRow>(
        `select * from (select m.id, m.direction, m.sender_type, u.name as sender_name, m.body, m.media_type, m.status, m.error, m.channel, m.created_at, m.template_name
           from messages m left join users u on u.id = m.sender_user_id where m.conversation_id = $1 order by m.created_at desc limit 300) x order by created_at`, [id]),
      db.query<{ id: string; name: string; color: string }>(`select t.id, t.name, t.color from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = $1 order by t.name`, [conv.contact_id]),
      db.maybeOne<{ id: string; stage_id: string; stage: string; value: string | null; status: string }>(
        `select o.id, o.stage_id, s.name as stage, o.value::text, o.status from opportunities o join pipeline_stages s on s.id = o.stage_id
          where o.contact_id = $1 and o.company_id = $2 order by (o.status = 'open') desc, o.created_at desc limit 1`, [conv.contact_id, companyId]),
      db.query<{ id: number; type: string; created_at: string; actor: string | null; data: Record<string, unknown> }>(
        `select e.id, e.type, e.created_at, u.name as actor, e.data from domain_events e left join users u on u.id = e.actor_user_id
          where e.contact_id = $1 order by e.created_at desc limit 15`, [conv.contact_id]),
    ]);
    return { conv: { ...conv, tags }, messages, opportunity, events };
  });
}

// ---------------------------------------------------------------------
// Envio pelo vendedor (assume o atendimento: a IA para de responder)
// ---------------------------------------------------------------------
const textSchema = requiredText("a mensagem", 4096);

async function prepareSend(db: Db, ctx: AuthContext, id: string) {
  const c = await loadConv(db, ctx, id);
  if (!c.whatsapp_connection_id) throw invalid("Esta conversa não está ligada a um número de WhatsApp.");
  const info = await db.one<{ phone: string | null; consent_status: string; conn_status: string; provider: string }>(
    `select coalesce(ct.whatsapp_e164, ct.phone_e164) as phone, ct.consent_status, w.status as conn_status, w.provider
       from contacts ct, whatsapp_connections w where ct.id = $1 and w.id = $2`, [c.contact_id, c.whatsapp_connection_id]);
  if (!info.phone) throw invalid("O contato não possui número de WhatsApp.");
  if (info.conn_status !== "connected") throw new AppError("INTEGRATION", "O número de WhatsApp desta conversa está desconectado. Reconecte em WhatsApp Comercial.");
  if (info.provider === "meta_cloud" && !(await windowOpen(db, id)))
    throw new AppError("INTEGRATION", "Fora da janela de 24h da Meta: só é possível enviar um modelo aprovado até o cliente responder.");
  return { c, info };
}

async function afterHumanSend(db: Db, ctx: AuthContext, id: string, contactId: string) {
  await db.exec(`update conversations set handled_by = 'human', ai_enabled = false, status = 'open',
                   assigned_user_id = coalesce(assigned_user_id, $2) where id = $1`, [id, ctx.user.id]);
  await db.exec(`update contacts set commercial_status = 'in_progress' where id = $1 and commercial_status in ('new','contacted')`, [contactId]);
}

export async function sendMessage(ctx: AuthContext, id: string, rawBody: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "conversations");
  const body = parse(textSchema, rawBody);
  // a falha fica registrada no histórico (a transação confirma) e só então é informada
  const r = await withScope(scopeOf(ctx), async (db) => {
    const { c, info } = await prepareSend(db, ctx, id);
    const res = await sendAndRecord(db, { companyId, connectionId: c.whatsapp_connection_id!, contactId: c.contact_id, toE164: info.phone!, conversationId: id,
      body, senderType: "user", senderUserId: ctx.user.id });
    if (res.ok) await afterHumanSend(db, ctx, id, c.contact_id);
    return res;
  });
  if (!r.ok) throw new AppError("INTEGRATION", `Mensagem não enviada: ${r.error}`);
  return { messageId: r.messageId };
}

const MAX_FILE = 15 * 1024 * 1024;
export async function sendFile(ctx: AuthContext, id: string, file: { name: string; type: string; base64: string; caption?: string }) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "conversations");
  if (!file?.base64) throw invalid("Selecione um arquivo.");
  if (file.base64.length * 0.75 > MAX_FILE) throw invalid("Arquivo maior que 15 MB.");
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "document";
  const out = await withScope(scopeOf(ctx), async (db) => {
    const { c, info } = await prepareSend(db, ctx, id);
    const creds = await credentialsOf(db, c.whatsapp_connection_id!);
    const provider = PROVIDERS[creds.provider];
    if (!provider.sendMedia) throw new AppError("INTEGRATION", "O envio de arquivos ainda não está disponível para este tipo de conexão.");
    const msgId = randomUUID();
    const label = file.caption?.trim() || file.name;
    await db.exec(`insert into messages (id, company_id, conversation_id, contact_id, direction, sender_type, sender_user_id, body, media_type, status)
                   values ($1,$2,$3,$4,'outbound','user',$5,$6,$7,'queued')`, [msgId, companyId, id, c.contact_id, ctx.user.id, label, kind]);
    try {
      const r = await provider.sendMedia(creds, info.phone!, { type: kind, mimetype: file.type || "application/octet-stream", base64: file.base64, fileName: file.name.slice(0, 200), caption: file.caption });
      await db.exec(`update messages set status = 'sent', provider_message_id = $2 where id = $1`, [msgId, r.providerMessageId]);
      await db.exec(`update conversations set last_message_at = now(), last_message_preview = left($2, 160) where id = $1`, [id, `📎 ${label}`]);
    } catch (e) {
      const msg = e instanceof ProviderError ? e.message : "Falha no envio.";
      await db.exec(`update messages set status = 'failed', error = $2 where id = $1`, [msgId, msg]);
      return { error: msg, messageId: msgId };
    }
    await afterHumanSend(db, ctx, id, c.contact_id);
    return { error: null, messageId: msgId };
  });
  if (out.error) throw new AppError("INTEGRATION", `Arquivo não enviado: ${out.error}`);
  return { messageId: out.messageId };
}

// ---------------------------------------------------------------------
// Atribuição, IA, situação, retorno e notas
// ---------------------------------------------------------------------
export async function transferConversation(ctx: AuthContext, id: string, toUserId: string | null) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "conversations");
  return withScope(scopeOf(ctx), async (db) => {
    const c = await loadConv(db, ctx, id);
    if (!isCompanyAdmin(ctx) && c.assigned_user_id !== ctx.user.id) throw forbidden("Só é possível transferir conversas que estão com você.");
    if (toUserId) {
      parse(uuid, toUserId);
      const ok = await db.maybeOne(`select 1 from company_memberships where company_id = $1 and user_id = $2 and is_active`, [companyId, toUserId]);
      if (!ok) throw invalid("Vendedor inválido.");
    } else if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador pode deixar a conversa sem responsável.");
    await db.exec(`update conversations set assigned_user_id = $2 where id = $1`, [id, toUserId]);
    // o contato acompanha a conversa: o novo vendedor passa a vê-lo também em Contatos e CRM
    await db.exec(`update contacts set owner_user_id = $2 where id = $1`, [c.contact_id, toUserId]);
    await db.exec(`update opportunities set owner_user_id = $2 where contact_id = $1 and status = 'open'`, [c.contact_id, toUserId]);
    await recordEvent(db, ctx, companyId, "conversation.transferred", { contactId: c.contact_id, entityType: "conversation", entityId: id }, { to: toUserId });
  });
}

export async function assumeConversation(ctx: AuthContext, id: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "conversations");
  return withScope(scopeOf(ctx), async (db) => {
    const c = await loadConv(db, ctx, id);
    if (c.assigned_user_id && c.assigned_user_id !== ctx.user.id && !isCompanyAdmin(ctx)) throw forbidden();
    await db.exec(`update conversations set assigned_user_id = $2, handled_by = 'human', ai_enabled = false where id = $1`, [id, ctx.user.id]);
    await db.exec(`update contacts set owner_user_id = coalesce(owner_user_id, $2) where id = $1`, [c.contact_id, ctx.user.id]);
    await recordEvent(db, ctx, companyId, "conversation.assumed", { contactId: c.contact_id, entityType: "conversation", entityId: id });
  });
}

export async function setConversationAi(ctx: AuthContext, id: string, enabled: boolean) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "conversations");
  if (enabled && !hasFeature(ctx, "ai_chatbot")) throw forbidden("O Chatbot IA não está liberado para o seu acesso.");
  return withScope(scopeOf(ctx), async (db) => {
    const c = await loadConv(db, ctx, id);
    await db.exec(`update conversations set ai_enabled = $2, handled_by = case when $2 then 'ai' else 'human' end where id = $1`, [id, enabled]);
    await recordEvent(db, ctx, companyId, enabled ? "conversation.ai_on" : "conversation.ai_off", { contactId: c.contact_id, entityType: "conversation", entityId: id });
  });
}

export async function setConversationStatus(ctx: AuthContext, id: string, status: "open" | "closed") {
  assertCompany(ctx);
  assertFeature(ctx, "conversations");
  return withScope(scopeOf(ctx), async (db) => {
    await loadConv(db, ctx, id);
    await db.exec(`update conversations set status = $2, unread_count = case when $2 = 'closed' then 0 else unread_count end where id = $1`, [id, status]);
  });
}

export async function setFollowUp(ctx: AuthContext, id: string, when: string | null) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "conversations");
  const at = when ? new Date(when) : null;
  if (when && (!at || isNaN(at.getTime()))) throw invalid("Data de retorno inválida.");
  return withScope(scopeOf(ctx), async (db) => {
    const c = await loadConv(db, ctx, id);
    await db.exec(`update conversations set next_follow_up_at = $2 where id = $1`, [id, at?.toISOString() ?? null]);
    await db.exec(`update opportunities set next_follow_up_at = $2 where contact_id = $1 and status = 'open'`, [c.contact_id, at?.toISOString() ?? null]);
    if (at) await recordEvent(db, ctx, companyId, "conversation.follow_up", { contactId: c.contact_id }, { at: at.toISOString() });
  });
}

export async function saveContactNotes(ctx: AuthContext, id: string, notes: string) {
  assertCompany(ctx);
  assertFeature(ctx, "conversations");
  const n = parse(z.string().max(5000, "Máximo de 5000 caracteres."), notes ?? "");
  return withScope(scopeOf(ctx), async (db) => {
    const c = await loadConv(db, ctx, id);
    await db.exec(`update contacts set notes = $2 where id = $1`, [c.contact_id, n || null]);
  });
}

/** Cria a negociação no CRM a partir da conversa (primeira etapa do funil padrão). */
export async function createOpportunityFromConversation(ctx: AuthContext, id: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "crm");
  return withScope(scopeOf(ctx), async (db) => {
    const c = await loadConv(db, ctx, id);
    const open = await db.maybeOne<{ id: string }>(`select id from opportunities where contact_id = $1 and status = 'open'`, [c.contact_id]);
    if (open) return { id: open.id, existed: true };
    const st = await db.one<{ pipeline_id: string; stage_id: string }>(
      `select p.id as pipeline_id, s.id as stage_id from pipelines p join pipeline_stages s on s.pipeline_id = p.id
        where p.company_id = $1 and p.is_default and s.kind = 'open' order by s.position limit 1`, [companyId]);
    const cv = await db.one<{ origin_campaign_id: string | null; name: string | null }>(
      `select cv.origin_campaign_id, ct.name from conversations cv join contacts ct on ct.id = cv.contact_id where cv.id = $1`, [id]);
    const oid = randomUUID();
    await db.exec(`insert into opportunities (id, company_id, contact_id, pipeline_id, stage_id, owner_user_id, campaign_id, conversation_id, title)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [oid, companyId, c.contact_id, st.pipeline_id, st.stage_id, c.assigned_user_id ?? ctx.user.id, cv.origin_campaign_id, id, cv.name ? `Negociação — ${cv.name}` : "Negociação"]);
    await recordEvent(db, ctx, companyId, "opportunity.created", { contactId: c.contact_id, campaignId: cv.origin_campaign_id, entityType: "opportunity", entityId: oid });
    return { id: oid, existed: false };
  });
}

/** Sugestão de resposta com IA (o vendedor revisa antes de enviar). */
export async function suggestReply(ctx: AuthContext, id: string) {
  assertCompany(ctx);
  assertFeature(ctx, "ai_messages");
  const data = await getConversation(ctx, id);
  const history = data.messages.slice(-20).map((m) => `${m.direction === "inbound" ? "Cliente" : "Empresa"}: ${m.body ?? `[${m.media_type}]`}`).join("\n");
  if (!history) throw invalid("Ainda não há mensagens nesta conversa.");
  return generateText(
    `Você ajuda vendedores da empresa "${ctx.company!.name}" a responder clientes no WhatsApp, em português do Brasil.
Escreva UMA resposta curta, cordial e objetiva para a última mensagem do cliente. Não invente preços, prazos, ofertas ou informações que não aparecem na conversa;
se faltar informação, faça uma pergunta ao cliente ou diga que vai verificar. Responda somente com o texto da mensagem.`,
    `Conversa:\n${history}\n\nResposta sugerida:`, { effort: "low" });
}

// ---------------------------------------------------------------------
// Respostas rápidas
// ---------------------------------------------------------------------
export async function listQuickReplies(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  return withScope(scopeOf(ctx), (db) => db.query<{ id: string; shortcut: string; body: string }>(`select id, shortcut, body from quick_replies where company_id = $1 order by shortcut`, [companyId]));
}
export async function saveQuickReply(ctx: AuthContext, raw: { shortcut: string; body: string }) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "conversations");
  const shortcut = parse(z.string().trim().regex(/^[a-z0-9_-]{2,30}$/i, "Atalho: 2 a 30 letras, números, - ou _ (sem espaços)."), (raw.shortcut ?? "").replace(/^\//, ""));
  const body = parse(requiredText("o texto", 2000), raw.body);
  return withScope(scopeOf(ctx), (db) => db.exec(
    `insert into quick_replies (company_id, shortcut, body) values ($1, lower($2), $3) on conflict (company_id, shortcut) do update set body = excluded.body`, [companyId, shortcut, body]));
}
export async function deleteQuickReply(ctx: AuthContext, id: string) {
  const companyId = assertCompany(ctx);
  if (!isCompanyAdmin(ctx)) throw forbidden();
  parse(uuid, id);
  return withScope(scopeOf(ctx), (db) => db.exec(`delete from quick_replies where id = $1 and company_id = $2`, [id, companyId]));
}

export async function unreadCount(ctx: AuthContext) {
  if (!ctx.company || !hasFeature(ctx, "conversations")) return 0;
  return withScope(scopeOf(ctx), async (db) => (await db.one<{ n: number }>(
    `select coalesce(sum(unread_count), 0)::int as n from conversations cv where cv.company_id = $1 and cv.status <> 'closed' ${visibility(ctx)}`, [ctx.company!.id])).n);
}
