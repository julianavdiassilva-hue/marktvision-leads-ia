import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { assertPlatformAdmin, scopeOf } from "../guards";

export async function platformOverview(ctx: AuthContext) {
  assertPlatformAdmin(ctx);
  return withScope(scopeOf(ctx), async (db) => {
    const totals = await db.one<{
      companies: number; active_companies: number; users: number; active_sessions: number;
      contacts: number; campaigns: number; messages_month: number; logins_7d: number;
    }>(`select
          (select count(*)::int from companies) as companies,
          (select count(*)::int from companies where is_active) as active_companies,
          (select count(*)::int from users where not is_platform_admin) as users,
          (select count(distinct user_id)::int from sessions where last_seen_at > now() - interval '1 day') as active_sessions,
          (select count(*)::int from contacts) as contacts,
          (select count(*)::int from campaigns) as campaigns,
          (select count(*)::int from messages where created_at >= date_trunc('month', now())) as messages_month,
          (select count(*)::int from login_attempts where success and created_at > now() - interval '7 days') as logins_7d`);
    const usage = await db.query<{
      id: string; name: string; is_active: boolean; plan_name: string | null; users: number;
      contacts: number; campaigns: number; messages_month: number; last_activity: string | null;
    }>(`select c.id, c.name, c.is_active, p.name as plan_name,
               (select count(*)::int from company_memberships m where m.company_id = c.id and m.is_active) as users,
               (select count(*)::int from contacts x where x.company_id = c.id) as contacts,
               (select count(*)::int from campaigns x where x.company_id = c.id) as campaigns,
               (select count(*)::int from messages x where x.company_id = c.id and x.created_at >= date_trunc('month', now())) as messages_month,
               (select max(s.last_seen_at) from sessions s join company_memberships m on m.user_id = s.user_id where m.company_id = c.id) as last_activity
          from companies c left join plans p on p.id = c.plan_id order by c.name`);
    const logs = await db.query<{
      id: number; action: string; entity_type: string | null; created_at: string; user_name: string | null; company_name: string | null; data: unknown;
    }>(`select a.id, a.action, a.entity_type, a.created_at, u.name as user_name, c.name as company_name, a.data
          from audit_logs a left join users u on u.id = a.user_id left join companies c on c.id = a.company_id
         order by a.created_at desc limit 50`);
    return { totals, usage, logs };
  });
}
