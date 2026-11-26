import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { forbidden, notFound } from "../errors";
import { assertCompany, assertFeature, isCompanyAdmin, scopeOf } from "../guards";
import { audit } from "../audit";
import { optionalText, parse, requiredText, uuid } from "../validation";

const listSchema = z.object({ name: requiredText("o nome da lista", 120), description: optionalText(500) });

export type ListRow = { id: string; name: string; description: string | null; contacts: number; created_at: string; created_by_name: string | null; campaigns: number };

export async function listLists(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contact_lists");
  return withScope(scopeOf(ctx), (db) => db.query<ListRow>(
    `select l.id, l.name, l.description, l.created_at, u.name as created_by_name,
            (select count(*)::int from contact_list_members m where m.list_id = l.id) as contacts,
            (select count(*)::int from campaigns c where c.list_id = l.id) as campaigns
       from contact_lists l left join users u on u.id = l.created_by
      where l.company_id = $1 order by l.created_at desc`, [companyId]));
}

/** Opções de lista para seletores (usado por contatos, importação e campanhas). */
export async function listOptions(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  return withScope(scopeOf(ctx), (db) => db.query<{ id: string; name: string; contacts: number }>(
    `select l.id, l.name, (select count(*)::int from contact_list_members m where m.list_id = l.id) as contacts
       from contact_lists l where l.company_id = $1 order by l.name`, [companyId]));
}

export async function getList(ctx: AuthContext, listId: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contact_lists");
  parse(uuid, listId);
  return withScope(scopeOf(ctx), async (db) => {
    const l = await db.maybeOne<{ id: string; name: string; description: string | null; contacts: number }>(
      `select l.id, l.name, l.description, (select count(*)::int from contact_list_members m where m.list_id = l.id) as contacts
         from contact_lists l where l.id = $1 and l.company_id = $2`, [listId, companyId]);
    if (!l) throw notFound("Lista não encontrada.");
    return l;
  });
}

export async function createList(ctx: AuthContext, raw: z.input<typeof listSchema>) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contact_lists");
  const i = parse(listSchema, raw);
  return withScope(scopeOf(ctx), async (db) => {
    const id = randomUUID();
    await db.exec(`insert into contact_lists (id, company_id, name, description, created_by) values ($1,$2,$3,$4,$5)`,
      [id, companyId, i.name, i.description ?? null, ctx.user.id]);
    return { id };
  });
}

export async function updateList(ctx: AuthContext, listId: string, raw: z.input<typeof listSchema>) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contact_lists");
  parse(uuid, listId);
  const i = parse(listSchema, raw);
  return withScope(scopeOf(ctx), async (db) => {
    const n = await db.exec(`update contact_lists set name=$3, description=$4 where id=$1 and company_id=$2`, [listId, companyId, i.name, i.description ?? null]);
    if (!n) throw notFound("Lista não encontrada.");
  });
}

/** Excluir a lista NÃO exclui os contatos (eles continuam na base central). */
export async function deleteList(ctx: AuthContext, listId: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contact_lists");
  if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador da empresa pode excluir listas.");
  parse(uuid, listId);
  return withScope(scopeOf(ctx), async (db) => {
    const n = await db.exec(`delete from contact_lists where id=$1 and company_id=$2`, [listId, companyId]);
    if (!n) throw notFound("Lista não encontrada.");
    await audit(db, ctx, "list.delete", { type: "contact_list", id: listId });
  });
}
