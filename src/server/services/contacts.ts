import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope, type Db } from "../db";
import { AppError, forbidden, invalid, notFound } from "../errors";
import { assertCompany, assertFeature, isCompanyAdmin, scopeOf } from "../guards";
import { recordEvent } from "../events";
import { companyLimits } from "../permissions";
import { optionalText, parse, uuid } from "../validation";
import { normalizePhone } from "@/lib/phone";

export const SOURCES = ["manual", "google", "import", "whatsapp", "campaign", "api"] as const;
export type Source = (typeof SOURCES)[number];
export const COMMERCIAL_STATUS = ["new", "contacted", "in_progress", "qualified", "negotiating", "customer", "lost", "unqualified"] as const;
export const CONSENT = ["unknown", "opted_in", "opted_out"] as const;

const contactSchema = z.object({
  name: optionalText(160), phone: optionalText(40), whatsapp: optionalText(40), email: optionalText(160),
  organization: optionalText(160), city: optionalText(100), state: optionalText(60), neighborhood: optionalText(100),
  address: optionalText(300), website: optionalText(300), category: optionalText(120), notes: optionalText(5000),
  commercialStatus: z.preprocess((v) => (v === "" ? undefined : v), z.enum(COMMERCIAL_STATUS).optional()),
});
export type ContactInput = z.input<typeof contactSchema>;

/** Linha já normalizada, pronta para gravação (usada por cadastro manual, Google e planilhas). */
export type NormalizedContact = {
  name?: string | null; phone_e164?: string | null; whatsapp_e164?: string | null; email?: string | null;
  organization?: string | null; city?: string | null; state?: string | null; neighborhood?: string | null;
  address?: string | null; website?: string | null; category?: string | null; rating?: number | null;
  notes?: string | null; google_place_id?: string | null; source_detail?: Record<string, unknown>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeContactInput(raw: ContactInput): NormalizedContact {
  const i = parse(contactSchema, raw);
  const phone = i.phone ? normalizePhone(i.phone) : null;
  if (i.phone && !phone) throw invalid("Telefone inválido. Informe DDD e número.", { phone: "Telefone inválido." });
  const wa = i.whatsapp ? normalizePhone(i.whatsapp) : null;
  if (i.whatsapp && !wa) throw invalid("WhatsApp inválido. Informe DDD e número.", { whatsapp: "Número inválido." });
  if (i.email && !EMAIL_RE.test(i.email)) throw invalid("E-mail inválido.", { email: "E-mail inválido." });
  const n: NormalizedContact = {
    name: i.name ?? null, phone_e164: phone, whatsapp_e164: wa && wa !== phone ? wa : null, email: i.email?.toLowerCase() ?? null,
    organization: i.organization ?? null, city: i.city ?? null, state: i.state ?? null, neighborhood: i.neighborhood ?? null,
    address: i.address ?? null, website: i.website ?? null, category: i.category ?? null, notes: i.notes ?? null,
  };
  if (!n.name && !n.phone_e164 && !n.email && !n.organization)
    throw invalid("Informe pelo menos nome, telefone, e-mail ou empresa do contato.");
  return n;
}

/** Vendedor só enxerga os contatos sob sua responsabilidade. */
const ownerClause = (ctx: AuthContext, alias = "c", param = "$2") =>
  ctx.role === "seller" ? `and ${alias}.owner_user_id = ${param}` : `and (${param}::uuid is null or true)`;
const sellerParam = (ctx: AuthContext) => (ctx.role === "seller" ? ctx.user.id : null);

async function assertContactLimit(db: Db, companyId: string, adding: number) {
  const limits = await companyLimits(db, companyId);
  if (limits.max_contacts == null) return;
  const { n } = await db.one<{ n: number }>(`select count(*)::int as n from contacts where company_id = $1`, [companyId]);
  if (n + adding > limits.max_contacts)
    throw new AppError("LIMIT", `Limite de ${limits.max_contacts} contatos do plano atingido (atual: ${n}).`);
}

/** Procura contato existente pelos identificadores (telefone, WhatsApp, place_id, e-mail). */
async function findExisting(db: Db, companyId: string, c: NormalizedContact) {
  return db.maybeOne<{ id: string; owner_user_id: string | null }>(
    `select id, owner_user_id from contacts where company_id = $1 and (
        ($2::text is not null and (phone_e164 = $2 or whatsapp_e164 = $2))
     or ($3::text is not null and (phone_e164 = $3 or whatsapp_e164 = $3))
     or ($4::text is not null and google_place_id = $4)
     or ($5::text is not null and $2::text is null and $3::text is null and email = $5))
     order by created_at limit 1`,
    [companyId, c.phone_e164 ?? null, c.whatsapp_e164 ?? null, c.google_place_id ?? null, c.email ?? null]);
}

const FIELDS = ["name", "phone_e164", "whatsapp_e164", "email", "organization", "city", "state", "neighborhood",
  "address", "website", "category", "rating", "notes", "google_place_id"] as const;

/**
 * Grava vários contatos SEM duplicar: se já existir (mesmo telefone/place_id/e-mail),
 * apenas completa campos vazios. Usado por cadastro, Google, planilhas e campanhas.
 */
export async function upsertContacts(
  db: Db, ctx: AuthContext | null, companyId: string, rows: NormalizedContact[], source: Source,
  opts: { listId?: string | null; ownerUserId?: string | null } = {},
) {
  const result = { created: 0, matched: 0, ids: [] as string[], createdIds: [] as string[] };
  const newCount = rows.length;
  if (newCount === 0) return result;
  const seen = new Map<string, string>();
  let checkedLimit = false;
  for (const r of rows) {
    const key = r.phone_e164 ?? r.google_place_id ?? r.email ?? null;
    if (key && seen.has(key)) { result.ids.push(seen.get(key)!); result.matched++; continue; }
    const existing = await findExisting(db, companyId, r);
    let id: string;
    if (existing) {
      id = existing.id;
      const sets: string[] = []; const vals: unknown[] = [id];
      for (const f of FIELDS) {
        const v = r[f];
        if (v === null || v === undefined || v === "") continue;
        vals.push(v); sets.push(`${f} = coalesce(${f}, $${vals.length})`);
      }
      if (sets.length) await db.exec(`update contacts set ${sets.join(", ")} where id = $1`, vals);
      if (opts.ownerUserId && !existing.owner_user_id) await db.exec(`update contacts set owner_user_id = $2 where id = $1`, [id, opts.ownerUserId]);
      result.matched++;
    } else {
      if (!checkedLimit) { await assertContactLimit(db, companyId, newCount); checkedLimit = true; }
      id = randomUUID();
      await db.exec(
        `insert into contacts (id, company_id, name, phone_e164, whatsapp_e164, email, organization, city, state, neighborhood,
            address, website, category, rating, notes, google_place_id, source, source_detail, owner_user_id, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [id, companyId, r.name ?? null, r.phone_e164 ?? null, r.whatsapp_e164 ?? null, r.email ?? null, r.organization ?? null,
         r.city ?? null, r.state ?? null, r.neighborhood ?? null, r.address ?? null, r.website ?? null, r.category ?? null,
         r.rating ?? null, r.notes ?? null, r.google_place_id ?? null, source, r.source_detail ?? {}, opts.ownerUserId ?? null, ctx?.user.id ?? null]);
      await recordEvent(db, ctx, companyId, "contact.created", { contactId: id }, { source });
      result.created++; result.createdIds.push(id);
    }
    if (key) seen.set(key, id);
    result.ids.push(id);
  }
  if (opts.listId) await addToListInternal(db, companyId, opts.listId, result.ids);
  return result;
}

async function addToListInternal(db: Db, companyId: string, listId: string, ids: string[]) {
  if (!ids.length) return 0;
  return db.exec(
    `insert into contact_list_members (company_id, list_id, contact_id)
     select $1, $2, unnest($3::uuid[]) on conflict do nothing`, [companyId, listId, [...new Set(ids)]]);
}

// ---------------------------------------------------------------------
// Cadastro, edição e consulta
// ---------------------------------------------------------------------
export async function createContact(ctx: AuthContext, raw: ContactInput & { listId?: string; ownerUserId?: string }) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contacts");
  const n = normalizeContactInput(raw);
  return withScope(scopeOf(ctx), async (db) => {
    const dup = await findExisting(db, companyId, n);
    if (dup) throw new AppError("CONFLICT", "Já existe um contato com este telefone/e-mail. Abra o cadastro existente para atualizá-lo.", { phone: "Contato já cadastrado." });
    const owner = ctx.role === "seller" ? ctx.user.id : await validOwner(db, companyId, raw.ownerUserId);
    const listId = raw.listId ? await validList(db, companyId, raw.listId) : null;
    const r = await upsertContacts(db, ctx, companyId, [n], "manual", { listId, ownerUserId: owner });
    if (raw.commercialStatus) await db.exec(`update contacts set commercial_status = $2 where id = $1`, [r.ids[0], raw.commercialStatus]);
    return { id: r.ids[0] };
  });
}

export async function updateContact(ctx: AuthContext, contactId: string, raw: ContactInput) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contacts");
  const n = normalizeContactInput(raw);
  return withScope(scopeOf(ctx), async (db) => {
    await loadContact(db, ctx, contactId);
    const dup = await findExisting(db, companyId, n);
    if (dup && dup.id !== contactId) throw new AppError("CONFLICT", "Outro contato já usa este telefone/e-mail.", { phone: "Em uso por outro contato." });
    await db.exec(
      `update contacts set name=$2, phone_e164=$3, whatsapp_e164=$4, email=$5, organization=$6, city=$7, state=$8, neighborhood=$9,
         address=$10, website=$11, category=$12, notes=$13, commercial_status=coalesce($14, commercial_status) where id=$1`,
      [contactId, n.name, n.phone_e164, n.whatsapp_e164, n.email, n.organization, n.city, n.state, n.neighborhood,
       n.address, n.website, n.category, n.notes, raw.commercialStatus || null]);
    await recordEvent(db, ctx, companyId, "contact.updated", { contactId });
  });
}

async function loadContact(db: Db, ctx: AuthContext, contactId: string) {
  parse(uuid, contactId);
  const c = await db.maybeOne<{ id: string }>(
    `select c.id from contacts c where c.id = $1 and c.company_id = $3 ${ownerClause(ctx)}`,
    [contactId, sellerParam(ctx), ctx.company!.id]);
  if (!c) throw notFound("Contato não encontrado.");
  return c;
}

async function validOwner(db: Db, companyId: string, ownerId?: string | null) {
  if (!ownerId) return null;
  parse(uuid, ownerId);
  const m = await db.maybeOne(`select 1 from company_memberships where company_id = $1 and user_id = $2 and is_active`, [companyId, ownerId]);
  if (!m) throw invalid("Responsável inválido.", { ownerUserId: "Selecione um usuário da empresa." });
  return ownerId;
}
async function validList(db: Db, companyId: string, listId: string) {
  parse(uuid, listId);
  const l = await db.maybeOne(`select 1 from contact_lists where id = $1 and company_id = $2`, [listId, companyId]);
  if (!l) throw notFound("Lista não encontrada.");
  return listId;
}

export type ContactFilters = {
  q?: string; listId?: string; tagId?: string; ownerId?: string; source?: string; status?: string; consent?: string; page?: number;
};
export type ContactRow = {
  id: string; name: string | null; phone_e164: string | null; whatsapp_e164: string | null; email: string | null; organization: string | null;
  city: string | null; source: Source; commercial_status: string; consent_status: string; owner_name: string | null; created_at: string;
  tags: { id: string; name: string; color: string }[];
};
export const PAGE_SIZE = 50;

function filterSql(ctx: AuthContext, f: ContactFilters) {
  const p: unknown[] = [ctx.company!.id, sellerParam(ctx)];
  const w: string[] = [`c.company_id = $1`, ctx.role === "seller" ? `c.owner_user_id = $2` : `($2::uuid is null or true)`];
  const add = (v: unknown) => { p.push(v); return `$${p.length}`; };
  if (f.q?.trim()) {
    const digits = f.q.replace(/\D/g, "");
    const q = add(`%${f.q.trim()}%`);
    w.push(`(c.name ilike ${q} or c.organization ilike ${q} or c.email ilike ${q} or c.city ilike ${q}${digits.length >= 4 ? ` or c.phone_e164 like ${add(`%${digits}%`)}` : ""})`);
  }
  if (f.listId && uuid.safeParse(f.listId).success) w.push(`exists (select 1 from contact_list_members m where m.contact_id = c.id and m.list_id = ${add(f.listId)})`);
  if (f.tagId && uuid.safeParse(f.tagId).success) w.push(`exists (select 1 from contact_tags t where t.contact_id = c.id and t.tag_id = ${add(f.tagId)})`);
  if (f.ownerId === "none") w.push(`c.owner_user_id is null`);
  else if (f.ownerId && uuid.safeParse(f.ownerId).success) w.push(`c.owner_user_id = ${add(f.ownerId)}`);
  if (f.source && (SOURCES as readonly string[]).includes(f.source)) w.push(`c.source = ${add(f.source)}`);
  if (f.status && (COMMERCIAL_STATUS as readonly string[]).includes(f.status)) w.push(`c.commercial_status = ${add(f.status)}`);
  if (f.consent && (CONSENT as readonly string[]).includes(f.consent)) w.push(`c.consent_status = ${add(f.consent)}`);
  return { where: w.join(" and "), params: p };
}

export async function listContacts(ctx: AuthContext, f: ContactFilters = {}) {
  assertCompany(ctx);
  if (!ctx.features.includes("contacts") && !ctx.features.includes("contact_lists")) assertFeature(ctx, "contacts");
  const { where, params } = filterSql(ctx, f);
  const page = Math.max(1, Math.floor(f.page ?? 1));
  return withScope(scopeOf(ctx), async (db) => {
    const { total } = await db.one<{ total: number }>(`select count(*)::int as total from contacts c where ${where}`, params);
    const rows = await db.query<ContactRow>(
      `select c.id, c.name, c.phone_e164, c.whatsapp_e164, c.email::text, c.organization, c.city, c.source, c.commercial_status,
              c.consent_status, u.name as owner_name, c.created_at,
              coalesce((select json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name)
                          from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = c.id), '[]') as tags
         from contacts c left join users u on u.id = c.owner_user_id
        where ${where} order by c.created_at desc, c.id limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, params);
    return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  });
}

/** Todos os IDs que atendem ao filtro (para "selecionar todos" e exportação). */
export async function contactIdsForFilter(db: Db, ctx: AuthContext, f: ContactFilters) {
  const { where, params } = filterSql(ctx, f);
  return (await db.query<{ id: string }>(`select c.id from contacts c where ${where}`, params)).map((r) => r.id);
}

export async function getContact(ctx: AuthContext, contactId: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contacts");
  return withScope(scopeOf(ctx), async (db) => {
    await loadContact(db, ctx, contactId);
    const contact = await db.one<Record<string, unknown> & { id: string; owner_user_id: string | null }>(
      `select c.*, c.email::text as email, u.name as owner_name from contacts c left join users u on u.id = c.owner_user_id where c.id = $1`, [contactId]);
    const [tags, lists, campaigns, conversations, opportunities, events] = await Promise.all([
      db.query<{ id: string; name: string; color: string; source: string }>(
        `select t.id, t.name, t.color, ct.source from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = $1 order by t.name`, [contactId]),
      db.query<{ id: string; name: string }>(
        `select l.id, l.name from contact_list_members m join contact_lists l on l.id = m.list_id where m.contact_id = $1 order by l.name`, [contactId]),
      db.query<{ id: string; number: number; name: string; status: string }>(
        `select ca.id, ca.number, ca.name, cc.status from campaign_contacts cc join campaigns ca on ca.id = cc.campaign_id where cc.contact_id = $1 order by ca.created_at desc`, [contactId]),
      db.query<{ id: string; status: string; last_message_at: string | null }>(
        `select id, status, last_message_at from conversations where contact_id = $1 order by last_message_at desc nulls last`, [contactId]),
      db.query<{ id: string; title: string | null; value: string | null; status: string; stage: string }>(
        `select o.id, o.title, o.value::text, o.status, s.name as stage from opportunities o join pipeline_stages s on s.id = o.stage_id where o.contact_id = $1 order by o.created_at desc`, [contactId]),
      db.query<{ id: number; type: string; data: Record<string, unknown>; created_at: string; actor: string | null }>(
        `select e.id, e.type, e.data, e.created_at, u.name as actor from domain_events e left join users u on u.id = e.actor_user_id
          where e.contact_id = $1 order by e.created_at desc limit 50`, [contactId]),
    ]);
    void companyId;
    return { contact, tags, lists, campaigns, conversations, opportunities, events };
  });
}

// ---------------------------------------------------------------------
// Operações em lote (sempre restritas à empresa e, para vendedor, aos seus contatos)
// ---------------------------------------------------------------------
const idsSchema = z.array(uuid).min(1, "Selecione pelo menos um contato.").max(10000);

async function permittedIds(db: Db, ctx: AuthContext, ids: string[]) {
  const rows = await db.query<{ id: string }>(
    `select c.id from contacts c where c.id = any($3::uuid[]) and c.company_id = $1 ${ctx.role === "seller" ? "and c.owner_user_id = $2" : "and ($2::uuid is null or true)"}`,
    [ctx.company!.id, sellerParam(ctx), ids]);
  return rows.map((r) => r.id);
}

export async function deleteContacts(ctx: AuthContext, rawIds: string[]) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contacts");
  if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador da empresa pode excluir contatos.");
  const ids = parse(idsSchema, rawIds);
  return withScope(scopeOf(ctx), async (db) => {
    const ok = await permittedIds(db, ctx, ids);
    const n = await db.exec(`delete from contacts where company_id = $1 and id = any($2::uuid[])`, [companyId, ok]);
    await db.exec(`insert into audit_logs (company_id, user_id, action, entity_type, data) values ($1,$2,'contact.delete','contact',$3)`,
      [companyId, ctx.user.id, { count: n }]);
    return { deleted: n };
  });
}

export async function assignOwner(ctx: AuthContext, rawIds: string[], ownerUserId: string | null) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contacts");
  if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador da empresa transfere contatos entre vendedores.");
  const ids = parse(idsSchema, rawIds);
  return withScope(scopeOf(ctx), async (db) => {
    const owner = await validOwner(db, companyId, ownerUserId);
    const ok = await permittedIds(db, ctx, ids);
    await db.exec(`update contacts set owner_user_id = $3 where company_id = $1 and id = any($2::uuid[])`, [companyId, ok, owner]);
    for (const id of ok) await recordEvent(db, ctx, companyId, "contact.owner_changed", { contactId: id }, { owner_user_id: owner });
    return { updated: ok.length };
  });
}

export async function setContactsStatus(ctx: AuthContext, rawIds: string[], status: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contacts");
  if (!(COMMERCIAL_STATUS as readonly string[]).includes(status)) throw invalid("Situação comercial inválida.");
  const ids = parse(idsSchema, rawIds);
  return withScope(scopeOf(ctx), async (db) => {
    const ok = await permittedIds(db, ctx, ids);
    await db.exec(`update contacts set commercial_status = $3 where company_id = $1 and id = any($2::uuid[])`, [companyId, ok, status]);
    return { updated: ok.length };
  });
}

/** Consentimento LGPD/Meta: registra origem e data. Opt-out bloqueia envios futuros. */
export async function setConsent(ctx: AuthContext, rawIds: string[], consent: string, source: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contacts");
  if (!(CONSENT as readonly string[]).includes(consent)) throw invalid("Consentimento inválido.");
  const ids = parse(idsSchema, rawIds);
  const src = (source ?? "").trim().slice(0, 200) || null;
  if (consent === "opted_in" && !src) throw invalid("Informe como o consentimento foi obtido (ex.: formulário do site, pedido pelo WhatsApp).", { consentSource: "Obrigatório para registrar opt-in." });
  return withScope(scopeOf(ctx), async (db) => {
    const ok = await permittedIds(db, ctx, ids);
    await db.exec(
      `update contacts set consent_status = $3, consent_source = $4,
          consent_at = case when $3 = 'opted_in' then now() else consent_at end,
          opted_out_at = case when $3 = 'opted_out' then now() else null end
        where company_id = $1 and id = any($2::uuid[])`, [companyId, ok, consent, src]);
    for (const id of ok) await recordEvent(db, ctx, companyId, "contact.consent", { contactId: id }, { consent, source: src });
    return { updated: ok.length };
  });
}

export async function addContactsToList(ctx: AuthContext, rawIds: string[], listId: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contact_lists");
  const ids = parse(idsSchema, rawIds);
  return withScope(scopeOf(ctx), async (db) => {
    await validList(db, companyId, listId);
    const ok = await permittedIds(db, ctx, ids);
    const n = await addToListInternal(db, companyId, listId, ok);
    return { added: n, already: ok.length - n };
  });
}

export async function removeContactsFromList(ctx: AuthContext, rawIds: string[], listId: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "contact_lists");
  const ids = parse(idsSchema, rawIds);
  return withScope(scopeOf(ctx), async (db) => {
    await validList(db, companyId, listId);
    const ok = await permittedIds(db, ctx, ids);
    return { removed: await db.exec(`delete from contact_list_members where list_id = $1 and contact_id = any($2::uuid[])`, [listId, ok]) };
  });
}

export async function applyTag(ctx: AuthContext, rawIds: string[], tagId: string, apply = true) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "tags");
  const ids = parse(idsSchema, rawIds);
  parse(uuid, tagId);
  return withScope(scopeOf(ctx), async (db) => {
    const tag = await db.maybeOne<{ name: string }>(`select name from tags where id = $1 and company_id = $2`, [tagId, companyId]);
    if (!tag) throw notFound("Etiqueta não encontrada.");
    const ok = await permittedIds(db, ctx, ids);
    if (apply) {
      const n = await db.exec(
        `insert into contact_tags (company_id, contact_id, tag_id, applied_by) select $1, unnest($2::uuid[]), $3, $4 on conflict do nothing`,
        [companyId, ok, tagId, ctx.user.id]);
      for (const id of ok) await recordEvent(db, ctx, companyId, "contact.tag_added", { contactId: id }, { tag: tag.name });
      return { changed: n };
    }
    const n = await db.exec(`delete from contact_tags where tag_id = $1 and contact_id = any($2::uuid[])`, [tagId, ok]);
    for (const id of ok) await recordEvent(db, ctx, companyId, "contact.tag_removed", { contactId: id }, { tag: tag.name });
    return { changed: n };
  });
}

export async function resolveSelection(ctx: AuthContext, sel: { ids?: string[]; filters?: ContactFilters }) {
  if (sel.ids?.length) return sel.ids;
  if (!sel.filters) return [];
  assertCompany(ctx);
  return withScope(scopeOf(ctx), (db) => contactIdsForFilter(db, ctx, sel.filters!));
}

/** Exportação CSV (separador ";" e BOM para abrir corretamente no Excel em português). */
export async function exportContactsCsv(ctx: AuthContext, f: ContactFilters) {
  assertCompany(ctx);
  assertFeature(ctx, "contacts");
  assertFeature(ctx, "data_export");
  const { where, params } = filterSql(ctx, f);
  return withScope(scopeOf(ctx), async (db) => {
    const rows = await db.query<Record<string, string | null>>(
      `select c.name, c.phone_e164, c.whatsapp_e164, c.email::text, c.organization, c.city, c.state, c.neighborhood, c.address,
              c.website, c.category, c.source, c.commercial_status, c.consent_status, u.name as owner_name,
              (select string_agg(t.name, ', ' order by t.name) from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = c.id) as tags,
              (select string_agg(l.name, ', ' order by l.name) from contact_list_members m join contact_lists l on l.id = m.list_id where m.contact_id = c.id) as lists,
              to_char(c.created_at at time zone 'America/Belem', 'DD/MM/YYYY HH24:MI') as created_at, c.notes
         from contacts c left join users u on u.id = c.owner_user_id where ${where} order by c.created_at desc`, params);
    await db.exec(`insert into audit_logs (company_id, user_id, action, data) values ($1,$2,'contact.export',$3)`,
      [ctx.company!.id, ctx.user.id, { count: rows.length }]);
    const header = ["Nome", "Telefone", "WhatsApp", "E-mail", "Empresa", "Cidade", "UF", "Bairro", "Endereço", "Site", "Categoria",
      "Origem", "Situação", "Consentimento", "Responsável", "Etiquetas", "Listas", "Cadastro", "Observações"];
    const esc = (v: unknown) => {
      let s = v == null ? "" : String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // evita injeção de fórmulas no Excel
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(";"), ...rows.map((r) => Object.values(r).map(esc).join(";"))];
    return "﻿" + lines.join("\r\n");
  });
}

export async function teamOptions(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  return withScope(scopeOf(ctx), (db) => db.query<{ id: string; name: string; role: string }>(
    `select u.id, u.name, m.role from company_memberships m join users u on u.id = m.user_id
      where m.company_id = $1 and m.is_active and u.is_active order by u.name`, [companyId]));
}
