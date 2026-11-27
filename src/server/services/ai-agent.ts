import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope, SYSTEM, type Db } from "../db";
import { forbidden } from "../errors";
import { assertCompany, assertFeature, isCompanyAdmin, scopeOf } from "../guards";
import { recordEvent } from "../events";
import { sendAndRecord } from "../messaging";
import { chat, parseJsonReply, type ChatMessage } from "../integrations/ai";
import { knowledgeText } from "./knowledge";
import { optionalText, parse } from "../validation";

export type BusinessHours = { enabled?: boolean; days?: number[]; start?: string; end?: string; timezone?: string };
export type AiSettings = {
  enabled: boolean; agent_name: string; personality: string | null; tone: string | null; instructions: string | null; business_hours: BusinessHours;
  qualification_criteria: string | null; handoff_criteria: string | null; greeting_message: string | null; closing_message: string | null;
  auto_reply_new: boolean; outside_hours_message: string | null;
};

const settingsSchema = z.object({
  enabled: z.boolean(), agentName: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : "Assistente"), z.string().max(60)),
  personality: optionalText(1000), tone: optionalText(300), instructions: optionalText(6000), qualificationCriteria: optionalText(3000), handoffCriteria: optionalText(3000),
  greetingMessage: optionalText(1000), closingMessage: optionalText(1000), outsideHoursMessage: optionalText(1000), autoReplyNew: z.boolean().default(false),
  hoursEnabled: z.boolean().default(false), days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  start: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"), end: z.string().regex(/^\d{2}:\d{2}$/).default("18:00"),
});

export async function getAiSettings(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "ai_chatbot");
  return withScope(scopeOf(ctx), (db) => db.one<AiSettings>(`select * from ai_settings where company_id = $1`, [companyId]));
}

export async function saveAiSettings(ctx: AuthContext, raw: z.input<typeof settingsSchema>) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "ai_chatbot");
  if (!isCompanyAdmin(ctx)) throw forbidden("Somente o administrador configura o agente.");
  const i = parse(settingsSchema, raw);
  return withScope(scopeOf(ctx), (db) => db.exec(
    `update ai_settings set enabled=$2, agent_name=$3, personality=$4, tone=$5, instructions=$6, qualification_criteria=$7, handoff_criteria=$8,
        greeting_message=$9, closing_message=$10, outside_hours_message=$11, auto_reply_new=$12, business_hours=$13 where company_id=$1`,
    [companyId, i.enabled, i.agentName, i.personality ?? null, i.tone ?? null, i.instructions ?? null, i.qualificationCriteria ?? null, i.handoffCriteria ?? null,
     i.greetingMessage ?? null, i.closingMessage ?? null, i.outsideHoursMessage ?? null, i.autoReplyNew,
     { enabled: i.hoursEnabled, days: i.days, start: i.start, end: i.end, timezone: "America/Belem" }]));
}

export function withinHours(h: BusinessHours, now = new Date()) {
  if (!h?.enabled) return true;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: h.timezone || "America/Belem", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")!.value);
  const hm = `${parts.find((p) => p.type === "hour")!.value.replace("24", "00")}:${parts.find((p) => p.type === "minute")!.value}`;
  return (h.days ?? [1, 2, 3, 4, 5]).includes(wd) && hm >= (h.start ?? "08:00") && hm < (h.end ?? "18:00");
}

export type AgentDecision = { reply: string; qualified?: boolean; handoff?: boolean; handoff_reason?: string; intent?: string; summary?: string };

/** Monta as instruções do agente com o conhecimento da empresa (somente da própria empresa). */
export function buildSystem(s: AiSettings, companyName: string, knowledge: string, mode: string) {
  return `Você é ${s.agent_name}, atendente virtual da empresa "${companyName}" no WhatsApp. Responda em português do Brasil.
Personalidade: ${s.personality || "cordial, prestativa e objetiva"}. Tom de voz: ${s.tone || "profissional e amigável"}.
${s.instructions ? `Instruções da empresa:\n${s.instructions}\n` : ""}
REGRAS OBRIGATÓRIAS:
- Use SOMENTE as informações da BASE DE CONHECIMENTO abaixo. Nunca invente preços, ofertas, prazos, estoque, endereços ou condições.
- Se a resposta não estiver na base, diga que vai confirmar com a equipe e marque handoff=true.
- Mensagens curtas (até 3 frases), sem markdown, no máximo 1 emoji.
- Se a pessoa pedir para falar com um humano/vendedor, marque handoff=true.
- Se a pessoa pedir para não receber mensagens, responda educadamente e marque handoff=true.
Critérios de qualificação (lead qualificado): ${s.qualification_criteria || "demonstrou interesse real de compra e informou sua necessidade"}.
Critérios para transferir a um vendedor: ${s.handoff_criteria || "lead qualificado, pedido de orçamento/negociação, ou pedido de atendimento humano"}.
${mode === "ai" ? "Modo: a IA conduz o atendimento; transfira apenas quando o cliente pedir um humano ou faltar informação." : "Modo: a IA recepciona e qualifica; quando os critérios de transferência forem atendidos, transfira (handoff=true)."}

BASE DE CONHECIMENTO (empresa "${companyName}"):
${knowledge || "(vazia — não há informações cadastradas; não forneça dados específicos e transfira para a equipe quando perguntado)"}

FORMATO DA RESPOSTA: responda APENAS com um objeto JSON válido:
{"reply": "texto para o cliente", "qualified": true|false, "handoff": true|false, "handoff_reason": "motivo curto", "intent": "compra|duvida|suporte|outro", "summary": "resumo de 1 linha do que o cliente quer"}`;
}

export async function decide(system: string, history: ChatMessage[]): Promise<AgentDecision> {
  const raw = await chat(system, history, { json: true, effort: "low", maxTokens: 4000 });
  const d = parseJsonReply<AgentDecision>(raw);
  if (d && typeof d.reply === "string" && d.reply.trim()) return d;
  // resposta fora do formato: usa o texto e transfere por segurança
  return { reply: raw.slice(0, 1000), handoff: true, handoff_reason: "Resposta da IA fora do formato esperado" };
}

async function historyOf(db: Db, conversationId: string): Promise<ChatMessage[]> {
  const rows = await db.query<{ direction: string; body: string | null; media_type: string | null }>(
    `select direction, body, media_type from (select direction, body, media_type, created_at from messages where conversation_id = $1 and status <> 'failed'
       order by created_at desc limit 20) x order by created_at`, [conversationId]);
  const msgs: ChatMessage[] = [];
  for (const r of rows) {
    const role = r.direction === "inbound" ? "user" : "assistant";
    const content = r.body || (r.media_type ? `[${r.media_type}]` : "");
    if (!content) continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += `\n${content}`; else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

async function ensureTag(db: Db, companyId: string, name: string, color: string) {
  await db.exec(`insert into tags (company_id, name, color) values ($1,$2,$3) on conflict do nothing`, [companyId, name, color]);
  return (await db.one<{ id: string }>(`select id from tags where company_id = $1 and lower(name) = lower($2)`, [companyId, name])).id;
}

/** Executado pela fila quando chega mensagem em conversa com IA ativa. */
export async function aiReplyJob(conversationId: string) {
  return withScope(SYSTEM, async (db) => {
    const c = await db.maybeOne<{ company_id: string; contact_id: string; whatsapp_connection_id: string; ai_enabled: boolean; handled_by: string;
      company_name: string; phone: string | null; origin_campaign_id: string | null; response_mode: string | null; ai_last_outside_notice_at: string | null; assigned_user_id: string | null }>(
      `select cv.company_id, cv.contact_id, cv.whatsapp_connection_id, cv.ai_enabled, cv.handled_by, co.name as company_name,
              coalesce(ct.whatsapp_e164, ct.phone_e164) as phone, cv.origin_campaign_id, ca.response_mode, cv.ai_last_outside_notice_at, cv.assigned_user_id
         from conversations cv join companies co on co.id = cv.company_id join contacts ct on ct.id = cv.contact_id
         left join campaigns ca on ca.id = cv.origin_campaign_id where cv.id = $1`, [conversationId]);
    if (!c || !c.ai_enabled || c.handled_by === "human" || !c.phone || !c.whatsapp_connection_id) return { skipped: "ia inativa" };
    // a funcionalidade precisa estar liberada para a empresa
    const allowed = await db.maybeOne(`select 1 from companies co join plan_features pf on pf.plan_id = co.plan_id and pf.feature_key = 'ai_chatbot'
                                        where co.id = $1 and not exists (select 1 from company_features cf where cf.company_id = co.id and cf.feature_key = 'ai_chatbot' and not cf.enabled)
                                       union select 1 from company_features cf where cf.company_id = $1 and cf.feature_key = 'ai_chatbot' and cf.enabled`, [c.company_id]);
    if (!allowed) return { skipped: "funcionalidade bloqueada" };
    const s = await db.one<AiSettings>(`select * from ai_settings where company_id = $1`, [c.company_id]);
    if (!s.enabled) return { skipped: "agente desativado" };
    const send = (body: string) => sendAndRecord(db, { companyId: c.company_id, connectionId: c.whatsapp_connection_id, contactId: c.contact_id, toE164: c.phone!,
      conversationId, body, senderType: "ai" });
    if (!withinHours(s.business_hours)) {
      const recent = c.ai_last_outside_notice_at && Date.now() - new Date(c.ai_last_outside_notice_at).getTime() < 12 * 3600_000;
      if (s.outside_hours_message && !recent) {
        await send(s.outside_hours_message);
        await db.exec(`update conversations set ai_last_outside_notice_at = now() where id = $1`, [conversationId]);
      }
      return { skipped: "fora do horário" };
    }
    const history = await historyOf(db, conversationId);
    if (!history.length) return { skipped: "sem mensagens" };
    const firstAi = !(await db.maybeOne(`select 1 from messages where conversation_id = $1 and sender_type = 'ai' limit 1`, [conversationId]));
    const system = buildSystem(s, c.company_name, await knowledgeText(db, c.company_id), c.response_mode ?? "ai_then_human");
    const d = await decide(system, history);
    let reply = d.reply.trim();
    if (firstAi && s.greeting_message) reply = `${s.greeting_message}\n\n${reply}`;
    if (d.handoff && s.closing_message) reply = `${reply}\n\n${s.closing_message}`;
    const r = await send(reply);
    if (!r.ok) throw new Error(r.error);
    if (d.qualified) {
      await db.exec(`update contacts set commercial_status = 'qualified' where id = $1 and commercial_status in ('new','contacted','in_progress')`, [c.contact_id]);
      const tag = await ensureTag(db, c.company_id, "Qualificado pela IA", "#008C48");
      await db.exec(`insert into contact_tags (company_id, contact_id, tag_id, source) values ($1,$2,$3,'ai') on conflict do nothing`, [c.company_id, c.contact_id, tag]);
      await recordEvent(db, null, c.company_id, "contact.tag_added", { contactId: c.contact_id }, { tag: "Qualificado pela IA", by: "ai" });
    }
    if (d.handoff) {
      // transfere: vendedor do contato, ou o vendedor do número com menos conversas abertas
      const owner = c.assigned_user_id ?? (await db.maybeOne<{ user_id: string }>(
        `select m.user_id from whatsapp_connection_members m join company_memberships cm on cm.user_id = m.user_id and cm.company_id = m.company_id and cm.is_active
          where m.connection_id = $1 order by (select count(*) from conversations x where x.assigned_user_id = m.user_id and x.status <> 'closed') limit 1`, [c.whatsapp_connection_id]))?.user_id ?? null;
      await db.exec(`update conversations set ai_enabled = false, handled_by = 'human', assigned_user_id = coalesce(assigned_user_id, $2), unread_count = greatest(unread_count, 1) where id = $1`, [conversationId, owner]);
      await db.exec(`update contacts set owner_user_id = coalesce(owner_user_id, $2) where id = $1`, [c.contact_id, owner]);
      const open = await db.maybeOne(`select 1 from opportunities where contact_id = $1 and status = 'open'`, [c.contact_id]);
      if (!open && (d.qualified || d.intent === "compra")) {
        const st = await db.one<{ pipeline_id: string; stage_id: string }>(
          `select p.id as pipeline_id, coalesce((select s.id from pipeline_stages s where s.pipeline_id = p.id and s.kind = 'open' and s.name ilike '%qualificado%' limit 1),
                  (select s.id from pipeline_stages s where s.pipeline_id = p.id and s.kind = 'open' order by position limit 1)) as stage_id
             from pipelines p where p.company_id = $1 and p.is_default`, [c.company_id]);
        await db.exec(`insert into opportunities (company_id, contact_id, pipeline_id, stage_id, owner_user_id, campaign_id, conversation_id, title, notes)
                       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [c.company_id, c.contact_id, st.pipeline_id, st.stage_id, owner, c.origin_campaign_id, conversationId,
          "Lead qualificado pela IA", d.summary ? `Resumo da IA: ${d.summary}` : null]);
      }
      await recordEvent(db, null, c.company_id, "ai.handoff", { contactId: c.contact_id, campaignId: c.origin_campaign_id }, { reason: d.handoff_reason ?? null, summary: d.summary ?? null, to: owner });
    }
    return { replied: true, qualified: !!d.qualified, handoff: !!d.handoff };
  });
}

/** Teste do agente na tela (não envia WhatsApp; usa o mesmo conhecimento e as mesmas regras). */
export async function testAgent(ctx: AuthContext, history: ChatMessage[]) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "ai_chatbot");
  const msgs = parse(z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(30), history);
  return withScope(scopeOf(ctx), async (db) => {
    const s = await db.one<AiSettings>(`select * from ai_settings where company_id = $1`, [companyId]);
    return decide(buildSystem(s, ctx.company!.name, await knowledgeText(db, companyId), "ai_then_human"), msgs);
  });
}
