import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { forbidden, notFound } from "../errors";
import { assertCompany, assertFeature, isCompanyAdmin, scopeOf } from "../guards";
import { parse, requiredText, uuid } from "../validation";

const tagSchema = z.object({
  name: requiredText("o nome da etiqueta", 60),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida."),
});
export const TAG_COLORS = ["#008C48", "#0E7490", "#2563EB", "#7C3AED", "#C026D3", "#DC2626", "#EA580C", "#CA8A04", "#4B5563", "#0F766E"];

export type TagRow = { id: string; name: string; color: string; contacts: number };

export async function listTags(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  return withScope(scopeOf(ctx), (db) => db.query<TagRow>(
    `select t.id, t.name, t.color, (select count(*)::int from contact_tags ct where ct.tag_id = t.id) as contacts
       from tags t where t.company_id = $1 order by t.name`, [companyId]));
}

export async function createTag(ctx: AuthContext, raw: z.input<typeof tagSchema>) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "tags");
  const i = parse(tagSchema, raw);
  return withScope(scopeOf(ctx), async (db) => {
    const id = randomUUID();
    await db.exec(`insert into tags (id, company_id, name, color) values ($1,$2,$3,$4)`, [id, companyId, i.name, i.color.toUpperCase()]);
    return { id };
  });
}

export async function updateTag(ctx: AuthContext, tagId: string, raw: z.input<typeof tagSchema>) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "tags");
  if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador da empresa edita etiquetas.");
  parse(uuid, tagId);
  const i = parse(tagSchema, raw);
  return withScope(scopeOf(ctx), async (db) => {
    const n = await db.exec(`update tags set name=$3, color=$4 where id=$1 and company_id=$2`, [tagId, companyId, i.name, i.color.toUpperCase()]);
    if (!n) throw notFound("Etiqueta não encontrada.");
  });
}

export async function deleteTag(ctx: AuthContext, tagId: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "tags");
  if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador da empresa exclui etiquetas.");
  parse(uuid, tagId);
  return withScope(scopeOf(ctx), async (db) => {
    const n = await db.exec(`delete from tags where id=$1 and company_id=$2`, [tagId, companyId]);
    if (!n) throw notFound("Etiqueta não encontrada.");
  });
}
