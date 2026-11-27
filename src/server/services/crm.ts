import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope, type Db } from "../db";
import { AppError, forbidden, invalid, notFound } from "../errors";
import { assertCompany, assertFeature, isCompanyAdmin, scopeOf } from "../guards";
import { recordEvent } from "../events";
import { optionalText, parse, requiredText, uuid } from "../validation";

export const LOST_REASONS = ["Preço", "Escolheu concorrente", "Sem orçamento no momento", "Sem resposta", "Não tem interesse", "Fora do perfil", "Outro"];

export type Stage = { id: string; name: string; position: number; kind: "open" | "won" | "lost"; color: string; count: number; total: string };
export type OppCard = {
  id: string; stage_id: string; title: string | null; value: string | null; status: string; contact_id: string; contact_name: string | null;
  organization: string | null; phone_e164: string | null; owner_user_id: string | null; owner_name: string | null; campaign_name: string | null;
  conversation_id: string | null; next_follow_up_at: string | null; lost_reason: string | null; notes: string | null; position: number;
  updated_at: string; created_at: string;
};

const sellerOnly = (ctx: AuthContext, alias = "o") => (ctx.role === "seller" ? `and ${alias}.owner_user_id = '${ctx.user.id}'::uuid` : "");

async function defaultPipeline(db: Db, companyId: string) {
  const p = await db.maybeOne<{ id: string; name: string }>(`select id, name from pipelines where company_id = $1 and is_default`, [companyId]);
  if (!p) throw notFound("Funil não encontrado.");
  return p;
}

async function loadOpp(db: Db, ctx: AuthContext, id: string) {
  parse(uuid, id);
  const o = await db.maybeOne<{ id: string; contact_id: string; stage_id: string; status: string; owner_user_id: string | null; campaign_id: string | null; pipeline_id: string; value: string | null }>(
    `select o.id, o.contact_id, o.stage_id, o.status, o.owner_user_id, o.campaign_id, o.pipeline_id, o.value::text from opportunities o
      where o.id = $1 and o.company_id = $2 ${sellerOnly(ctx)}`, [id, ctx.company!.id]);
  if (!o) throw notFound("Negociação não encontrada.");
  return o;
}

export async function getBoard(ctx: AuthContext, f: { ownerId?: string; q?: string; status?: "open" | "all" } = {}) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "crm");
  return withScope(scopeOf(ctx), async (db) => {
    const pipeline = await defaultPipeline(db, companyId);
    const p: unknown[] = [companyId, pipeline.id];
    const w: string[] = [];
    if (f.ownerId && uuid.safeParse(f.ownerId).success && ctx.role !== "seller") { p.push(f.ownerId); w.push(`o.owner_user_id = $${p.length}`); }
    if (f.ownerId === "none" && ctx.role !== "seller") w.push(`o.owner_user_id is null`);
    if (f.q?.trim()) { p.push(`%${f.q.trim()}%`); w.push(`(c.name ilike $${p.length} or c.organization ilike $${p.length} or o.title ilike $${p.length})`); }
    // negociações ganhas/perdidas há mais de 30 dias saem do quadro (continuam na lista e nos relatórios)
    if (f.status !== "all") w.push(`(o.status = 'open' or coalesce(o.won_at, o.lost_at, o.updated_at) > now() - interval '30 days')`);
    const cards = await db.query<OppCard>(
      `select o.id, o.stage_id, o.title, o.value::text, o.status, o.contact_id, c.name as contact_name, c.organization, c.phone_e164,
              o.owner_user_id, u.name as owner_name, ca.name as campaign_name, o.conversation_id, o.next_follow_up_at, o.lost_reason, o.notes,
              o.position, o.updated_at, o.created_at
         from opportunities o join contacts c on c.id = o.contact_id left join users u on u.id = o.owner_user_id left join campaigns ca on ca.id = o.campaign_id
        where o.company_id = $1 and o.pipeline_id = $2 ${sellerOnly(ctx)} ${w.length ? "and " + w.join(" and ") : ""}
        order by o.position, o.updated_at desc limit 2000`, p);
    const stages = (await db.query<Omit<Stage, "count" | "total">>(
      `select id, name, position, kind, color from pipeline_stages where pipeline_id = $1 order by position`, [pipeline.id])).map((s) => {
      const inStage = cards.filter((c) => c.stage_id === s.id);
      return { ...s, count: inStage.length, total: inStage.reduce((a, c) => a + Number(c.value ?? 0), 0).toFixed(2) } as Stage;
    });
    return { pipeline, stages, cards };
  });
}

const oppSchema = z.object({
  contactId: uuid,
  title: optionalText(160),
  value: z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(/\./g, "").replace(",", "."))), z.number({ error: "Valor inválido." }).min(0, "Valor inválido.").max(1e12).nullable()).optional(),
  stageId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  ownerUserId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().optional()),
  nextFollowUpAt: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  notes: optionalText(5000),
});

export async function createOpportunity(ctx: AuthContext, raw: z.input<typeof oppSchema>) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "crm");
  const i = parse(oppSchema, raw);
  return withScope(scopeOf(ctx), async (db) => {
    const ct = await db.maybeOne<{ owner_user_id: string | null }>(
      `select owner_user_id from contacts c where id = $1 and company_id = $2 ${ctx.role === "seller" ? `and c.owner_user_id = '${ctx.user.id}'::uuid` : ""}`, [i.contactId, companyId]);
    if (!ct) throw notFound("Contato não encontrado.");
    const pipeline = await defaultPipeline(db, companyId);
    const stage = i.stageId
      ? await db.maybeOne<{ id: string; kind: string }>(`select id, kind from pipeline_stages where id = $1 and pipeline_id = $2`, [i.stageId, pipeline.id])
      : await db.maybeOne<{ id: string; kind: string }>(`select id, kind from pipeline_stages where pipeline_id = $1 and kind = 'open' order by position limit 1`, [pipeline.id]);
    if (!stage || stage.kind !== "open") throw invalid("Escolha uma etapa em aberto para criar a negociação.");
    const owner = ctx.role === "seller" ? ctx.user.id : (i.ownerUserId ?? ct.owner_user_id ?? ctx.user.id);
    const conv = await db.maybeOne<{ id: string; origin_campaign_id: string | null }>(
      `select id, origin_campaign_id from conversations where contact_id = $1 order by last_message_at desc nulls last limit 1`, [i.contactId]);
    const cc = await db.maybeOne<{ campaign_id: string }>(`select campaign_id from campaign_contacts where contact_id = $1 order by created_at desc limit 1`, [i.contactId]);
    const id = randomUUID();
    await db.exec(
      `insert into opportunities (id, company_id, contact_id, pipeline_id, stage_id, owner_user_id, campaign_id, conversation_id, title, value, next_follow_up_at, notes, position)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, (select coalesce(min(position), 0) - 1 from opportunities where stage_id = $5))`,
      [id, companyId, i.contactId, pipeline.id, stage.id, owner, conv?.origin_campaign_id ?? cc?.campaign_id ?? null, conv?.id ?? null, i.title ?? null, i.value ?? null,
       i.nextFollowUpAt ? new Date(i.nextFollowUpAt).toISOString() : null, i.notes ?? null]);
    await db.exec(`update contacts set commercial_status = 'negotiating', owner_user_id = coalesce(owner_user_id, $2) where id = $1 and commercial_status not in ('customer')`, [i.contactId, owner]);
    await recordEvent(db, ctx, companyId, "opportunity.created", { contactId: i.contactId, campaignId: conv?.origin_campaign_id ?? cc?.campaign_id ?? null, entityType: "opportunity", entityId: id });
    return { id };
  });
}

export async function updateOpportunity(ctx: AuthContext, id: string, raw: Partial<z.input<typeof oppSchema>>) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "crm");
  const i = parse(oppSchema.partial().omit({ contactId: true, stageId: true }), raw);
  return withScope(scopeOf(ctx), async (db) => {
    const o = await loadOpp(db, ctx, id);
    let owner = o.owner_user_id;
    if (i.ownerUserId !== undefined && i.ownerUserId !== o.owner_user_id) {
      if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador transfere negociações entre vendedores.");
      if (i.ownerUserId && !(await db.maybeOne(`select 1 from company_memberships where company_id = $1 and user_id = $2 and is_active`, [companyId, i.ownerUserId]))) throw invalid("Vendedor inválido.");
      owner = i.ownerUserId ?? null;
    }
    await db.exec(`update opportunities set title = coalesce($2, title), value = $3, next_follow_up_at = $4, notes = $5, owner_user_id = $6 where id = $1`,
      [id, i.title ?? null, i.value === undefined ? o.value : i.value, i.nextFollowUpAt ? new Date(i.nextFollowUpAt).toISOString() : null, i.notes ?? null, owner]);
    if (owner !== o.owner_user_id) {
      await db.exec(`update contacts set owner_user_id = $2 where id = $1`, [o.contact_id, owner]);
      await db.exec(`update conversations set assigned_user_id = $2 where contact_id = $1`, [o.contact_id, owner]);
    }
  });
}

/** Mover no quadro. Etapas de ganho/perda exigem os dados da venda/perda. */
export async function moveOpportunity(ctx: AuthContext, id: string, stageId: string, beforeId?: string | null) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "crm");
  return withScope(scopeOf(ctx), async (db) => {
    const o = await loadOpp(db, ctx, id);
    parse(uuid, stageId);
    const st = await db.maybeOne<{ id: string; kind: string; name: string }>(`select id, kind, name from pipeline_stages where id = $1 and pipeline_id = $2`, [stageId, o.pipeline_id]);
    if (!st) throw notFound("Etapa não encontrada.");
    if (st.kind === "won") throw new AppError("VALIDATION", "Para mover para a etapa de venda, registre a venda (valor).");
    if (st.kind === "lost") throw new AppError("VALIDATION", "Para mover para Perdido, informe o motivo da perda.");
    // posição: antes do card indicado ou no fim da coluna
    let pos: number;
    if (beforeId && uuid.safeParse(beforeId).success) {
      const b = await db.maybeOne<{ position: number }>(`select position from opportunities where id = $1 and stage_id = $2`, [beforeId, stageId]);
      const prev = b ? await db.maybeOne<{ position: number }>(`select max(position) as position from opportunities where stage_id = $1 and position < $2`, [stageId, b.position]) : null;
      pos = b ? ((prev?.position ?? b.position - 2) + b.position) / 2 : 0;
    } else {
      pos = ((await db.one<{ p: number | null }>(`select max(position) as p from opportunities where stage_id = $1 and id <> $2`, [stageId, id])).p ?? 0) + 1;
    }
    const reopened = o.status !== "open";
    await db.exec(`update opportunities set stage_id = $2, position = $3, status = 'open', won_at = null, lost_at = null, lost_reason = null where id = $1`, [id, stageId, pos]);
    if (reopened) await db.exec(`delete from sales where opportunity_id = $1`, [id]);
    if (o.stage_id !== stageId || reopened) {
      await db.exec(`update contacts set commercial_status = 'negotiating' where id = $1`, [o.contact_id]);
      await recordEvent(db, ctx, companyId, "opportunity.stage_changed", { contactId: o.contact_id, campaignId: o.campaign_id, entityType: "opportunity", entityId: id }, { stage: st.name, reopened });
    }
  });
}

/** Venda: atualiza oportunidade, contato, vendedor e campanha de origem (dashboard e relatórios). */
export async function winOpportunity(ctx: AuthContext, id: string, raw: { amount: unknown; notes?: string }) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "crm");
  const amount = parse(z.preprocess((v) => Number(String(v ?? "").replace(/\./g, "").replace(",", ".")), z.number({ error: "Informe o valor da venda." }).positive("Informe o valor da venda.").max(1e12)), raw.amount);
  return withScope(scopeOf(ctx), async (db) => {
    const o = await loadOpp(db, ctx, id);
    if (o.status === "won") throw new AppError("CONFLICT", "Esta negociação já foi registrada como venda.");
    const won = await db.one<{ id: string }>(`select id from pipeline_stages where pipeline_id = $1 and kind = 'won' order by position limit 1`, [o.pipeline_id]);
    await db.exec(`update opportunities set status = 'won', stage_id = $2, value = $3, won_at = now(), lost_at = null, lost_reason = null where id = $1`, [id, won.id, amount]);
    await db.exec(`insert into sales (company_id, opportunity_id, contact_id, seller_user_id, campaign_id, amount, notes, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [companyId, id, o.contact_id, o.owner_user_id ?? ctx.user.id, o.campaign_id, amount, raw.notes?.slice(0, 2000) ?? null, ctx.user.id]);
    await db.exec(`update contacts set commercial_status = 'customer' where id = $1`, [o.contact_id]);
    await recordEvent(db, ctx, companyId, "opportunity.won", { contactId: o.contact_id, campaignId: o.campaign_id, entityType: "opportunity", entityId: id }, { amount });
  });
}

export async function loseOpportunity(ctx: AuthContext, id: string, reason: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "crm");
  const r = parse(requiredText("o motivo da perda", 300), reason);
  return withScope(scopeOf(ctx), async (db) => {
    const o = await loadOpp(db, ctx, id);
    const lost = await db.one<{ id: string }>(`select id from pipeline_stages where pipeline_id = $1 and kind = 'lost' order by position limit 1`, [o.pipeline_id]);
    await db.exec(`update opportunities set status = 'lost', stage_id = $2, lost_reason = $3, lost_at = now(), won_at = null where id = $1`, [id, lost.id, r]);
    await db.exec(`delete from sales where opportunity_id = $1`, [id]);
    await db.exec(`update contacts set commercial_status = 'lost' where id = $1 and not exists (select 1 from opportunities x where x.contact_id = $1 and x.status in ('open','won') and x.id <> $2)`, [o.contact_id, id]);
    await recordEvent(db, ctx, companyId, "opportunity.lost", { contactId: o.contact_id, campaignId: o.campaign_id, entityType: "opportunity", entityId: id }, { reason: r });
  });
}

// ---------------------------------------------------------------------
// Personalização do funil (administrador)
// ---------------------------------------------------------------------
const stageSchema = z.object({ name: requiredText("o nome da etapa", 60), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#008C48") });

export async function saveStage(ctx: AuthContext, raw: z.input<typeof stageSchema>, id?: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "crm");
  if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador personaliza o funil.");
  const i = parse(stageSchema, raw);
  return withScope(scopeOf(ctx), async (db) => {
    const p = await defaultPipeline(db, companyId);
    if (id) {
      parse(uuid, id);
      const n = await db.exec(`update pipeline_stages set name = $3, color = $4 where id = $1 and pipeline_id = $2`, [id, p.id, i.name, i.color]);
      if (!n) throw notFound("Etapa não encontrada.");
      return { id };
    }
    // nova etapa entra antes das etapas de ganho/perda
    const pos = (await db.one<{ p: number }>(`select coalesce(max(position), 0) as p from pipeline_stages where pipeline_id = $1 and kind = 'open'`, [p.id])).p + 1;
    await db.exec(`update pipeline_stages set position = position + 1 where pipeline_id = $1 and position >= $2`, [p.id, pos]);
    const sid = randomUUID();
    await db.exec(`insert into pipeline_stages (id, company_id, pipeline_id, name, position, kind, color) values ($1,$2,$3,$4,$5,'open',$6)`, [sid, companyId, p.id, i.name, pos, i.color]);
    return { id: sid };
  });
}

export async function moveStage(ctx: AuthContext, id: string, direction: -1 | 1) {
  const companyId = assertCompany(ctx);
  if (!isCompanyAdmin(ctx)) throw forbidden();
  return withScope(scopeOf(ctx), async (db) => {
    const p = await defaultPipeline(db, companyId);
    const st = await db.maybeOne<{ id: string; position: number; kind: string }>(`select id, position, kind from pipeline_stages where id = $1 and pipeline_id = $2`, [id, p.id]);
    if (!st || st.kind !== "open") throw invalid("Somente etapas em aberto podem ser reordenadas.");
    const other = await db.maybeOne<{ id: string; position: number }>(
      `select id, position from pipeline_stages where pipeline_id = $1 and kind = 'open' and position ${direction < 0 ? "<" : ">"} $2 order by position ${direction < 0 ? "desc" : "asc"} limit 1`, [p.id, st.position]);
    if (!other) return;
    await db.exec(`update pipeline_stages set position = $2 where id = $1`, [st.id, other.position]);
    await db.exec(`update pipeline_stages set position = $2 where id = $1`, [other.id, st.position]);
  });
}

export async function deleteStage(ctx: AuthContext, id: string) {
  const companyId = assertCompany(ctx);
  if (!isCompanyAdmin(ctx)) throw forbidden();
  parse(uuid, id);
  return withScope(scopeOf(ctx), async (db) => {
    const p = await defaultPipeline(db, companyId);
    const st = await db.maybeOne<{ kind: string }>(`select kind from pipeline_stages where id = $1 and pipeline_id = $2`, [id, p.id]);
    if (!st) throw notFound("Etapa não encontrada.");
    if (st.kind !== "open") throw invalid("As etapas de venda e de perda são obrigatórias.");
    const { n } = await db.one<{ n: number }>(`select count(*)::int as n from opportunities where stage_id = $1`, [id]);
    if (n) throw new AppError("CONFLICT", `Há ${n} negociação(ões) nesta etapa. Mova-as antes de excluir.`);
    const { open } = await db.one<{ open: number }>(`select count(*)::int as open from pipeline_stages where pipeline_id = $1 and kind = 'open'`, [p.id]);
    if (open <= 1) throw invalid("O funil precisa de pelo menos uma etapa em aberto.");
    await db.exec(`delete from pipeline_stages where id = $1`, [id]);
  });
}

export async function contactSearch(ctx: AuthContext, q: string) {
  const companyId = assertCompany(ctx);
  return withScope(scopeOf(ctx), (db) => db.query<{ id: string; name: string | null; organization: string | null; phone_e164: string | null }>(
    `select id, name, organization, phone_e164 from contacts c where company_id = $1 ${ctx.role === "seller" ? `and c.owner_user_id = '${ctx.user.id}'::uuid` : ""}
       and ($2 = '' or name ilike '%' || $2 || '%' or organization ilike '%' || $2 || '%' or (length(regexp_replace($2, '\\D', '', 'g')) >= 3 and phone_e164 like '%' || regexp_replace($2, '\\D', '', 'g') || '%'))
      order by name nulls last limit 15`, [companyId, (q ?? "").trim().slice(0, 80)]));
}
