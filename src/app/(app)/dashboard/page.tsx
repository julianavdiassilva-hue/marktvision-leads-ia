import { requireModulePage } from "@/server/auth/next";
import { dashboardSummary } from "@/server/services/dashboard";
import { Alert, PageHeader, Stat } from "@/components/ui";
import { fmtInt, fmtMoney, pct } from "@/lib/format";

export const metadata = { title: "Dashboard" };

const FLOW = ["Prospecção", "Contatos", "Campanha", "Script", "WhatsApp", "Conversas", "IA", "Vendedor", "CRM", "Venda", "Relatórios"];

export default async function DashboardPage() {
  const ctx = await requireModulePage(["dashboard"]);
  const d = await dashboardSummary(ctx);
  const isSeller = ctx.role === "seller";
  return (
    <>
      <PageHeader title={`Olá, ${ctx.user.name.split(" ")[0]}`}
        description={isSeller ? "Seus números, calculados a partir dos seus contatos, conversas e vendas." : `Visão geral de ${ctx.company!.name}, calculada a partir dos dados reais registrados.`} />
      <div className="panel grid sm:grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-line sm:[&>*:nth-child(odd)]:border-r lg:[&>*]:border-r lg:[&>*:nth-child(4n)]:border-r-0 lg:[&>*:nth-last-child(-n+4)]:border-b-0">
        <Stat label="Total de contatos" value={fmtInt(d.contacts)} hint={`${fmtInt(d.leads_month)} captados neste mês`} />
        <Stat label="Campanhas ativas" value={fmtInt(d.campaigns_running)} hint={`${fmtInt(d.campaigns_paused)} pausadas`} />
        <Stat label="Mensagens enviadas" value={fmtInt(d.messages_sent)} hint={`${fmtInt(d.messages_delivered)} entregues (${pct(d.messages_delivered, d.messages_sent)}%)`} />
        <Stat label="Respostas recebidas" value={fmtInt(d.replies)} />
        <Stat label="Conversas em andamento" value={fmtInt(d.open_conversations)} />
        <Stat label="Leads qualificados" value={fmtInt(d.qualified)} />
        <Stat label="Negociações abertas" value={fmtInt(d.open_opportunities)} />
        <Stat label="Vendas realizadas" value={fmtInt(d.sales_count)} hint={`${fmtMoney(d.sales_amount)} · conversão ${pct(d.sales_count, d.contacts)}%`} />
      </div>
      {d.contacts === 0 && (
        <div className="mt-6"><Alert tone="green">Ainda não há dados comerciais registrados. Os indicadores serão preenchidos automaticamente conforme contatos, campanhas, conversas e vendas forem cadastrados.</Alert></div>
      )}
      <section className="mt-8">
        <h2 className="mb-3 text-[17px] font-bold">Fluxo comercial integrado</h2>
        <ol className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
          {FLOW.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className="rounded-full bg-brand-light px-3 py-1.5 text-brand-dark">{s}</span>
              {i < FLOW.length - 1 && <span className="text-muted">→</span>}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[14px] text-muted">Filtros por período, campanha, vendedor e origem, gráficos e metas chegam na Fase 09.</p>
      </section>
    </>
  );
}
