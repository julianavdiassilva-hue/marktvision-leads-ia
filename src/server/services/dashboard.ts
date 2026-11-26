import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { assertCompany, assertFeature, scopeOf } from "../guards";

/**
 * Indicadores calculados SOMENTE a partir do banco. Vendedor vê apenas os seus
 * números (contatos sob sua responsabilidade, suas conversas, suas vendas).
 * Fase 09 amplia com filtros, gráficos e metas.
 */
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
