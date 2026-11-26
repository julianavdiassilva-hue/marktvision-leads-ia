import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope, type Db } from "../db";
import { AppError, invalid, notFound } from "../errors";
import { assertCompany, assertFeature, scopeOf } from "../guards";
import { recordEvent } from "../events";
import { optionalText, parse, requiredText, uuid } from "../validation";
import { unknownVars } from "@/lib/template";

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", scheduled: "Programada", running: "Em andamento", paused: "Pausada", completed: "Concluída", cancelled: "Cancelada",
};
export const RESPONSE_MODES = ["human", "ai", "ai_then_human"] as const;

const draftSchema = z.object({
  name: requiredText("o nome da campanha", 160),
  listId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().optional()),
  scriptId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().optional()),
  messageBody: optionalText(4000),
  whatsappConnectionId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().optional()),
  responseMode: z.enum(RESPONSE_MODES).default("human"),
  contactIds: z.array(uuid).max(50000).default([]),
});
export type DraftInput = z.input<typeof draftSchema>;

const EDITABLE = ["draft", "scheduled", "paused"];

async function loadCampaign(db: Db, companyId: string, id: string) {
  parse(uuid, id);
  const c = await db.maybeOne<{ id: string; status: string; name: string; number: number; is_archived: boolean; message_body: string | null;
    whatsapp_connection_id: string | null; template_id: string | null; list_id: string | null; script_id: string | null; response_mode: string; settings: Record<string, unknown> }>(
    `select * from campaigns where id = $1 and company_id = $2`, [id, companyId]);
  if (!c) throw notFound("Campanha não encontrada.");
  return c;
}

/** Contatos permitidos (empresa e, para vendedor, só os seus). */
async function permittedContactIds(db: Db, ctx: AuthContext, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.query<{ id: string }>(
    `select id from contacts where company_id = $1 and id = any($2::uuid[]) ${ctx.role === "seller" ? "and owner_user_id = $3" : "and ($3::uuid is null or true)"}`,
    [ctx.company!.id, [...new Set(ids)], ctx.role === "seller" ? ctx.user.id : null]);
  return rows.map((r) => r.id);
}

/** Cria ou atualiza o rascunho com a seleção de contatos (tudo numa transação). */
export async function saveCampaign(ctx: AuthContext, raw: DraftInput, id?: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "campaigns");
  const i = parse(draftSchema, raw);
  if (i.messageBody) {
    const bad = unknownVars(i.messageBody);
    if (bad.length) throw invalid(`Variável desconhecida na mensagem: {{${bad[0]}}}.`, { messageBody: "Variável inválida." });
  }
  return withScope(scopeOf(ctx), async (db) => {
    if (i.listId && !(await db.maybeOne(`select 1 from contact_lists where id=$1 and company_id=$2`, [i.listId, companyId]))) throw notFound("Lista não encontrada.");
    if (i.scriptId && !(await db.maybeOne(`select 1 from scripts where id=$1 and company_id=$2`, [i.scriptId, companyId]))) throw notFound("Modelo não encontrado.");
    if (i.whatsappConnectionId && !(await db.maybeOne(`select 1 from whatsapp_connections where id=$1 and company_id=$2`, [i.whatsappConnectionId, companyId]))) throw notFound("Conexão de WhatsApp não encontrada.");
    let campaignId = id;
    let status = "draft";
    if (id) {
      const c = await loadCampaign(db, companyId, id);
      if (!EDITABLE.includes(c.status)) throw new AppError("CONFLICT", `Uma campanha "${CAMPAIGN_STATUS_LABEL[c.status]}" não pode ser editada. Duplique-a para reaproveitar.`);
      status = c.status;
      await db.exec(
        `update campaigns set name=$3, list_id=$4, script_id=$5, message_body=$6, whatsapp_connection_id=$7, response_mode=$8 where id=$1 and company_id=$2`,
        [id, companyId, i.name, i.listId ?? null, i.scriptId ?? null, i.messageBody ?? null, i.whatsappConnectionId ?? null, i.responseMode]);
    } else {
      await db.query(`select pg_advisory_xact_lock(hashtext('campaign-number:' || $1))`, [companyId]);
      const { n } = await db.one<{ n: number }>(`select coalesce(max(number), 0) + 1 as n from campaigns where company_id = $1`, [companyId]);
      campaignId = randomUUID();
      await db.exec(
        `insert into campaigns (id, company_id, number, name, list_id, script_id, message_body, whatsapp_connection_id, response_mode, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [campaignId, companyId, n, i.name, i.listId ?? null, i.scriptId ?? null, i.messageBody ?? null, i.whatsappConnectionId ?? null, i.responseMode, ctx.user.id]);
      await recordEvent(db, ctx, companyId, "campaign.created", { campaignId, entityType: "campaign", entityId: campaignId }, { name: i.name });
    }
    // Seleção de contatos: em campanha pausada só é possível ACRESCENTAR (quem já recebeu nunca é removido nem reenviado)
    const ids = await permittedContactIds(db, ctx, i.contactIds);
    if (status !== "paused") {
      await db.exec(`delete from campaign_contacts where campaign_id = $1 and status = 'pending' and not (contact_id = any($2::uuid[]))`, [campaignId, ids]);
    }
    await db.exec(
      `insert into campaign_contacts (company_id, campaign_id, contact_id) select $1, $2, unnest($3::uuid[]) on conflict (campaign_id, contact_id) do nothing`,
      [companyId, campaignId, ids]);
    return { id: campaignId! };
  });
}

export type CampaignStats = {
  total: number; pending: number; sent: number; delivered: number; replies: number; failed: number; skipped: number;
  converted: number; sales_count: number; sales_amount: string; progress: number;
};

const STATS_SQL = `
  (select count(*)::int from campaign_contacts cc where cc.campaign_id = c.id) as total,
  (select count(*)::int from campaign_contacts cc where cc.campaign_id = c.id and cc.status in ('pending','queued','sending')) as pending,
  (select count(*)::int from campaign_contacts cc where cc.campaign_id = c.id and cc.status in ('sent','delivered','read','replied')) as sent,
  (select count(*)::int from campaign_contacts cc where cc.campaign_id = c.id and cc.status in ('delivered','read','replied')) as delivered,
  (select count(*)::int from campaign_contacts cc where cc.campaign_id = c.id and cc.status = 'replied') as replies,
  (select count(*)::int from campaign_contacts cc where cc.campaign_id = c.id and cc.status = 'failed') as failed,
  (select count(*)::int from campaign_contacts cc where cc.campaign_id = c.id and cc.status = 'skipped') as skipped,
  (select count(*)::int from opportunities o where o.campaign_id = c.id) as converted,
  (select count(*)::int from sales s where s.campaign_id = c.id) as sales_count,
  (select coalesce(sum(amount),0)::text from sales s where s.campaign_id = c.id) as sales_amount`;

function withProgress<T extends Omit<CampaignStats, "progress">>(r: T): T & { progress: number } {
  const processed = r.total - r.pending;
  return { ...r, progress: r.total ? Math.round((processed / r.total) * 100) : 0 };
}

export type CampaignRow = CampaignStats & {
  id: string; number: number; name: string; status: string; is_archived: boolean; list_name: string | null;
  scheduled_at: string | null; created_at: string; connection_name: string | null; response_mode: string;
};

export async function listCampaigns(ctx: AuthContext, opts: { archived?: boolean; q?: string; status?: string } = {}) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "campaigns");
  return withScope(scopeOf(ctx), async (db) => (await db.query<CampaignRow>(
    `select c.id, c.number, c.name, c.status, c.is_archived, c.scheduled_at, c.created_at, c.response_mode,
            l.name as list_name, w.display_name as connection_name, ${STATS_SQL}
       from campaigns c left join contact_lists l on l.id = c.list_id left join whatsapp_connections w on w.id = c.whatsapp_connection_id
      where c.company_id = $1 and c.is_archived = $2
        and ($3::text is null or c.name ilike '%' || $3 || '%')
        and ($4::text is null or c.status = $4)
      order by c.number desc`, [companyId, !!opts.archived, opts.q?.trim() || null, opts.status || null])).map(withProgress));
}

export async function getCampaign(ctx: AuthContext, id: string, page = 1, contactStatus?: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "campaigns");
  return withScope(scopeOf(ctx), async (db) => {
    await loadCampaign(db, companyId, id);
    const c = withProgress(await db.one<CampaignRow & { message_body: string | null; script_id: string | null; list_id: string | null;
      whatsapp_connection_id: string | null; started_at: string | null; paused_at: string | null; completed_at: string | null; created_by_name: string | null }>(
      `select c.*, l.name as list_name, w.display_name as connection_name, u.name as created_by_name, ${STATS_SQL}
         from campaigns c left join contact_lists l on l.id = c.list_id left join whatsapp_connections w on w.id = c.whatsapp_connection_id
         left join users u on u.id = c.created_by where c.id = $1`, [id]));
    const size = 50;
    const contacts = await db.query<{ contact_id: string; name: string | null; organization: string | null; phone_e164: string | null;
      status: string; error: string | null; sent_at: string | null; replied_at: string | null; consent_status: string }>(
      `select cc.contact_id, ct.name, ct.organization, ct.phone_e164, cc.status, cc.error, cc.sent_at, cc.replied_at, ct.consent_status
         from campaign_contacts cc join contacts ct on ct.id = cc.contact_id
        where cc.campaign_id = $1 and ($2::text is null or cc.status = $2)
        order by ct.name nulls last, cc.created_at limit ${size} offset ${(Math.max(1, page) - 1) * size}`, [id, contactStatus || null]);
    const contactIds = (await db.query<{ contact_id: string }>(`select contact_id from campaign_contacts where campaign_id = $1`, [id])).map((r) => r.contact_id);
    return { campaign: c, contacts, contactIds };
  });
}

/** Verifica se a campanha pode ser enviada agora. Nunca simula envio. */
async function assertSendable(db: Db, ctx: AuthContext, c: Awaited<ReturnType<typeof loadCampaign>>) {
  assertFeature(ctx, "broadcasts");
  if (!c.message_body?.trim() && !c.template_id) throw invalid("Escreva a mensagem da campanha (etapa Script) antes de iniciar.");
  const { n } = await db.one<{ n: number }>(`select count(*)::int as n from campaign_contacts where campaign_id = $1`, [c.id]);
  if (!n) throw invalid("Selecione os contatos da campanha antes de iniciar.");
  if (!c.whatsapp_connection_id) throw new AppError("INTEGRATION", "Selecione o número de WhatsApp da campanha (etapa WhatsApp). Os números são conectados em WhatsApp Comercial.");
  const w = await db.maybeOne<{ status: string; display_name: string }>(`select status, display_name from whatsapp_connections where id = $1`, [c.whatsapp_connection_id]);
  if (w?.status !== "connected") throw new AppError("INTEGRATION", `O WhatsApp "${w?.display_name ?? ""}" não está conectado. Verifique a conexão em WhatsApp Comercial.`);
}

/** Marca contatos que NÃO podem receber (descadastrados ou sem telefone). */
async function skipIneligible(db: Db, campaignId: string) {
  await db.exec(
    `update campaign_contacts cc set status = 'skipped',
        error = case when c.consent_status = 'opted_out' then 'Contato descadastrado (opt-out)' else 'Contato sem telefone/WhatsApp' end
       from contacts c where c.id = cc.contact_id and cc.campaign_id = $1 and cc.status = 'pending'
        and (c.consent_status = 'opted_out' or coalesce(c.whatsapp_e164, c.phone_e164) is null)`, [campaignId]);
}

export type CampaignOp = "start" | "schedule" | "pause" | "resume" | "cancel" | "archive" | "unarchive" | "duplicate";

export async function campaignTransition(ctx: AuthContext, id: string, op: CampaignOp, arg?: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "campaigns");
  return withScope(scopeOf(ctx), async (db) => {
    const c = await loadCampaign(db, companyId, id);
    const ev = (type: string, data: Record<string, unknown> = {}) => recordEvent(db, ctx, companyId, type, { campaignId: id, entityType: "campaign", entityId: id }, data);
    const deny = (msg: string) => { throw new AppError("CONFLICT", msg); };
    switch (op) {
      case "start": {
        if (!["draft", "scheduled"].includes(c.status)) deny("Somente rascunhos ou campanhas programadas podem ser iniciados.");
        await assertSendable(db, ctx, c);
        await skipIneligible(db, id);
        await db.exec(`update campaigns set status='running', started_at=coalesce(started_at, now()), scheduled_at=null where id=$1`, [id]);
        await db.exec(`insert into jobs (company_id, type, payload, dedupe_key) values ($1,'campaign.dispatch',$2,$3) on conflict do nothing`,
          [companyId, { campaignId: id }, `campaign.dispatch:${id}`]);
        await ev("campaign.started");
        return { message: "Campanha iniciada. Os envios seguem o ritmo seguro configurado." };
      }
      case "schedule": {
        if (!["draft", "scheduled"].includes(c.status)) deny("Somente rascunhos podem ser programados.");
        const when = arg ? new Date(arg) : null;
        if (!when || isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) throw invalid("Informe uma data e hora futura para o início.");
        await assertSendable(db, ctx, c);
        await db.exec(`update campaigns set status='scheduled', scheduled_at=$2 where id=$1`, [id, when.toISOString()]);
        await db.exec(`insert into jobs (company_id, type, payload, run_at, dedupe_key) values ($1,'campaign.start_scheduled',$2,$3,$4)
                       on conflict do nothing`, [companyId, { campaignId: id }, when.toISOString(), `campaign.schedule:${id}`]);
        await ev("campaign.scheduled", { at: when.toISOString() });
        return { message: "Campanha programada." };
      }
      case "pause": {
        if (c.status !== "running") deny("Só é possível pausar uma campanha em andamento.");
        await db.exec(`update campaigns set status='paused', paused_at=now() where id=$1`, [id]);
        // envios já em fila voltam a "pendente": nada se perde e nada é enviado em duplicidade
        await db.exec(`update campaign_contacts set status='pending' where campaign_id=$1 and status='queued'`, [id]);
        await ev("campaign.paused");
        return { message: "Campanha pausada. Nenhum dado foi perdido; retome quando quiser." };
      }
      case "resume": {
        if (c.status !== "paused") deny("Só é possível retomar uma campanha pausada.");
        await assertSendable(db, ctx, c);
        await skipIneligible(db, id);
        await db.exec(`update campaigns set status='running', paused_at=null where id=$1`, [id]);
        await db.exec(`insert into jobs (company_id, type, payload, dedupe_key) values ($1,'campaign.dispatch',$2,$3) on conflict do nothing`,
          [companyId, { campaignId: id }, `campaign.dispatch:${id}`]);
        await ev("campaign.resumed");
        return { message: "Campanha retomada a partir do ponto em que parou." };
      }
      case "cancel": {
        if (["completed", "cancelled"].includes(c.status)) deny("Esta campanha já foi encerrada.");
        await db.exec(`update campaigns set status='cancelled', completed_at=now() where id=$1`, [id]);
        await db.exec(`update jobs set status='cancelled' where payload->>'campaignId' = $1 and status = 'pending'`, [id]);
        await ev("campaign.cancelled");
        return { message: "Campanha cancelada. Os contatos que não receberam ficam registrados como pendentes." };
      }
      case "archive": {
        if (["running", "scheduled"].includes(c.status)) deny("Pause ou cancele a campanha antes de arquivar.");
        await db.exec(`update campaigns set is_archived = true where id=$1`, [id]);
        return { message: "Campanha arquivada." };
      }
      case "unarchive": {
        await db.exec(`update campaigns set is_archived = false where id=$1`, [id]);
        return { message: "Campanha restaurada." };
      }
      case "duplicate": {
        await db.query(`select pg_advisory_xact_lock(hashtext('campaign-number:' || $1))`, [companyId]);
        const { n } = await db.one<{ n: number }>(`select coalesce(max(number), 0) + 1 as n from campaigns where company_id = $1`, [companyId]);
        const newId = randomUUID();
        await db.exec(
          `insert into campaigns (id, company_id, number, name, list_id, script_id, message_body, whatsapp_connection_id, template_id, response_mode, settings, created_by)
           select $2, company_id, $3, left(name || ' (cópia)', 160), list_id, script_id, message_body, whatsapp_connection_id, template_id, response_mode, settings, $4
             from campaigns where id = $1`, [id, newId, n, ctx.user.id]);
        await db.exec(`insert into campaign_contacts (company_id, campaign_id, contact_id) select company_id, $2, contact_id from campaign_contacts where campaign_id = $1`, [id, newId]);
        await recordEvent(db, ctx, companyId, "campaign.created", { campaignId: newId, entityType: "campaign", entityId: newId }, { duplicated_from: id });
        return { message: `Campanha duplicada como nº ${n} (rascunho).`, id: newId };
      }
    }
  });
}

// ---------------------------------------------------------------------
// Apoio ao assistente de criação
// ---------------------------------------------------------------------
export type ContactLite = { id: string; name: string | null; organization: string | null; phone_e164: string | null; city: string | null; consent_status: string; owner_name: string | null };

export async function contactsLite(ctx: AuthContext, sel: { ids?: string[]; listId?: string }) {
  const companyId = assertCompany(ctx);
  const ids = sel.ids ? parse(z.array(uuid).max(50000), sel.ids) : null;
  if (sel.listId) parse(uuid, sel.listId);
  return withScope(scopeOf(ctx), (db) => db.query<ContactLite>(
    `select c.id, c.name, c.organization, c.phone_e164, c.city, c.consent_status, u.name as owner_name
       from contacts c left join users u on u.id = c.owner_user_id
      where c.company_id = $1
        and ($2::uuid[] is null or c.id = any($2::uuid[]))
        and ($3::uuid is null or exists (select 1 from contact_list_members m where m.contact_id = c.id and m.list_id = $3))
        ${ctx.role === "seller" ? "and c.owner_user_id = $4" : "and ($4::uuid is null or true)"}
      order by c.name nulls last limit 50000`, [companyId, ids, sel.listId ?? null, ctx.role === "seller" ? ctx.user.id : null]));
}

export async function whatsappOptions(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  return withScope(scopeOf(ctx), (db) => db.query<{ id: string; display_name: string; phone_number: string | null; status: string }>(
    `select id, display_name, phone_number, status from whatsapp_connections where company_id = $1 order by display_name`, [companyId]));
}

export async function saveSelectionAsList(ctx: AuthContext, name: string, ids: string[]) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contact_lists");
  const n = parse(requiredText("o nome da lista", 120), name);
  return withScope(scopeOf(ctx), async (db) => {
    const ok = await permittedContactIds(db, ctx, ids);
    if (!ok.length) throw invalid("Selecione pelo menos um contato.");
    const listId = randomUUID();
    await db.exec(`insert into contact_lists (id, company_id, name, created_by) values ($1,$2,$3,$4)`, [listId, companyId, n, ctx.user.id]);
    await db.exec(`insert into contact_list_members (company_id, list_id, contact_id) select $1, $2, unnest($3::uuid[])`, [companyId, listId, ok]);
    return { id: listId, count: ok.length };
  });
}
