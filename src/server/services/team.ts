import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { forbidden, invalid } from "../errors";
import { assertCompany, assertFeature, isCompanyAdmin, scopeOf } from "../guards";
import { recordEvent } from "../events";
import { parse, uuid } from "../validation";
import { resolveSelection, type ContactFilters } from "./contacts";

export type Period = { from: string; to: string };
export function periodOf(sp: { de?: string; ate?: string }): Period {
  const now = new Date();
  const from = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const to = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : now.toISOString().slice(0, 10);
  return { from, to };
}

export type SellerIndicator = {
  user_id: string; name: string; role: string; is_active: boolean;
  leads_received: number; leads_attended: number; pending: number; open_opportunities: number;
  sales_count: number; sales_amount: string; won: number; lost: number; avg_first_response_min: number | null;
  goal_target: string | null; goal_metric: string | null; goal_progress: number | null;
};

/** Indicadores por vendedor no período (dados reais). */
export async function sellerIndicators(ctx: AuthContext, period: Period) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "sales_team");
  if (!isCompanyAdmin(ctx)) throw forbidden();
  return withScope(scopeOf(ctx), async (db) => {
    const rows = await db.query<SellerIndicator>(
      `with p as (select $2::date as d1, ($3::date + 1)::timestamptz as d2)
       select u.id as user_id, u.name, m.role, (m.is_active and u.is_active) as is_active,
         (select count(*)::int from conversations c, p where c.company_id = $1 and c.assigned_user_id = u.id and c.created_at >= p.d1 and c.created_at < p.d2) as leads_received,
         (select count(distinct ms.conversation_id)::int from messages ms, p where ms.company_id = $1 and ms.sender_user_id = u.id and ms.direction = 'outbound' and ms.status <> 'failed' and ms.created_at >= p.d1 and ms.created_at < p.d2) as leads_attended,
         (select count(*)::int from conversations c where c.company_id = $1 and c.assigned_user_id = u.id and c.status <> 'closed' and c.unread_count > 0) as pending,
         (select count(*)::int from opportunities o where o.company_id = $1 and o.owner_user_id = u.id and o.status = 'open') as open_opportunities,
         (select count(*)::int from sales s, p where s.company_id = $1 and s.seller_user_id = u.id and s.sold_at >= p.d1 and s.sold_at < p.d2) as sales_count,
         (select coalesce(sum(amount),0)::text from sales s, p where s.company_id = $1 and s.seller_user_id = u.id and s.sold_at >= p.d1 and s.sold_at < p.d2) as sales_amount,
         (select count(*)::int from opportunities o, p where o.company_id = $1 and o.owner_user_id = u.id and o.status = 'won' and o.won_at >= p.d1 and o.won_at < p.d2) as won,
         (select count(*)::int from opportunities o, p where o.company_id = $1 and o.owner_user_id = u.id and o.status = 'lost' and o.lost_at >= p.d1 and o.lost_at < p.d2) as lost,
         (select round(avg(extract(epoch from (fr.first_reply - fi.first_in)) / 60)::numeric, 1)::float from
            (select ms.conversation_id, min(ms.created_at) as first_in from messages ms, p where ms.company_id = $1 and ms.direction = 'inbound' and ms.created_at >= p.d1 and ms.created_at < p.d2 group by 1) fi
            join lateral (select min(r.created_at) as first_reply from messages r where r.conversation_id = fi.conversation_id and r.direction = 'outbound'
                           and r.sender_user_id = u.id and r.status <> 'failed' and r.created_at > fi.first_in) fr on fr.first_reply is not null) as avg_first_response_min,
         g.target::text as goal_target, g.metric as goal_metric
       from company_memberships m join users u on u.id = m.user_id
       left join lateral (select target, metric from goals g, p where g.company_id = $1 and g.user_id = u.id and g.period_start <= ($3::date) and g.period_end >= $2::date
                          order by (g.metric = 'sales_amount') desc, g.created_at desc limit 1) g on true
       where m.company_id = $1 order by m.role desc, u.name`, [companyId, period.from, period.to]);
    return rows.map((r) => ({ ...r, goal_progress: r.goal_target ? Math.round((metricValue(r, r.goal_metric!) / Number(r.goal_target)) * 1000) / 10 : null }));
  });
}

function metricValue(r: SellerIndicator, metric: string) {
  if (metric === "sales_amount") return Number(r.sales_amount);
  if (metric === "sales_count") return r.sales_count;
  if (metric === "leads_attended") return r.leads_attended;
  if (metric === "opportunities_created") return r.open_opportunities + r.won + r.lost;
  return 0;
}

/** Distribuição de leads: rodízio entre os vendedores escolhidos (contatos + conversas + negociações abertas). */
export async function distributeLeads(ctx: AuthContext, sel: { ids?: string[]; filters?: ContactFilters }, userIds: string[], onlyUnassigned = true) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "sales_team");
  if (!isCompanyAdmin(ctx)) throw forbidden();
  const users = parse(z.array(uuid).min(1, "Escolha pelo menos um vendedor.").max(200), userIds);
  const ids = await resolveSelection(ctx, sel);
  if (!ids.length) throw invalid("Nenhum contato selecionado.");
  return withScope(scopeOf(ctx), async (db) => {
    const valid = (await db.query<{ user_id: string }>(`select user_id from company_memberships where company_id = $1 and is_active and user_id = any($2::uuid[]) order by created_at`, [companyId, users])).map((r) => r.user_id);
    if (!valid.length) throw invalid("Vendedores inválidos.");
    const target = (await db.query<{ id: string }>(
      `select id from contacts where company_id = $1 and id = any($2::uuid[]) ${onlyUnassigned ? "and owner_user_id is null" : ""} order by created_at`, [companyId, ids])).map((r) => r.id);
    // começa por quem tem menos contatos, para equilibrar
    const load = await db.query<{ user_id: string; n: number }>(
      `select u as user_id, (select count(*)::int from contacts c where c.company_id = $1 and c.owner_user_id = u) as n from unnest($2::uuid[]) u order by 2, 1`, [companyId, valid]);
    const order = load.map((l) => l.user_id);
    const per: Record<string, number> = {};
    for (const [i, cid] of target.entries()) {
      const uid = order[i % order.length];
      await db.exec(`update contacts set owner_user_id = $2 where id = $1`, [cid, uid]);
      await db.exec(`update conversations set assigned_user_id = $2 where contact_id = $1`, [cid, uid]);
      await db.exec(`update opportunities set owner_user_id = $2 where contact_id = $1 and status = 'open'`, [cid, uid]);
      await recordEvent(db, ctx, companyId, "contact.owner_changed", { contactId: cid }, { owner_user_id: uid, distribution: true });
      per[uid] = (per[uid] ?? 0) + 1;
    }
    return { distributed: target.length, skipped: ids.length - target.length, per };
  });
}

// ---------------------------------------------------------------------
// Metas individuais e coletivas
// ---------------------------------------------------------------------
export const GOAL_METRICS: Record<string, string> = {
  sales_amount: "Valor vendido (R$)", sales_count: "Quantidade de vendas", leads_attended: "Leads atendidos", opportunities_created: "Negociações criadas",
};
const goalSchema = z.object({
  userId: z.preprocess((v) => (v === "" || v === "team" ? null : v), uuid.nullable()),
  metric: z.enum(["sales_amount", "sales_count", "leads_attended", "opportunities_created"]),
  target: z.preprocess((v) => Number(String(v ?? "").replace(/\./g, "").replace(",", ".")), z.number().positive("Informe a meta.")),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inicial inválida."),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida."),
});

export async function saveGoal(ctx: AuthContext, raw: z.input<typeof goalSchema>) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "goals");
  if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador define metas.");
  const i = parse(goalSchema, raw);
  if (i.periodEnd < i.periodStart) throw invalid("A data final deve ser depois da inicial.");
  return withScope(scopeOf(ctx), async (db) => {
    if (i.userId && !(await db.maybeOne(`select 1 from company_memberships where company_id = $1 and user_id = $2`, [companyId, i.userId]))) throw invalid("Vendedor inválido.");
    await db.exec(`delete from goals where company_id = $1 and user_id is not distinct from $2 and metric = $3 and period_start = $4 and period_end = $5`,
      [companyId, i.userId, i.metric, i.periodStart, i.periodEnd]);
    await db.exec(`insert into goals (company_id, user_id, metric, target, period_start, period_end) values ($1,$2,$3,$4,$5,$6)`,
      [companyId, i.userId, i.metric, i.target, i.periodStart, i.periodEnd]);
  });
}

export async function deleteGoal(ctx: AuthContext, id: string) {
  const companyId = assertCompany(ctx);
  if (!isCompanyAdmin(ctx)) throw forbidden();
  parse(uuid, id);
  return withScope(scopeOf(ctx), (db) => db.exec(`delete from goals where id = $1 and company_id = $2`, [id, companyId]));
}

export type GoalRow = { id: string; user_id: string | null; user_name: string | null; metric: string; target: string; period_start: string; period_end: string; achieved: string; progress: number };

/** Metas com o realizado calculado dos dados reais. Vendedor vê as suas e as coletivas. */
export async function listGoals(ctx: AuthContext, period?: Period) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "goals");
  return withScope(scopeOf(ctx), async (db) => (await db.query<Omit<GoalRow, "progress">>(
    `select g.id, g.user_id, u.name as user_name, g.metric, g.target::text, g.period_start::text, g.period_end::text,
       (case g.metric
          when 'sales_amount' then (select coalesce(sum(s.amount),0) from sales s where s.company_id = g.company_id and (g.user_id is null or s.seller_user_id = g.user_id) and s.sold_at >= g.period_start and s.sold_at < g.period_end + 1)
          when 'sales_count' then (select count(*) from sales s where s.company_id = g.company_id and (g.user_id is null or s.seller_user_id = g.user_id) and s.sold_at >= g.period_start and s.sold_at < g.period_end + 1)
          when 'leads_attended' then (select count(distinct m.conversation_id) from messages m where m.company_id = g.company_id and m.direction = 'outbound' and m.sender_type = 'user' and m.status <> 'failed'
                                       and (g.user_id is null or m.sender_user_id = g.user_id) and m.created_at >= g.period_start and m.created_at < g.period_end + 1)
          else (select count(*) from opportunities o where o.company_id = g.company_id and (g.user_id is null or o.owner_user_id = g.user_id) and o.created_at >= g.period_start and o.created_at < g.period_end + 1)
        end)::text as achieved
       from goals g left join users u on u.id = g.user_id
      where g.company_id = $1 ${ctx.role === "seller" ? `and (g.user_id is null or g.user_id = '${ctx.user.id}'::uuid)` : ""}
        and ($2::date is null or (g.period_start <= $3::date and g.period_end >= $2::date))
      order by g.period_start desc, g.user_id nulls first`, [companyId, period?.from ?? null, period?.to ?? null]))
    .map((g) => ({ ...g, progress: Math.round((Number(g.achieved) / Number(g.target)) * 1000) / 10 })));
}
