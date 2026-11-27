import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope, type Db } from "../db";
import { forbidden, invalid, notFound } from "../errors";
import { assertCompany, assertFeature, isCompanyAdmin, scopeOf } from "../guards";
import { parse, requiredText, uuid } from "../validation";

export const KNOWLEDGE_CATEGORIES: Record<string, string> = {
  company: "Informações da empresa", products: "Produtos", services: "Serviços", prices: "Preços", promotions: "Promoções",
  hours: "Horários", address: "Endereço", differentials: "Diferenciais", faq: "Perguntas frequentes", commercial_terms: "Condições comerciais",
  instructions: "Instruções de atendimento", negotiation_rules: "Regras de negociação", other: "Outros",
};
const entrySchema = z.object({
  category: z.enum(Object.keys(KNOWLEDGE_CATEGORIES) as [string, ...string[]], { error: "Escolha a categoria." }),
  title: requiredText("o título", 160), content: requiredText("o conteúdo", 20000), isActive: z.boolean().default(true),
});

function guardEdit(ctx: AuthContext) {
  assertCompany(ctx); assertFeature(ctx, "ai_chatbot");
  if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador da empresa edita o contexto.");
}

export async function listKnowledge(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "ai_chatbot");
  return withScope(scopeOf(ctx), async (db) => ({
    entries: await db.query<{ id: string; category: string; title: string; content: string; is_active: boolean; updated_at: string }>(
      `select id, category, title, content, is_active, updated_at from knowledge_entries where company_id = $1 order by category, title`, [companyId]),
    documents: await db.query<{ id: string; filename: string; size_bytes: number; chars: number; created_at: string }>(
      `select id, filename, size_bytes, length(coalesce(extracted_text, ''))::int as chars, created_at from knowledge_documents where company_id = $1 order by created_at desc`, [companyId]),
  }));
}

export async function saveKnowledge(ctx: AuthContext, raw: z.input<typeof entrySchema>, id?: string) {
  guardEdit(ctx);
  const i = parse(entrySchema, raw);
  return withScope(scopeOf(ctx), async (db) => {
    if (id) {
      parse(uuid, id);
      const n = await db.exec(`update knowledge_entries set category=$3, title=$4, content=$5, is_active=$6, updated_by=$7 where id=$1 and company_id=$2`,
        [id, ctx.company!.id, i.category, i.title, i.content, i.isActive, ctx.user.id]);
      if (!n) throw notFound("Informação não encontrada.");
      return { id };
    }
    const nid = randomUUID();
    await db.exec(`insert into knowledge_entries (id, company_id, category, title, content, is_active, updated_by) values ($1,$2,$3,$4,$5,$6,$7)`,
      [nid, ctx.company!.id, i.category, i.title, i.content, i.isActive, ctx.user.id]);
    return { id: nid };
  });
}

export async function deleteKnowledge(ctx: AuthContext, id: string) {
  guardEdit(ctx); parse(uuid, id);
  return withScope(scopeOf(ctx), (db) => db.exec(`delete from knowledge_entries where id = $1 and company_id = $2`, [id, ctx.company!.id]));
}

const MAX_DOC = 5 * 1024 * 1024;
/** Documento: extrai o texto (TXT, MD, CSV, PDF). O texto fica disponível só para a IA desta empresa. */
export async function uploadDocument(ctx: AuthContext, file: { name: string; type: string; base64: string }) {
  guardEdit(ctx);
  const buf = Buffer.from(file.base64 ?? "", "base64");
  if (!buf.length) throw invalid("Selecione um arquivo.");
  if (buf.length > MAX_DOC) throw invalid("Arquivo maior que 5 MB.");
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  let text: string;
  if (["txt", "md", "csv"].includes(ext)) text = buf.toString("utf8");
  else if (ext === "pdf") {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const r = await extractText(pdf, { mergePages: true });
      text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
    } catch { throw invalid("Não foi possível ler este PDF. Se for uma imagem escaneada, copie o texto em uma informação."); }
  } else throw invalid("Formato não suportado. Envie PDF, TXT, MD ou CSV (ou cole o texto em uma informação).");
  text = text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 20) throw invalid("O arquivo não tem texto legível.");
  return withScope(scopeOf(ctx), async (db) => {
    const id = randomUUID();
    await db.exec(`insert into knowledge_documents (id, company_id, filename, mime_type, size_bytes, storage_path, extracted_text, uploaded_by) values ($1,$2,$3,$4,$5,null,$6,$7)`,
      [id, ctx.company!.id, file.name.slice(0, 200), file.type || null, buf.length, text.slice(0, 200_000), ctx.user.id]);
    return { id, chars: text.length };
  });
}

export async function deleteDocument(ctx: AuthContext, id: string) {
  guardEdit(ctx); parse(uuid, id);
  return withScope(scopeOf(ctx), (db) => db.exec(`delete from knowledge_documents where id = $1 and company_id = $2`, [id, ctx.company!.id]));
}

/** Contexto que a IA recebe — SEMPRE filtrado pela empresa da conversa (nunca mistura empresas). */
export async function knowledgeText(db: Db, companyId: string, maxChars = 40_000) {
  const entries = await db.query<{ category: string; title: string; content: string }>(
    `select category, title, content from knowledge_entries where company_id = $1 and is_active order by category, title`, [companyId]);
  const docs = await db.query<{ filename: string; extracted_text: string }>(
    `select filename, extracted_text from knowledge_documents where company_id = $1 and extracted_text is not null order by created_at`, [companyId]);
  let out = entries.map((e) => `## ${KNOWLEDGE_CATEGORIES[e.category] ?? e.category} — ${e.title}\n${e.content}`).join("\n\n");
  for (const d of docs) { if (out.length > maxChars) break; out += `\n\n## Documento: ${d.filename}\n${d.extracted_text}`; }
  return out.slice(0, maxChars);
}
