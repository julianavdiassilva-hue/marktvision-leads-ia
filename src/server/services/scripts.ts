import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { invalid, notFound } from "../errors";
import { assertCompany, assertFeature, scopeOf } from "../guards";
import { generateText } from "../integrations/ai";
import { parse, requiredText, uuid } from "../validation";
import { unknownVars } from "@/lib/template";

const scriptSchema = z.object({ name: requiredText("o nome do modelo", 120), body: requiredText("o texto da mensagem", 4000) });

export async function listScripts(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  return withScope(scopeOf(ctx), (db) => db.query<{ id: string; name: string; body: string; updated_at: string }>(
    `select id, name, body, updated_at from scripts where company_id = $1 and is_template order by name`, [companyId]));
}

export async function saveScript(ctx: AuthContext, raw: z.input<typeof scriptSchema>, id?: string) {
  const companyId = assertCompany(ctx);
  if (!ctx.features.includes("scripts") && !ctx.features.includes("campaigns")) assertFeature(ctx, "scripts");
  const i = parse(scriptSchema, raw);
  const bad = unknownVars(i.body);
  if (bad.length) throw invalid(`Variável desconhecida: {{${bad[0]}}}.`, { body: "Use apenas as variáveis disponíveis." });
  return withScope(scopeOf(ctx), async (db) => {
    if (id) {
      parse(uuid, id);
      const n = await db.exec(`update scripts set name=$3, body=$4 where id=$1 and company_id=$2`, [id, companyId, i.name, i.body]);
      if (!n) throw notFound("Modelo não encontrado.");
      return { id };
    }
    const newId = randomUUID();
    await db.exec(`insert into scripts (id, company_id, name, body, created_by) values ($1,$2,$3,$4,$5)`, [newId, companyId, i.name, i.body, ctx.user.id]);
    return { id: newId };
  });
}

export async function deleteScript(ctx: AuthContext, id: string) {
  const companyId = assertCompany(ctx);
  parse(uuid, id);
  return withScope(scopeOf(ctx), async (db) => {
    const n = await db.exec(`delete from scripts where id=$1 and company_id=$2`, [id, companyId]);
    if (!n) throw notFound("Modelo não encontrado.");
  });
}

const SYSTEM = `Você escreve mensagens comerciais curtas para WhatsApp, em português do Brasil, para pequenas e médias empresas.
Regras:
- Tom cordial e profissional; no máximo 600 caracteres; frases curtas; no máximo 1 emoji.
- Termine com uma pergunta simples que convide à resposta.
- Use as variáveis exatamente como escritas quando fizer sentido: {{primeiro_nome}}, {{empresa}}, {{cidade}}, {{vendedor}}, {{minha_empresa}}. Não crie outras variáveis.
- Não invente preços, descontos, prazos, garantias ou dados que não foram informados.
- Inclua ao final uma linha curta oferecendo a opção de não receber mais mensagens (ex.: "Se preferir não receber mensagens, responda SAIR.").
- Responda somente com o texto da mensagem, sem comentários.`;

export async function aiGenerateMessage(ctx: AuthContext, brief: { goal: string; companyName?: string; audience?: string }) {
  assertCompany(ctx);
  assertFeature(ctx, "ai_messages");
  const goal = (brief.goal ?? "").trim();
  if (goal.length < 5) throw invalid("Descreva o objetivo da mensagem (ex.: oferecer manutenção de ar-condicionado para clínicas).");
  return generateText(SYSTEM, `Empresa que envia: ${ctx.company!.name}\nPúblico: ${brief.audience?.slice(0, 300) || "não informado"}\nObjetivo: ${goal.slice(0, 1000)}\n\nEscreva a mensagem.`);
}

export async function aiImproveMessage(ctx: AuthContext, body: string, instruction?: string) {
  assertCompany(ctx);
  assertFeature(ctx, "ai_messages");
  if (!body?.trim()) throw invalid("Escreva uma mensagem para a IA melhorar.");
  return generateText(SYSTEM, `Empresa que envia: ${ctx.company!.name}\nMelhore a mensagem abaixo mantendo a intenção e as variáveis existentes.${instruction ? `\nPedido adicional: ${instruction.slice(0, 300)}` : ""}\n\nMensagem:\n${body.slice(0, 4000)}`);
}
