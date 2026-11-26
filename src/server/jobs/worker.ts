/**
 * Fila de processamento (tabela `jobs`, FOR UPDATE SKIP LOCKED — seguro com vários processos).
 * Executa: envio de campanhas, início programado, mensagens avulsas, sincronização da coexistência
 * e reprocessamento de webhooks com erro.
 */
import { hostname } from "node:os";
import { withScope, SYSTEM, type Db } from "../db";
import { recordEvent } from "../events";
import { companyLimits } from "../permissions";
import { ensureConversation, sendAndRecord, windowOpen } from "../messaging";
import { credentialsOf } from "../services/whatsapp";
import { metaOnboarding } from "../integrations/whatsapp/meta";
import { processWhatsAppWebhook } from "../webhooks/whatsapp";
import { renderTemplate } from "@/lib/template";

type Job = { id: number; company_id: string | null; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number };
type Result = { rescheduleSeconds?: number } | void;
const WORKER_ID = `${hostname()}:${process.pid}`;
const MAX_SEND_ATTEMPTS = 3;
const STUCK_MINUTES = 10;

// ------------------------------------------------------------- campanhas
async function dispatchCampaign(job: Job): Promise<Result> {
  const campaignId = String(job.payload.campaignId);
  // 1) reserva um lote (transação curta, confirmada ANTES de enviar: nunca reenvia em caso de queda)
  const claim = await withScope(SYSTEM, async (db) => {
    const c = await db.maybeOne<{ id: string; company_id: string; status: string; whatsapp_connection_id: string | null; message_body: string | null;
      template_id: string | null; settings: { templateParams?: string[] }; company_name: string }>(
      `select c.*, co.name as company_name from campaigns c join companies co on co.id = c.company_id where c.id = $1`, [campaignId]);
    if (!c || c.status !== "running" || !c.whatsapp_connection_id) return null;
    const conn = await db.maybeOne<{ status: string; settings: { per_minute?: number } }>(`select status, settings from whatsapp_connections where id = $1`, [c.whatsapp_connection_id]);
    if (conn?.status !== "connected") {
      await db.exec(`update campaigns set status = 'paused', paused_at = now() where id = $1`, [campaignId]);
      await recordEvent(db, null, c.company_id, "campaign.paused", { campaignId }, { reason: "WhatsApp desconectado" });
      return null;
    }
    // itens presos em "enviando" após uma queda: NÃO reenviar (evita duplicidade), marcar para conferência
    await db.exec(`update campaign_contacts set status = 'failed', error = 'Envio interrompido: situação incerta, não reenviado para evitar duplicidade'
                    where campaign_id = $1 and status = 'sending' and queued_at < now() - interval '${STUCK_MINUTES} minutes'`, [campaignId]);
    const limits = await companyLimits(db, c.company_id);
    let budget = conn.settings?.per_minute ?? 20;
    if (limits.max_messages_month != null) {
      const used = await db.maybeOne<{ value: string }>(`select value::text from usage_counters where company_id = $1 and metric = 'messages_sent' and period = date_trunc('month', now())::date`, [c.company_id]);
      const left = limits.max_messages_month - Number(used?.value ?? 0);
      if (left <= 0) {
        await db.exec(`update campaigns set status = 'paused', paused_at = now() where id = $1`, [campaignId]);
        await recordEvent(db, null, c.company_id, "campaign.paused", { campaignId }, { reason: "Limite mensal de mensagens do plano atingido" });
        return null;
      }
      budget = Math.min(budget, left);
    }
    const items = await db.query<{ id: string; contact_id: string; attempts: number }>(
      `update campaign_contacts set status = 'sending', queued_at = now(), attempts = attempts + 1
        where id in (select id from campaign_contacts where campaign_id = $1 and status = 'pending' order by created_at limit $2 for update skip locked)
        returning id, contact_id, attempts`, [campaignId, budget]);
    let template: { name: string; language: string; body: string } | null = null;
    if (c.template_id) {
      const t = await db.maybeOne<{ name: string; language: string; components: { type: string; text?: string }[] }>(`select name, language, components from whatsapp_templates where id = $1`, [c.template_id]);
      if (t) template = { name: t.name, language: t.language, body: t.components.find((x) => x.type === "BODY")?.text ?? "" };
    }
    return { c, items, template };
  });
  if (!claim) return;
  const { c, items, template } = claim;

  // 2) envia cada item em sua própria transação
  for (const it of items) {
    const stop = await withScope(SYSTEM, async (db) => {
      const st = await db.one<{ status: string }>(`select status from campaigns where id = $1`, [campaignId]);
      if (st.status !== "running") { await db.exec(`update campaign_contacts set status = 'pending', attempts = attempts - 1 where id = $1`, [it.id]); return true; }
      const ct = await db.one<{ name: string | null; organization: string | null; city: string | null; phone: string | null; consent_status: string; owner_name: string | null }>(
        `select c.name, c.organization, c.city, coalesce(c.whatsapp_e164, c.phone_e164) as phone, c.consent_status, u.name as owner_name
           from contacts c left join users u on u.id = c.owner_user_id where c.id = $1`, [it.contact_id]);
      const finish = (status: string, error: string | null, messageId?: string) =>
        db.exec(`update campaign_contacts set status = $2, error = $3, message_id = coalesce($4, message_id), sent_at = case when $2 = 'sent' then now() else sent_at end where id = $1`,
          [it.id, status, error, messageId ?? null]);
      if (ct.consent_status === "opted_out") { await finish("skipped", "Contato descadastrado (opt-out)"); return false; }
      if (!ct.phone) { await finish("skipped", "Contato sem telefone/WhatsApp"); return false; }
      const data = { name: ct.name, organization: ct.organization, city: ct.city, owner_name: ct.owner_name, company_name: c.company_name };
      const convId = await ensureConversation(db, c.company_id, it.contact_id, c.whatsapp_connection_id!, campaignId);
      let body: string; let tpl: { name: string; language: string; params: string[] } | null = null;
      if (template) {
        const params = (c.settings?.templateParams ?? []).map((k) => renderTemplate(`{{${k}}}`, data) || "-");
        body = template.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
        tpl = { name: template.name, language: template.language, params };
      } else {
        // Regra da Meta: mensagem livre só dentro da janela de 24h aberta pelo contato
        if (!(await windowOpen(db, convId))) { await finish("skipped", "Fora da janela de 24h: para iniciar conversa use um modelo aprovado pela Meta"); return false; }
        body = renderTemplate(c.message_body ?? "", data);
      }
      const r = await sendAndRecord(db, { companyId: c.company_id, connectionId: c.whatsapp_connection_id!, contactId: it.contact_id, toE164: ct.phone,
        conversationId: convId, body, template: tpl, senderType: "campaign", campaignId });
      if (r.ok) {
        await finish("sent", null, r.messageId);
        await db.exec(`update contacts set commercial_status = 'contacted' where id = $1 and commercial_status = 'new'`, [it.contact_id]);
      } else if (r.retryable && it.attempts < MAX_SEND_ATTEMPTS) {
        await db.exec(`update campaign_contacts set status = 'pending', error = $2 where id = $1`, [it.id, r.error]);
      } else {
        await finish("failed", r.error, r.messageId);
      }
      return false;
    });
    if (stop) return;
  }

  // 3) próximo lote em 60s ou conclusão
  return withScope(SYSTEM, async (db) => {
    const left = await db.one<{ pending: number; sending: number }>(
      `select count(*) filter (where status = 'pending')::int as pending, count(*) filter (where status = 'sending')::int as sending from campaign_contacts where campaign_id = $1`, [campaignId]);
    if (left.pending > 0) return { rescheduleSeconds: 60 };
    if (left.sending === 0) {
      const n = await db.exec(`update campaigns set status = 'completed', completed_at = now() where id = $1 and status = 'running'`, [campaignId]);
      if (n) await recordEvent(db, null, c.company_id, "campaign.completed", { campaignId });
    }
  });
}

async function startScheduled(job: Job): Promise<Result> {
  const campaignId = String(job.payload.campaignId);
  await withScope(SYSTEM, async (db) => {
    const n = await db.exec(`update campaigns set status = 'running', started_at = coalesce(started_at, now()) where id = $1 and status = 'scheduled'`, [campaignId]);
    if (!n) return;
    await db.exec(`update campaign_contacts cc set status = 'skipped',
        error = case when c.consent_status = 'opted_out' then 'Contato descadastrado (opt-out)' else 'Contato sem telefone/WhatsApp' end
       from contacts c where c.id = cc.contact_id and cc.campaign_id = $1 and cc.status = 'pending'
        and (c.consent_status = 'opted_out' or coalesce(c.whatsapp_e164, c.phone_e164) is null)`, [campaignId]);
    await db.exec(`insert into jobs (company_id, type, payload, dedupe_key) values ($1,'campaign.dispatch',$2,$3) on conflict do nothing`,
      [job.company_id, { campaignId }, `campaign.dispatch:${campaignId}`]);
  });
}

// ------------------------------------------------------------- mensagens avulsas
async function sendText(job: Job): Promise<Result> {
  const { conversationId, body, senderType, senderUserId } = job.payload as { conversationId: string; body: string; senderType?: "system" | "user" | "ai"; senderUserId?: string };
  await withScope(SYSTEM, async (db) => {
    const cv = await db.one<{ company_id: string; contact_id: string; whatsapp_connection_id: string; phone: string | null }>(
      `select cv.company_id, cv.contact_id, cv.whatsapp_connection_id, coalesce(c.whatsapp_e164, c.phone_e164) as phone
         from conversations cv join contacts c on c.id = cv.contact_id where cv.id = $1`, [conversationId]);
    if (!cv.phone || !(await windowOpen(db, conversationId))) return;
    const r = await sendAndRecord(db, { companyId: cv.company_id, connectionId: cv.whatsapp_connection_id, contactId: cv.contact_id, toE164: cv.phone,
      conversationId, body, senderType: senderType ?? "system", senderUserId: senderUserId ?? null });
    if (!r.ok && r.retryable) throw new Error(r.error);
  });
}

// ------------------------------------------------------------- coexistência
async function coexistenceSync(job: Job): Promise<Result> {
  const connectionId = String(job.payload.connectionId);
  await withScope(SYSTEM, async (db: Db) => {
    const w = await db.one<{ onboarding: Record<string, unknown> }>(`select onboarding from whatsapp_connections where id = $1`, [connectionId]);
    const creds = await credentialsOf(db, connectionId);
    const patch: Record<string, unknown> = {};
    if (!w.onboarding.contacts_sync_requested_at) { await metaOnboarding.requestSync(creds, "smb_app_state_sync"); patch.contacts_sync_requested_at = new Date().toISOString(); }
    // o histórico só pode ser solicitado UMA vez (documentação da Meta)
    if (!w.onboarding.history_sync_requested_at) { await metaOnboarding.requestSync(creds, "history"); patch.history_sync_requested_at = new Date().toISOString(); }
    if (Object.keys(patch).length) await db.exec(`update whatsapp_connections set onboarding = onboarding || $2 where id = $1`, [connectionId, patch]);
  });
}

// ------------------------------------------------------------- execução
export const HANDLERS: Record<string, (j: Job) => Promise<Result>> = {
  "campaign.dispatch": dispatchCampaign,
  "campaign.start_scheduled": startScheduled,
  "whatsapp.send_text": sendText,
  "whatsapp.coexistence_sync": coexistenceSync,
};

async function reprocessWebhooks() {
  const evs = await withScope(SYSTEM, (db) => db.query<{ id: number; payload: unknown }>(
    `update webhook_events set attempts = attempts + 1 where id in (
       select id from webhook_events where processed_at is null and attempts < 5 and received_at < now() - interval '1 minute'
       order by id limit 20 for update skip locked) returning id, payload`));
  for (const ev of evs) {
    try {
      await processWhatsAppWebhook(ev.payload as never);
      await withScope(SYSTEM, (db) => db.exec(`update webhook_events set processed_at = now(), error = null where id = $1`, [ev.id]));
    } catch (e) {
      await withScope(SYSTEM, (db) => db.exec(`update webhook_events set error = $2 where id = $1`, [ev.id, String((e as Error)?.message ?? e).slice(0, 1000)]));
    }
  }
}

/** Processa até `max` tarefas prontas. Retorna quantas executou. */
export async function runWorkerOnce(max = 10) {
  await withScope(SYSTEM, (db) => db.exec(`update jobs set status = 'pending', locked_at = null where status = 'running' and locked_at < now() - interval '${STUCK_MINUTES} minutes'`));
  const jobs = await withScope(SYSTEM, (db) => db.query<Job>(
    `update jobs set status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1
      where id in (select id from jobs where status = 'pending' and run_at <= now() order by run_at, id limit $2 for update skip locked)
      returning id, company_id, type, payload, attempts, max_attempts`, [WORKER_ID, max]));
  for (const job of jobs) {
    const handler = HANDLERS[job.type];
    try {
      if (!handler) throw new Error(`Tarefa desconhecida: ${job.type}`);
      const r = await handler(job);
      await withScope(SYSTEM, (db) => r?.rescheduleSeconds
        ? db.exec(`update jobs set status = 'pending', run_at = now() + ($2 || ' seconds')::interval, attempts = 0, locked_at = null where id = $1`, [job.id, r.rescheduleSeconds])
        : db.exec(`update jobs set status = 'done', finished_at = now(), last_error = null where id = $1`, [job.id]));
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 1000);
      await withScope(SYSTEM, (db) => db.exec(
        `update jobs set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
            run_at = now() + (power(2, attempts) || ' minutes')::interval, last_error = $2, locked_at = null,
            finished_at = case when attempts >= max_attempts then now() else null end where id = $1`, [job.id, msg]));
    }
  }
  await reprocessWebhooks();
  return jobs.length;
}

let timer: NodeJS.Timeout | null = null;
let busy = false;
export function startWorker(intervalMs = 5000) {
  if (timer) return;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await runWorkerOnce(); } catch (e) { console.error("[worker]", e); } finally { busy = false; }
  }, intervalMs);
  console.log(`[worker] fila de processamento ativa (${WORKER_ID})`);
}
