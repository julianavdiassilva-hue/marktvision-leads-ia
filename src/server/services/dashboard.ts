import { uuid } from "../validation";
import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { assertCompany, assertFeature, scopeOf } from "../guards";

/**
 * Indicadores calculados SOMENTE a partir do banco. Vendedor vê apenas os seus
 * números (contatos sob sua responsabilidade, suas conversas, suas vendas).
 * Fase 09 amplia com filtros, gráficos e metas.
 */
/** Declara os 6 filtros com tipo em toda consulta (Postgres exige todos os parâmetros referenciados). */
const F = "with _f as (select $1::uuid as c, $2::date as f, $3::date as t, $4::uuid as s, $5::uuid as ca, $6::text as o) ";

export async function dashboardSummary(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "dashboard");
  const sellerId = ctx.role === "seller" ? ctx.user.id : null;
  return withScope(scopeOf(ctx), (db) => db.one<{
    contacts: number; leads_month: number; campaigns_running: number; campaigns_paused: number;
    messages_sent: number; messages_delivered: number; replies: number; open_conversations: number;
    qualified: number; open_opportunities: number; sales_count: number; sales_amount: string;
  }>(`select
      (select count(*)::int from contacts where company_id = $1 and ($2::uuid is null or owner_user_id = $2)) as contacts,
      (select count(*)::int from contacts where company_id = $1 and ($2::uuid is null or owner_user_id = $2)
          and created_at >= date_trunc('month', now())) as leads_month,
      (select count(*)::int from campaigns where company_id = $1 and status = 'running' and not is_archived) as campaigns_running,
      (select count(*)::int from campaigns where company_id = $1 and status = 'paused' and not is_archived) as campaigns_paused,
      (select count(*)::int from messages where company_id = $1 and direction = 'outbound' and status in ('sent','delivered','read')) as messages_sent,
      (select count(*)::int from messages where company_id = $1 and direction = 'outbound' and status in ('delivered','read')) as messages_delivered,
      (select count(*)::int from messages where company_id = $1 and direction = 'inbound') as replies,
      (select count(*)::int from conversations where company_id = $1 and status <> 'closed' and ($2::uuid is null or assigned_user_id = $2)) as open_conversations,
      (select count(*)::int from contacts where company_id = $1 and commercial_status = 'qualified' and ($2::uuid is null or owner_user_id = $2)) as qualified,
      (select count(*)::int from opportunities where company_id = $1 and status = 'open' and ($2::uuid is null or owner_user_id = $2)) as open_opportunities,
      (select count(*)::int from sales where company_id = $1 and ($2::uuid is null or seller_user_id = $2)) as sales_count,
      (select coalesce(sum(amount),0)::text from sales where company_id = $1 and ($2::uuid is null or seller_user_id = $2)) as sales_amount`,
    [companyId, sellerId]));
}

// ---------------------------------------------------------------------
// Fase 09 — dashboard com filtros (período, campanha, vendedor, origem)
// ---------------------------------------------------------------------

export type DashFilters = { from: string; to: string; campaignId?: string; sellerId?: string; source?: string };

export async function dashboardData(ctx: AuthContext, f: DashFilters) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "dashboard");
  const seller = ctx.role === "seller" ? ctx.user.id : f.sellerId && uuid.safeParse(f.sellerId).success ? f.sellerId : null;
  const campaign = f.campaignId && uuid.safeParse(f.campaignId).success ? f.campaignId : null;
  const source = f.source && /^[a-z_]+$/.test(f.source) ? f.source : null;
  const P = [companyId, f.from, f.to, seller, campaign, source];
  // filtros reutilizáveis ($4 vendedor, $5 campanha, $6 origem)
  const ctc = (a: string) => `($4::uuid is null or ${a}.owner_user_id = $4) and ($6::text is null or ${a}.source = $6)
    and ($5::uuid is null or exists (select 1 from campaign_contacts x where x.contact_id = ${a}.id and x.campaign_id = $5))`;
  const inPeriod = (col: string) => `${col} >= $2::date and ${col} < ($3::date + 1)`;
  return withScope(scopeOf(ctx), async (db) => {
    const k = await db.one<Record<string, string | number>>(
      `select
        (select count(*)::int from contacts c where c.company_id = $1 and ${ctc("c")}) as contacts,
        (select count(*)::int from contacts c where c.company_id = $1 and ${ctc("c")} and ${inPeriod("c.created_at")}) as leads,
        (select count(*)::int from campaigns where company_id = $1 and status = 'running' and not is_archived and ($5::uuid is null or id = $5)) as campaigns_running,
        (select count(*)::int from campaigns where company_id = $1 and status = 'paused' and not is_archived and ($5::uuid is null or id = $5)) as campaigns_paused,
        (select count(*)::int from messages m join contacts c on c.id = m.contact_id where m.company_id = $1 and m.direction = 'outbound' and m.status in ('sent','delivered','read')
           and ${inPeriod("m.created_at")} and ($5::uuid is null or m.campaign_id = $5) and ($4::uuid is null or c.owner_user_id = $4) and ($6::text is null or c.source = $6)) as sent,
        (select count(*)::int from messages m join contacts c on c.id = m.contact_id where m.company_id = $1 and m.direction = 'outbound' and m.status in ('delivered','read')
           and ${inPeriod("m.created_at")} and ($5::uuid is null or m.campaign_id = $5) and ($4::uuid is null or c.owner_user_id = $4) and ($6::text is null or c.source = $6)) as delivered,
        (select count(distinct m.contact_id)::int from messages m join contacts c on c.id = m.contact_id where m.company_id = $1 and m.direction = 'inbound' and ${inPeriod("m.created_at")} and ${ctc("c")}) as replied_contacts,
        (select count(*)::int from conversations cv join contacts c on c.id = cv.contact_id where cv.company_id = $1 and cv.status <> 'closed' and ${ctc("c")}
           and ($4::uuid is null or cv.assigned_user_id = $4)) as open_conversations,
        (select count(*)::int from contacts c where c.company_id = $1 and c.commercial_status = 'qualified' and ${ctc("c")}) as qualified,
        (select count(*)::int from opportunities o join contacts c on c.id = o.contact_id where o.company_id = $1 and o.status = 'open' and ($4::uuid is null or o.owner_user_id = $4)
           and ($5::uuid is null or o.campaign_id = $5) and ($6::text is null or c.source = $6)) as open_opportunities,
        (select coalesce(sum(o.value),0)::text from opportunities o join contacts c on c.id = o.contact_id where o.company_id = $1 and o.status = 'open' and ($4::uuid is null or o.owner_user_id = $4)
           and ($5::uuid is null or o.campaign_id = $5) and ($6::text is null or c.source = $6)) as pipeline_value,
        (select count(*)::int from sales s join contacts c on c.id = s.contact_id where s.company_id = $1 and ${inPeriod("s.sold_at")} and ($4::uuid is null or s.seller_user_id = $4)
           and ($5::uuid is null or s.campaign_id = $5) and ($6::text is null or c.source = $6)) as sales_count,
        (select coalesce(sum(s.amount),0)::text from sales s join contacts c on c.id = s.contact_id where s.company_id = $1 and ${inPeriod("s.sold_at")} and ($4::uuid is null or s.seller_user_id = $4)
           and ($5::uuid is null or s.campaign_id = $5) and ($6::text is null or c.source = $6)) as sales_amount`, P);
    const daily = await db.query<{ day: string; leads: number; replies: number; sales: number }>(
      `${F}, l as (select date_trunc('day', c.created_at)::date as day, count(*)::int as n from contacts c
           where c.company_id = $1 and ${ctc("c")} and c.created_at >= $2::date and c.created_at < $3::date + 1 group by 1),
         r as (select day, count(distinct contact_id)::int as n from (select date_trunc('day', m.created_at)::date as day, m.contact_id from messages m join contacts c on c.id = m.contact_id
           where m.company_id = $1 and m.direction = 'inbound' and ${ctc("c")} and m.created_at >= $2::date and m.created_at < $3::date + 1) x group by 1),
         v as (select date_trunc('day', s.sold_at)::date as day, count(*)::int as n from sales s join contacts c on c.id = s.contact_id
           where s.company_id = $1 and ($4::uuid is null or s.seller_user_id = $4) and ($5::uuid is null or s.campaign_id = $5) and ($6::text is null or c.source = $6)
             and s.sold_at >= $2::date and s.sold_at < $3::date + 1 group by 1)
       select d::date::text as day, coalesce(l.n, 0) as leads, coalesce(r.n, 0) as replies, coalesce(v.n, 0) as sales
         from generate_series($2::date, $3::date, interval '1 day') d
         left join l on l.day = d::date left join r on r.day = d::date left join v on v.day = d::date order by d`, P);
    const bySeller = ctx.role === "seller" ? [] : await db.query<{ name: string; sales_count: number; sales_amount: string }>(
      `${F}select u.name, count(s.id)::int as sales_count, coalesce(sum(s.amount),0)::text as sales_amount
         from company_memberships m join users u on u.id = m.user_id
         left join sales s on s.seller_user_id = u.id and s.company_id = $1 and ${inPeriod("s.sold_at")} and ($5::uuid is null or s.campaign_id = $5)
        where m.company_id = $1 and m.is_active and ($4::uuid is null or u.id = $4) group by u.name order by coalesce(sum(s.amount),0) desc, u.name`, P);
    const byCampaign = await db.query<{ id: string; number: number; name: string; status: string; total: number; sent: number; replies: number; converted: number; sales_count: number; sales_amount: string }>(
      `${F}select ca.id, ca.number, ca.name, ca.status,
         (select count(*)::int from campaign_contacts cc where cc.campaign_id = ca.id) as total,
         (select count(*)::int from campaign_contacts cc where cc.campaign_id = ca.id and cc.status in ('sent','delivered','read','replied')) as sent,
         (select count(*)::int from campaign_contacts cc where cc.campaign_id = ca.id and cc.status = 'replied') as replies,
         (select count(*)::int from opportunities o where o.campaign_id = ca.id and ($4::uuid is null or o.owner_user_id = $4)) as converted,
         (select count(*)::int from sales s where s.campaign_id = ca.id and ($4::uuid is null or s.seller_user_id = $4)) as sales_count,
         (select coalesce(sum(amount),0)::text from sales s where s.campaign_id = ca.id and ($4::uuid is null or s.seller_user_id = $4)) as sales_amount
         from campaigns ca where ca.company_id = $1 and not ca.is_archived and ($5::uuid is null or ca.id = $5)
          and (ca.created_at < ($3::date + 1)) order by ca.number desc limit 10`, P);
    const options = await db.query<{ kind: string; id: string; name: string }>(
      `select 'campaign' as kind, id::text, '#' || number || ' ' || name as name from campaigns where company_id = $1 and not is_archived
       union all select 'seller', u.id::text, u.name from company_memberships m join users u on u.id = m.user_id where m.company_id = $1 and m.is_active order by 1, 3`, [companyId]);
    return { k, daily, bySeller, byCampaign, options, seller };
  });
}
