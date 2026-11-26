import type { AuthContext } from "./auth/core";
import type { Db } from "./db";

/** Linha do tempo comercial (histórico do contato e base para relatórios). */
export async function recordEvent(
  db: Db, ctx: AuthContext | null, companyId: string, type: string,
  ref: { contactId?: string | null; campaignId?: string | null; entityType?: string; entityId?: string | null } = {},
  data: Record<string, unknown> = {},
) {
  await db.exec(
    `insert into domain_events (company_id, type, contact_id, campaign_id, actor_user_id, entity_type, entity_id, data)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [companyId, type, ref.contactId ?? null, ref.campaignId ?? null, ctx?.user.id ?? null, ref.entityType ?? null, ref.entityId ?? null, data]);
}
