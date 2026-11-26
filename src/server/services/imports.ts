import { randomUUID } from "node:crypto";
import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { AppError, invalid, notFound } from "../errors";
import { assertCompany, assertFeature, isCompanyAdmin, scopeOf } from "../guards";
import { recordEvent } from "../events";
import { normalizeContactInput, upsertContacts, type NormalizedContact } from "./contacts";
import { MAX_IMPORT_ROWS, type ImportField } from "@/lib/import-mapping";

export type MappedRow = Partial<Record<ImportField, string>>;
export type RowStatus = "new" | "existing" | "file_duplicate" | "invalid";
export type AnalyzedRow = { index: number; status: RowStatus; reason?: string; display: string; phone?: string | null };

function normalizeRows(rows: MappedRow[]) {
  if (!Array.isArray(rows)) throw invalid("Planilha inválida.");
  if (rows.length === 0) throw invalid("A planilha não possui linhas com dados.");
  if (rows.length > MAX_IMPORT_ROWS) throw invalid(`A planilha tem ${rows.length} linhas. O máximo por importação é ${MAX_IMPORT_ROWS}.`);
  return rows.map((r, index) => {
    const clean = Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, v == null ? "" : String(v).slice(0, 2000)]));
    try {
      return { index, contact: normalizeContactInput(clean) as NormalizedContact, error: null as string | null };
    } catch (e) {
      return { index, contact: null, error: e instanceof AppError ? e.message : "Linha inválida." };
    }
  });
}

/** Prévia: classifica cada linha sem gravar nada. */
export async function analyzeImport(ctx: AuthContext, rows: MappedRow[]) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "spreadsheet_import");
  const normalized = normalizeRows(rows);
  const phones = normalized.flatMap((n) => [n.contact?.phone_e164, n.contact?.whatsapp_e164]).filter(Boolean) as string[];
  const emails = normalized.map((n) => n.contact?.email).filter(Boolean) as string[];
  const existing = await withScope(scopeOf(ctx), (db) => db.query<{ phone_e164: string | null; whatsapp_e164: string | null; email: string | null }>(
    `select phone_e164, whatsapp_e164, email::text from contacts where company_id = $1
        and (phone_e164 = any($2::text[]) or whatsapp_e164 = any($2::text[]) or email = any($3::citext[]))`, [companyId, phones, emails]));
  const known = new Set(existing.flatMap((e) => [e.phone_e164, e.whatsapp_e164, e.email]).filter(Boolean));
  const seen = new Set<string>();
  const out: AnalyzedRow[] = normalized.map((n) => {
    if (!n.contact) return { index: n.index, status: "invalid", reason: n.error ?? "Linha inválida.", display: Object.values(rows[n.index] ?? {}).filter(Boolean).join(" · ").slice(0, 120) };
    const c = n.contact;
    const display = [c.name, c.organization].filter(Boolean).join(" · ") || c.email || c.phone_e164 || "";
    const key = c.phone_e164 ?? c.email ?? null;
    if (key && seen.has(key)) return { index: n.index, status: "file_duplicate", reason: "Repetido na planilha", display, phone: c.phone_e164 };
    if (key) seen.add(key);
    if ((c.phone_e164 && known.has(c.phone_e164)) || (c.whatsapp_e164 && known.has(c.whatsapp_e164)) || (!c.phone_e164 && c.email && known.has(c.email)))
      return { index: n.index, status: "existing", reason: "Já está na base (será atualizado, sem duplicar)", display, phone: c.phone_e164 };
    return { index: n.index, status: "new", display, phone: c.phone_e164 };
  });
  const summary = { total: out.length, new: 0, existing: 0, file_duplicate: 0, invalid: 0 } as Record<RowStatus | "total", number>;
  for (const r of out) summary[r.status]++;
  return { rows: out, summary };
}

/** Importação definitiva: tudo em uma transação (falhou = nada gravado). */
export async function runImport(ctx: AuthContext, rows: MappedRow[], opts: {
  listId?: string | null; newListName?: string | null; ownerUserId?: string | null; fileName?: string | null;
}) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "spreadsheet_import");
  const normalized = normalizeRows(rows);
  const valid = normalized.filter((n) => n.contact).map((n) => ({ ...n.contact!, source_detail: { file: opts.fileName?.slice(0, 200) ?? null, row: n.index + 2 } }));
  if (!valid.length) throw invalid("Nenhuma linha válida para importar. Verifique o mapeamento das colunas.");
  if ((opts.listId || opts.newListName) && !ctx.features.includes("contact_lists")) assertFeature(ctx, "contact_lists");
  return withScope(scopeOf(ctx), async (db) => {
    let listId = opts.listId || null;
    if (opts.newListName?.trim()) {
      listId = randomUUID();
      await db.exec(`insert into contact_lists (id, company_id, name, created_by) values ($1,$2,$3,$4)`, [listId, companyId, opts.newListName.trim().slice(0, 120), ctx.user.id]);
    } else if (listId) {
      const l = await db.maybeOne(`select 1 from contact_lists where id = $1 and company_id = $2`, [listId, companyId]);
      if (!l) throw notFound("Lista não encontrada.");
    }
    let owner: string | null = ctx.role === "seller" ? ctx.user.id : null;
    if (opts.ownerUserId && isCompanyAdmin(ctx)) {
      const m = await db.maybeOne(`select 1 from company_memberships where company_id = $1 and user_id = $2 and is_active`, [companyId, opts.ownerUserId]);
      if (!m) throw invalid("Responsável inválido.");
      owner = opts.ownerUserId;
    }
    const r = await upsertContacts(db, ctx, companyId, valid, "import", { listId, ownerUserId: owner });
    await recordEvent(db, ctx, companyId, "import.completed", { entityType: "contact_list", entityId: listId },
      { file: opts.fileName ?? null, created: r.created, matched: r.matched, invalid: normalized.length - valid.length });
    return { created: r.created, updated: r.matched, invalid: normalized.length - valid.length, listId, contactIds: [...new Set(r.ids)] };
  });
}
