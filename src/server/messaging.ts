/**
 * Núcleo de mensagens: conversa única por (empresa, contato, conexão),
 * registro de mensagens e envio pelo provedor. Usado por campanhas, webhooks,
 * Central de Conversas (Fase 06) e Chatbot (Fase 08).
 */
import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import { credentialsOf } from "./services/whatsapp";
import { PROVIDERS } from "./integrations/whatsapp/meta";
import { ProviderError } from "./integrations/whatsapp/provider";

export const WINDOW_HOURS = 24;

export async function ensureConversation(db: Db, companyId: string, contactId: string, connectionId: string, originCampaignId?: string | null) {
  const existing = await db.maybeOne<{ id: string; origin_campaign_id: string | null }>(
    `select id, origin_campaign_id from conversations where company_id = $1 and contact_id = $2 and whatsapp_connection_id = $3`, [companyId, contactId, connectionId]);
  if (existing) {
    if (!existing.origin_campaign_id && originCampaignId) await db.exec(`update conversations set origin_campaign_id = $2 where id = $1`, [existing.id, originCampaignId]);
    return existing.id;
  }
  const id = randomUUID();
  // responsável: vendedor do contato; senão, o vendedor do número com menos conversas abertas
  const owner = await db.maybeOne<{ owner_user_id: string | null }>(`select owner_user_id from contacts where id = $1`, [contactId]);
  if (owner && !owner.owner_user_id) {
    const pick = await db.maybeOne<{ user_id: string }>(
      `select m.user_id from whatsapp_connection_members m join company_memberships cm on cm.user_id = m.user_id and cm.company_id = m.company_id and cm.is_active
        where m.connection_id = $1
        order by (select count(*) from conversations c where c.assigned_user_id = m.user_id and c.status <> 'closed'), m.created_at limit 1`, [connectionId]);
    owner.owner_user_id = pick?.user_id ?? null;
  }
  await db.exec(
    `insert into conversations (id, company_id, contact_id, whatsapp_connection_id, assigned_user_id, origin_campaign_id)
     values ($1,$2,$3,$4,$5,$6) on conflict do nothing`, [id, companyId, contactId, connectionId, owner?.owner_user_id ?? null, originCampaignId ?? null]);
  return (await db.one<{ id: string }>(`select id from conversations where company_id = $1 and contact_id = $2 and whatsapp_connection_id = $3`, [companyId, contactId, connectionId])).id;
}

/** A janela de atendimento de 24h está aberta? (última mensagem do contato há menos de 24h) */
export async function windowOpen(db: Db, conversationId: string) {
  const r = await db.maybeOne<{ open: boolean }>(
    `select coalesce(last_inbound_at > now() - interval '${WINDOW_HOURS} hours', false) as open from conversations where id = $1`, [conversationId]);
  return !!r?.open;
}

type SendArgs = {
  companyId: string; connectionId: string; contactId: string; toE164: string; conversationId: string;
  body: string; template?: { name: string; language: string; params: string[] } | null;
  senderType: "campaign" | "user" | "ai" | "system"; senderUserId?: string | null; campaignId?: string | null;
};

/**
 * Envia e registra. A mensagem é gravada ANTES como "queued" e atualizada após a resposta
 * do provedor, para que nenhum envio fique sem histórico.
 */
export async function sendAndRecord(db: Db, a: SendArgs) {
  const messageId = randomUUID();
  await db.exec(
    `insert into messages (id, company_id, conversation_id, contact_id, direction, sender_type, sender_user_id, campaign_id, body, status, template_name)
     values ($1,$2,$3,$4,'outbound',$5,$6,$7,$8,'queued',$9)`,
    [messageId, a.companyId, a.conversationId, a.contactId, a.senderType, a.senderUserId ?? null, a.campaignId ?? null, a.body, a.template?.name ?? null]);
  try {
    const creds = await credentialsOf(db, a.connectionId);
    const p = PROVIDERS[creds.provider];
    const r = a.template ? await p.sendTemplate(creds, a.toE164, a.template.name, a.template.language, a.template.params) : await p.sendText(creds, a.toE164, a.body);
    await db.exec(`update messages set status='sent', provider_message_id=$2 where id=$1`, [messageId, r.providerMessageId]);
    await db.exec(`update conversations set last_message_at = now(), last_message_preview = left($2, 160) where id = $1`, [a.conversationId, a.body]);
    await db.exec(`insert into usage_counters (company_id, metric, period, value) values ($1,'messages_sent',date_trunc('month', now())::date,1)
                   on conflict (company_id, metric, period) do update set value = usage_counters.value + 1`, [a.companyId]);
    return { ok: true as const, messageId };
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError(e instanceof Error ? e.message : "Falha no envio.", false);
    await db.exec(`update messages set status='failed', error=$2 where id=$1`, [messageId, pe.message]);
    return { ok: false as const, messageId, error: pe.message, retryable: pe.retryable };
  }
}
