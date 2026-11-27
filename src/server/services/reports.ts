import type { AuthContext } from "../auth/core";
import { withScope } from "../db";
import { forbidden, invalid } from "../errors";
import { assertCompany, assertFeature, hasFeature, isCompanyAdmin, scopeOf } from "../guards";
import { uuid } from "../validation";
import { listGoals, sellerIndicators, type Period } from "./team";
import { SOURCE_LABEL } from "@/lib/labels";

/** Declara os 6 filtros com tipo em toda consulta (Postgres exige todos os parâmetros referenciados). */
const F = "with _f as (select $1::uuid as c, $2::date as f, $3::date as t, $4::uuid as s, $5::uuid as ca, $6::text as o) ";

export const REPORTS: Record<string, { title: string; description: string; adminOnly?: boolean }> = {
  prospeccao: { title: "Prospecção e captação de leads", description: "Leads por origem e quanto cada origem gerou de respostas, negociações e vendas." },
  campanhas: { title: "Campanhas", description: "Envios, entregas, respostas, falhas, negociações e vendas por campanha." },
  mensagens: { title: "Mensagens e respostas", description: "Volume diário de mensagens enviadas, entregues, lidas, com falha e recebidas." },
  atendimento: { title: "Atendimento e desempenho comercial", description: "Indicadores por vendedor no período.", adminOnly: true },
  vendas: { title: "Vendas", description: "Vendas registradas no período, com vendedor e campanha de origem." },
  perdas: { title: "Conversão e perdas", description: "Negociações ganhas e perdidas, e os motivos de perda." },
  metas: { title: "Metas", description: "Metas do período com o realizado." },
};
export type Column = { key: string; label: string; kind?: "int" | "money" | "pct" | "text" | "date" };
export type Report = { type: string; title: string; columns: Column[]; rows: Record<string, unknown>[]; period: Period };
export type ReportFilters = Period & { sellerId?: string; campaignId?: string; source?: string };

export async function buildReport(ctx: AuthContext, type: string, f: ReportFilters): Promise<Report> {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "reports");
  const meta = REPORTS[type];
  if (!meta) throw invalid("Relatório inexistente.");
  if (meta.adminOnly && !isCompanyAdmin(ctx)) throw forbidden("Relatório disponível apenas para o administrador.");
  const seller = ctx.role === "seller" ? ctx.user.id : f.sellerId && uuid.safeParse(f.sellerId).success ? f.sellerId : null;
  const campaign = f.campaignId && uuid.safeParse(f.campaignId).success ? f.campaignId : null;
  const source = f.source && /^[a-z_]+$/.test(f.source) ? f.source : null;
  const P = [companyId, f.from, f.to, seller, campaign, source];
  const per = (c: string) => `${c} >= $2::date and ${c} < ($3::date + 1)`;
  const base = { type, title: meta.title, period: { from: f.from, to: f.to } };
  if (type === "atendimento") {
    const rows = (await sellerIndicators(ctx, f)).filter((r) => !seller || r.user_id === seller);
    return { ...base, columns: [{ key: "name", label: "Vendedor" }, { key: "leads_received", label: "Leads recebidos", kind: "int" }, { key: "leads_attended", label: "Atendidos", kind: "int" },
      { key: "pending", label: "Pendentes", kind: "int" }, { key: "open_opportunities", label: "Negociações abertas", kind: "int" }, { key: "sales_count", label: "Vendas", kind: "int" },
      { key: "sales_amount", label: "Valor vendido", kind: "money" }, { key: "conversion", label: "Conversão (%)", kind: "pct" }, { key: "avg_first_response_min", label: "1ª resposta (min)", kind: "int" },
      { key: "goal_progress", label: "Meta (%)", kind: "pct" }],
      rows: rows.map((r) => ({ ...r, conversion: r.won + r.lost ? Math.round((r.won / (r.won + r.lost)) * 1000) / 10 : null })) };
  }
  if (type === "metas") {
    if (!hasFeature(ctx, "goals")) throw forbidden("A funcionalidade Metas não está liberada.");
    const g = await listGoals(ctx, f);
    return { ...base, columns: [{ key: "who", label: "Responsável" }, { key: "metric", label: "Indicador" }, { key: "period_start", label: "Início", kind: "date" }, { key: "period_end", label: "Fim", kind: "date" },
      { key: "target", label: "Meta", kind: "int" }, { key: "achieved", label: "Realizado", kind: "int" }, { key: "progress", label: "Atingido (%)", kind: "pct" }],
      rows: g.map((x) => ({ ...x, who: x.user_name ?? "Equipe", metric: ({ sales_amount: "Valor vendido (R$)", sales_count: "Quantidade de vendas", leads_attended: "Leads atendidos", opportunities_created: "Negociações criadas" } as Record<string, string>)[x.metric] })) };
  }
  return withScope(scopeOf(ctx), async (db) => {
    if (type === "prospeccao") {
      const rows = await db.query(
        `${F}select c.source, count(*)::int as leads, count(c.phone_e164)::int as with_phone,
           count(*) filter (where exists (select 1 from messages m where m.contact_id = c.id and m.direction = 'inbound'))::int as replied,
           count(*) filter (where exists (select 1 from opportunities o where o.contact_id = c.id))::int as opportunities,
           count(*) filter (where exists (select 1 from sales s where s.contact_id = c.id))::int as customers
         from contacts c where c.company_id = $1 and ${per("c.created_at")} and ($4::uuid is null or c.owner_user_id = $4) and ($6::text is null or c.source = $6)
           and ($5::uuid is null or exists (select 1 from campaign_contacts x where x.contact_id = c.id and x.campaign_id = $5))
         group by c.source order by leads desc`, P);
      return { ...base, columns: [{ key: "source_label", label: "Origem" }, { key: "leads", label: "Leads no período", kind: "int" }, { key: "with_phone", label: "Com telefone", kind: "int" },
        { key: "replied", label: "Responderam", kind: "int" }, { key: "opportunities", label: "Viraram negociação", kind: "int" }, { key: "customers", label: "Compraram", kind: "int" }],
        rows: rows.map((r) => ({ ...r, source_label: SOURCE_LABEL[String(r.source)] ?? r.source })) };
    }
    if (type === "campanhas") {
      const rows = await db.query(
        `${F}select '#' || ca.number || ' ' || ca.name as campaign, ca.status,
           (select count(*)::int from campaign_contacts x where x.campaign_id = ca.id) as total,
           (select count(*)::int from campaign_contacts x where x.campaign_id = ca.id and x.status in ('sent','delivered','read','replied')) as sent,
           (select count(*)::int from campaign_contacts x where x.campaign_id = ca.id and x.status in ('delivered','read','replied')) as delivered,
           (select count(*)::int from campaign_contacts x where x.campaign_id = ca.id and x.status = 'replied') as replies,
           (select count(*)::int from campaign_contacts x where x.campaign_id = ca.id and x.status = 'failed') as failed,
           (select count(*)::int from campaign_contacts x where x.campaign_id = ca.id and x.status = 'skipped') as skipped,
           (select count(*)::int from opportunities o where o.campaign_id = ca.id and ($4::uuid is null or o.owner_user_id = $4)) as converted,
           (select count(*)::int from sales s where s.campaign_id = ca.id and ($4::uuid is null or s.seller_user_id = $4)) as sales_count,
           (select coalesce(sum(amount),0) from sales s where s.campaign_id = ca.id and ($4::uuid is null or s.seller_user_id = $4)) as sales_amount
         from campaigns ca where ca.company_id = $1 and ($5::uuid is null or ca.id = $5)
           and (ca.created_at < ($3::date + 1)) and coalesce(ca.completed_at, now()) >= $2::date order by ca.number desc`, P);
      const STATUS: Record<string, string> = { draft: "Rascunho", scheduled: "Programada", running: "Em andamento", paused: "Pausada", completed: "Concluída", cancelled: "Cancelada" };
      return { ...base, columns: [{ key: "campaign", label: "Campanha" }, { key: "status_label", label: "Situação" }, { key: "total", label: "Contatos", kind: "int" }, { key: "sent", label: "Enviados", kind: "int" },
        { key: "delivered", label: "Entregues", kind: "int" }, { key: "replies", label: "Respostas", kind: "int" }, { key: "response_rate", label: "Taxa de resposta (%)", kind: "pct" },
        { key: "failed", label: "Falhas", kind: "int" }, { key: "skipped", label: "Ignorados", kind: "int" }, { key: "converted", label: "Negociações", kind: "int" },
        { key: "sales_count", label: "Vendas", kind: "int" }, { key: "sales_amount", label: "Valor", kind: "money" }],
        rows: rows.map((r) => ({ ...r, status_label: STATUS[String(r.status)], response_rate: Number(r.sent) ? Math.round((Number(r.replies) / Number(r.sent)) * 1000) / 10 : null })) };
    }
    if (type === "mensagens") {
      const rows = await db.query(
        `${F}select d::date as day,
           count(m.*) filter (where m.direction = 'outbound' and m.status in ('sent','delivered','read'))::int as sent,
           count(m.*) filter (where m.direction = 'outbound' and m.status in ('delivered','read'))::int as delivered,
           count(m.*) filter (where m.direction = 'outbound' and m.status = 'read')::int as read,
           count(m.*) filter (where m.direction = 'outbound' and m.status = 'failed')::int as failed,
           count(m.*) filter (where m.direction = 'inbound')::int as received
         from generate_series($2::date, $3::date, interval '1 day') d
         left join messages m on m.company_id = $1 and m.created_at >= d and m.created_at < d + interval '1 day' and ($5::uuid is null or m.campaign_id = $5 or m.direction = 'inbound')
           and ($4::uuid is null or exists (select 1 from conversations cv where cv.id = m.conversation_id and cv.assigned_user_id = $4))
         group by d order by d`, P);
      return { ...base, columns: [{ key: "day", label: "Dia", kind: "date" }, { key: "sent", label: "Enviadas", kind: "int" }, { key: "delivered", label: "Entregues", kind: "int" },
        { key: "read", label: "Lidas", kind: "int" }, { key: "failed", label: "Falhas", kind: "int" }, { key: "received", label: "Recebidas", kind: "int" }], rows };
    }
    if (type === "vendas") {
      const rows = await db.query(
        `${F}select s.sold_at, coalesce(c.name, c.organization) as contact, u.name as seller, '#' || ca.number || ' ' || ca.name as campaign, s.amount, c.source
           from sales s join contacts c on c.id = s.contact_id left join users u on u.id = s.seller_user_id left join campaigns ca on ca.id = s.campaign_id
          where s.company_id = $1 and ${per("s.sold_at")} and ($4::uuid is null or s.seller_user_id = $4) and ($5::uuid is null or s.campaign_id = $5) and ($6::text is null or c.source = $6)
          order by s.sold_at desc`, P);
      return { ...base, columns: [{ key: "sold_at", label: "Data", kind: "date" }, { key: "contact", label: "Cliente" }, { key: "seller", label: "Vendedor" }, { key: "campaign", label: "Campanha" },
        { key: "source_label", label: "Origem" }, { key: "amount", label: "Valor", kind: "money" }], rows: rows.map((r) => ({ ...r, source_label: SOURCE_LABEL[String(r.source)] ?? r.source })) };
    }
    // perdas / conversão
    const rows = await db.query(
      `${F}select coalesce(o.lost_reason, '(ganhas)') as reason, o.status, count(*)::int as qty, coalesce(sum(o.value),0) as value
         from opportunities o join contacts c on c.id = o.contact_id
        where o.company_id = $1 and o.status in ('won','lost') and ${per("coalesce(o.won_at, o.lost_at)")} and ($4::uuid is null or o.owner_user_id = $4)
          and ($5::uuid is null or o.campaign_id = $5) and ($6::text is null or c.source = $6)
        group by 1, 2 order by o.status desc, qty desc`, P);
    const won = rows.filter((r) => r.status === "won").reduce((a, r) => a + Number(r.qty), 0);
    const lost = rows.filter((r) => r.status === "lost").reduce((a, r) => a + Number(r.qty), 0);
    return { ...base, title: `${meta.title} — ${won} ganha(s), ${lost} perdida(s), conversão ${won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : 0}%`,
      columns: [{ key: "result", label: "Resultado" }, { key: "reason", label: "Motivo" }, { key: "qty", label: "Quantidade", kind: "int" }, { key: "value", label: "Valor", kind: "money" }],
      rows: rows.map((r) => ({ ...r, result: r.status === "won" ? "Ganha" : "Perdida", reason: r.status === "won" ? "—" : r.reason })) };
  });
}

export function formatCell(v: unknown, kind?: Column["kind"]): string {
  if (v === null || v === undefined || v === "") return "";
  if (kind === "money") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
  if (kind === "int") return new Intl.NumberFormat("pt-BR").format(Number(v));
  if (kind === "pct") return `${String(v).replace(".", ",")}%`;
  if (kind === "date") return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Belem" }).format(new Date(String(v).length === 10 ? `${v}T12:00:00` : String(v)));
  return String(v);
}

/** CSV para Excel em português (;) com proteção contra fórmulas. */
export function reportCsv(r: Report) {
  const esc = (s: string) => { let x = s; if (/^[=+\-@]/.test(x)) x = "'" + x; return /[";\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  return "﻿" + [r.columns.map((c) => esc(c.label)).join(";"), ...r.rows.map((row) => r.columns.map((c) => esc(formatCell(row[c.key], c.kind))).join(";"))].join("\r\n");
}

/** Planilha Excel (.xlsx) com números reais (somáveis) e cabeçalho. */
export async function reportXlsx(r: Report): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const aoa: unknown[][] = [[r.title], [`Período: ${formatCell(r.period.from, "date")} a ${formatCell(r.period.to, "date")}`], [],
    r.columns.map((c) => c.label),
    ...r.rows.map((row) => r.columns.map((c) => {
      const v = row[c.key];
      if (v === null || v === undefined) return "";
      if (c.kind === "money" || c.kind === "int" || c.kind === "pct") return Number(v);
      if (c.kind === "date") return formatCell(v, "date");
      const s = String(v); return /^[=+\-@]/.test(s) ? "'" + s : s;
    }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = r.columns.map((c) => ({ wch: Math.max(12, c.label.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatório");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
