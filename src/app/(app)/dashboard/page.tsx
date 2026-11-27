import Link from "next/link";
import { requireModulePage } from "@/server/auth/next";
import { hasFeature } from "@/server/guards";
import { dashboardData } from "@/server/services/dashboard";
import { listGoals, periodOf } from "@/server/services/team";
import { Alert, PageHeader, Panel, Stat } from "@/components/ui";
import { ColumnChart, HBarChart } from "@/components/charts/charts";
import { Progress } from "@/components/crm/team";
import { AutoRefresh } from "@/components/auto-refresh";
import { SOURCE_LABEL } from "@/lib/labels";
import { fmtInt, fmtMoney, pctBr as pct } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireModulePage(["dashboard"]);
  const sp = await searchParams;
  const period = periodOf(sp);
  const f = { ...period, campaignId: sp.campanha, sellerId: sp.vendedor, source: sp.origem };
  const [d, goals] = await Promise.all([dashboardData(ctx, f), hasFeature(ctx, "goals") ? listGoals(ctx, period) : Promise.resolve([])]);
  const k = d.k as Record<string, number> & { sales_amount: string; pipeline_value: string };
  const isSeller = ctx.role === "seller";
  const funnel = [["Leads no período", k.leads], ["Responderam", k.replied_contacts], ["Negociações abertas", k.open_opportunities], ["Vendas", k.sales_count]] as [string, number][];
  const dayLabel = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader title={`Olá, ${ctx.user.name.split(" ")[0]}`} description={isSeller ? "Seus números no período, calculados a partir dos seus contatos, conversas e vendas." : `Resultados de ${ctx.company!.name}, calculados a partir dos dados reais registrados.`} />
      <form className="mb-5 flex flex-wrap items-end gap-2.5">
        <div><label className="label text-[13px]" htmlFor="de">De</label><input id="de" name="de" type="date" defaultValue={period.from} className="input py-2" /></div>
        <div><label className="label text-[13px]" htmlFor="ate">Até</label><input id="ate" name="ate" type="date" defaultValue={period.to} className="input py-2" /></div>
        <div><label className="label text-[13px]" htmlFor="campanha">Campanha</label><select id="campanha" name="campanha" defaultValue={sp.campanha ?? ""} className="input py-2">
          <option value="">Todas</option>{d.options.filter((o) => o.kind === "campaign").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        {!isSeller && <div><label className="label text-[13px]" htmlFor="vendedor">Vendedor</label><select id="vendedor" name="vendedor" defaultValue={sp.vendedor ?? ""} className="input py-2">
          <option value="">Todos</option>{d.options.filter((o) => o.kind === "seller").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
        <div><label className="label text-[13px]" htmlFor="origem">Origem do lead</label><select id="origem" name="origem" defaultValue={sp.origem ?? ""} className="input py-2">
          <option value="">Todas</option>{Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <button className="btn btn-primary">Aplicar filtros</button>
        <Link href="/dashboard" className="btn btn-ghost">Limpar</Link>
      </form>

      <div className="panel grid sm:grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-line sm:[&>*:nth-child(odd)]:border-r lg:[&>*]:border-r lg:[&>*:nth-child(4n)]:border-r-0 lg:[&>*:nth-last-child(-n+4)]:border-b-0">
        <Stat label="Total de contatos" value={fmtInt(k.contacts)} hint={`${fmtInt(k.leads)} captados no período`} href="/contatos" />
        <Stat label="Campanhas ativas" value={fmtInt(k.campaigns_running)} hint={`${fmtInt(k.campaigns_paused)} pausadas`} href="/campanhas" />
        <Stat label="Mensagens enviadas" value={fmtInt(k.sent)} hint={`${fmtInt(k.delivered)} entregues (${pct(k.delivered, k.sent)}%)`} />
        <Stat label="Contatos que responderam" value={fmtInt(k.replied_contacts)} hint="no período" href="/conversas" />
        <Stat label="Conversas em andamento" value={fmtInt(k.open_conversations)} href="/conversas" />
        <Stat label="Leads qualificados" value={fmtInt(k.qualified)} />
        <Stat label="Negociações abertas" value={fmtInt(k.open_opportunities)} hint={fmtMoney(k.pipeline_value) + " em negociação"} href="/crm" />
        <Stat label="Vendas no período" value={fmtInt(k.sales_count)} hint={`${fmtMoney(k.sales_amount)} · conversão ${pct(k.sales_count, k.leads)}%`} />
      </div>
      {k.contacts === 0 && <div className="mt-5"><Alert tone="green">Ainda não há dados comerciais. Os indicadores são preenchidos automaticamente com contatos, campanhas, conversas e vendas reais.</Alert></div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Leads captados por dia"><ColumnChart title="Novos contatos" data={d.daily.map((x) => ({ label: dayLabel(x.day), full: x.day.split("-").reverse().join("/"), value: x.leads }))} /></Panel>
        <Panel title="Respostas por dia"><ColumnChart title="Contatos que responderam" data={d.daily.map((x) => ({ label: dayLabel(x.day), full: x.day.split("-").reverse().join("/"), value: x.replies }))} /></Panel>
        <Panel title="Vendas por dia"><ColumnChart title="Vendas" data={d.daily.map((x) => ({ label: dayLabel(x.day), full: x.day.split("-").reverse().join("/"), value: x.sales }))} /></Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Funil do período" description="Cada etapa com o percentual em relação aos leads do período.">
          <HBarChart data={funnel.map(([label, value], i) => ({ label, value, note: i > 0 && funnel[0][1] ? `${pct(value, funnel[0][1])}% dos leads` : null }))} />
        </Panel>
        {!isSeller ? (
          <Panel title="Vendas por vendedor (R$)">
            {d.bySeller.length ? <HBarChart data={d.bySeller.map((s) => ({ label: s.name, value: Number(s.sales_amount), extra: `${s.sales_count} venda(s)` }))} kind="money" /> : <p className="text-muted">Sem vendedores.</p>}
          </Panel>
        ) : (
          <Panel title="Minhas metas">{goals.length ? <ul className="space-y-3">{goals.map((g) => <li key={g.id} className="flex items-center justify-between gap-3"><span>{g.user_name ? "Minha meta" : "Meta da equipe"}</span><Progress value={g.progress} /></li>)}</ul> : <p className="text-muted">Nenhuma meta no período.</p>}</Panel>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Resultados por campanha" padded={false}>
          {d.byCampaign.length === 0 ? <p className="p-5 text-muted">Nenhuma campanha.</p> : (
            <div className="overflow-x-auto"><table className="table min-w-[640px]">
              <thead><tr><th>Campanha</th><th className="text-right">Contatos</th><th className="text-right">Enviados</th><th className="text-right">Respostas</th><th className="text-right">Negociações</th><th className="text-right">Vendas</th></tr></thead>
              <tbody>{d.byCampaign.map((c) => (
                <tr key={c.id}><td><Link href={`/campanhas/${c.id}`} className="font-semibold hover:text-brand">#{c.number} {c.name}</Link></td>
                  <td className="text-right tabular-nums">{fmtInt(c.total)}</td><td className="text-right tabular-nums">{fmtInt(c.sent)}</td>
                  <td className="text-right tabular-nums">{fmtInt(c.replies)} <span className="text-[12.5px] text-muted">{pct(c.replies, c.sent)}%</span></td>
                  <td className="text-right tabular-nums">{fmtInt(c.converted)}</td><td className="text-right tabular-nums">{fmtInt(c.sales_count)} · {fmtMoney(c.sales_amount)}</td></tr>))}</tbody>
            </table></div>
          )}
        </Panel>
        {!isSeller && (
          <Panel title="Metas comerciais">
            {goals.length ? <ul className="space-y-3">{goals.map((g) => <li key={g.id} className="flex items-center justify-between gap-3 text-[14.5px]"><span className="truncate">{g.user_name ?? "Equipe"}</span><Progress value={g.progress} /></li>)}</ul>
              : <p className="text-muted">Nenhuma meta no período. Defina em Equipe Comercial.</p>}
          </Panel>
        )}
      </div>
    </>
  );
}
