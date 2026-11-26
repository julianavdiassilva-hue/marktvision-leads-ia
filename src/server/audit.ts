import type { AuthContext } from "./auth/core";
import type { Db } from "./db";

export async function audit(
  db: Db, ctx: AuthContext | null, action: string,
  entity?: { type: string; id?: string | null; companyId?: string | null }, data: Record<string, unknown> = {},
) {
  await db.exec(
    `insert into audit_logs (company_id, user_id, action, entity_type, entity_id, data) values ($1, $2, $3, $4, $5, $6)`,
    [entity?.companyId ?? ctx?.company?.id ?? null, ctx?.user.id ?? null, action, entity?.type ?? null, entity?.id ?? null, data],
  );
}
