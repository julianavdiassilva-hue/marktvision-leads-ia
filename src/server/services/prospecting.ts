import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { AppError, invalid, notFound } from "../errors";
import { assertCompany, assertFeature, isCompanyAdmin, scopeOf } from "../guards";
import { companyLimits } from "../permissions";
import { recordEvent } from "../events";
import { searchPlaces, type PlaceResult } from "../integrations/google-places";
import { upsertContacts, type NormalizedContact } from "./contacts";
import { optionalText, parse } from "../validation";
import { normalizePhone } from "@/lib/phone";

const searchSchema = z.object({
  keyword: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(2, "Informe o segmento ou palavra-chave.").max(120)),
  city: optionalText(80), state: optionalText(40), neighborhood: optionalText(80), region: optionalText(80),
  pageToken: optionalText(2000),
});
export type SearchInput = z.input<typeof searchSchema>;

/** Monta a consulta em linguagem natural: "clínicas odontológicas em Umarizal, Belém - PA". */
export function buildQuery(i: z.infer<typeof searchSchema>) {
  const place = [i.neighborhood, i.region, i.city].filter(Boolean).join(", ");
  const loc = [place, i.state].filter(Boolean).join(" - ");
  return loc ? `${i.keyword} em ${loc}` : i.keyword;
}

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10); };

export async function searchCompanies(ctx: AuthContext, raw: SearchInput) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "google_search");
  const input = parse(searchSchema, raw);
  const query = buildQuery(input);
  // limite mensal de pesquisas (cada página conta como uma pesquisa)
  await withScope(scopeOf(ctx), async (db) => {
    const limits = await companyLimits(db, companyId);
    const used = await db.maybeOne<{ value: string }>(`select value::text from usage_counters where company_id=$1 and metric='google_searches' and period=$2`, [companyId, monthStart()]);
    if (limits.max_google_searches_month != null && Number(used?.value ?? 0) >= limits.max_google_searches_month)
      throw new AppError("LIMIT", `Limite de ${limits.max_google_searches_month} pesquisas no Google neste mês atingido.`);
  });
  const { places, nextPageToken } = await searchPlaces(query, input.pageToken);
  return withScope(scopeOf(ctx), async (db) => {
    await db.exec(`insert into usage_counters (company_id, metric, period, value) values ($1,'google_searches',$2,1)
                   on conflict (company_id, metric, period) do update set value = usage_counters.value + 1`, [companyId, monthStart()]);
    const phones = places.map((p) => normalizePhone(p.phone)).filter(Boolean) as string[];
    const existing = await db.query<{ google_place_id: string | null; phone_e164: string | null }>(
      `select google_place_id, phone_e164 from contacts where company_id = $1 and (google_place_id = any($2::text[]) or phone_e164 = any($3::text[]))`,
      [companyId, places.map((p) => p.placeId), phones]);
    const known = new Set(existing.flatMap((e) => [e.google_place_id, e.phone_e164]).filter(Boolean));
    return {
      query, nextPageToken,
      results: places.map((p) => ({ ...p, phoneE164: normalizePhone(p.phone), alreadyInBase: known.has(p.placeId) || known.has(normalizePhone(p.phone) ?? "-") })),
    };
  });
}

export function placeToContact(p: PlaceResult, query: string): NormalizedContact {
  return {
    name: p.name, organization: p.name, phone_e164: normalizePhone(p.phone), address: p.address, website: p.website,
    category: p.category, rating: p.rating, city: p.city, state: p.state, neighborhood: p.neighborhood, google_place_id: p.placeId,
    source_detail: { query, maps_url: p.mapsUrl, rating_count: p.ratingCount },
  };
}

const placeSchema = z.object({
  placeId: z.string().min(1).max(300), name: z.string().max(300), phone: z.string().max(40).nullable(), address: z.string().max(500).nullable(),
  website: z.string().max(500).nullable(), category: z.string().max(200).nullable(), rating: z.number().min(0).max(5).nullable(),
  ratingCount: z.number().nullable(), city: z.string().max(120).nullable(), state: z.string().max(60).nullable(),
  neighborhood: z.string().max(120).nullable(), mapsUrl: z.string().max(1000).nullable(),
});

/** Salva os resultados selecionados na base central (sem duplicar) e, opcionalmente, numa lista. */
export async function savePlaces(ctx: AuthContext, rawPlaces: unknown[], opts: { query: string; listId?: string | null; newListName?: string | null; ownerUserId?: string | null }) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "google_search");
  const places = parse(z.array(placeSchema).min(1, "Selecione pelo menos uma empresa.").max(500), rawPlaces);
  return withScope(scopeOf(ctx), async (db) => {
    let listId = opts.listId || null;
    if ((listId || opts.newListName?.trim()) && !ctx.features.includes("contact_lists")) assertFeature(ctx, "contact_lists");
    if (opts.newListName?.trim()) {
      listId = randomUUID();
      await db.exec(`insert into contact_lists (id, company_id, name, created_by) values ($1,$2,$3,$4)`, [listId, companyId, opts.newListName.trim().slice(0, 120), ctx.user.id]);
    } else if (listId && !(await db.maybeOne(`select 1 from contact_lists where id=$1 and company_id=$2`, [listId, companyId]))) throw notFound("Lista não encontrada.");
    let owner: string | null = ctx.role === "seller" ? ctx.user.id : null;
    if (opts.ownerUserId && isCompanyAdmin(ctx)) {
      if (!(await db.maybeOne(`select 1 from company_memberships where company_id=$1 and user_id=$2 and is_active`, [companyId, opts.ownerUserId]))) throw invalid("Responsável inválido.");
      owner = opts.ownerUserId;
    }
    const r = await upsertContacts(db, ctx, companyId, places.map((p) => placeToContact(p, opts.query)), "google", { listId, ownerUserId: owner });
    await recordEvent(db, ctx, companyId, "google.saved", { entityType: "contact_list", entityId: listId }, { query: opts.query, created: r.created, matched: r.matched });
    return { created: r.created, updated: r.matched, listId, contactIds: r.ids };
  });
}
