import clsx from "clsx";
import Link from "next/link";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { requireModulePage } from "@/server/auth/next";
import { hasFeature, isCompanyAdmin } from "@/server/guards";
import { buildReport, REPORTS } from "@/server/services/reports";
import { periodOf } from "@/server/services/team";
import { dashboardData } from "@/server/services/dashboard";
import { PageHeader, Panel } from "@/components/ui";
import { ReportTable } from "@/components/reports/report-table";
import { SOURCE_LABEL } from "@/lib/labels";

export const metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireModulePage(["reports"]);
  const sp = await searchParams;
  const types = Object.entries(REPORTS).filter(([k, m]) => (!m.adminOnly || isCompanyAdmin(ctx)) && (k !== "metas" || hasFeature(ctx, "goals")));
  const type = types.some(([k]) => k === sp.tipo) ? sp.tipo! : types[0][0];
  const period = periodOf(sp);
  const filters = { ...period, sellerId: sp.vendedor, campaignId: sp.campanha, source: sp.origem };
  const [r, opts] = await Promise.all([buildReport(ctx, type, filters), dashboardData(ctx, period).then((d) => d.options).catch(() => [])]);
  const qs = new URLSearchParams(Object.entries({ tipo: type, de: period.from, ate: period.to, vendedor: sp.vendedor, campanha: sp.campanha, origem: sp.origem }).filter(([, v]) => v) as [string, string][]).toString();
  const canExport = hasFeature(ctx, "data_export");
  return (
    <>
      <PageHeader title="Relatórios" description="Todos os números vêm exclusivamente dos registros do sistema." />
      <nav className="mb-5 flex flex-wrap gap-1.5">
        {types.map(([k, m]) => <Link key={k} href={`?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qs)), tipo: k })}`}
          className={clsx("rounded-lg px-3.5 py-2 text-[14.5px] font-semibold", k === type ? "bg-brand text-white" : "bg-surface text-ink hover:bg-brand-light")}>{m.title.split(" e ")[0].split(" — ")[0]}</Link>)}
      </nav>
      <form className="mb-5 flex flex-wrap items-end gap-2.5">
        <input type="hidden" name="tipo" value={type} />
        <div><label className="label text-[13px]" htmlFor="de">De</label><input id="de" name="de" type="date" defaultValue={period.from} className="input py-2" /></div>
        <div><label className="label text-[13px]" htmlFor="ate">Até</label><input id="ate" name="ate" type="date" defaultValue={period.to} className="input py-2" /></div>
        <div><label className="label text-[13px]" htmlFor="campanha">Campanha</label><select id="campanha" name="campanha" defaultValue={sp.campanha ?? ""} className="input py-2">
          <option value="">Todas</option>{opts.filter((o) => o.kind === "campaign").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        {ctx.role !== "seller" && <div><label className="label text-[13px]" htmlFor="vendedor">Vendedor</label><select id="vendedor" name="vendedor" defaultValue={sp.vendedor ?? ""} className="input py-2">
          <option value="">Todos</option>{opts.filter((o) => o.kind === "seller").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
        <div><label className="label text-[13px]" htmlFor="origem">Origem</label><select id="origem" name="origem" defaultValue={sp.origem ?? ""} className="input py-2">
          <option value="">Todas</option>{Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <button className="btn btn-primary">Aplicar</button>
      </form>
      <Panel title={r.title} description={REPORTS[type].description} padded={false}
        actions={canExport ? <div className="flex flex-wrap gap-2">
          <a className="btn btn-secondary btn-sm" href={`/api/relatorios/exportar?${qs}&formato=csv`}><Download className="h-4 w-4" />CSV</a>
          <a className="btn btn-secondary btn-sm" href={`/api/relatorios/exportar?${qs}&formato=xlsx`}><FileSpreadsheet className="h-4 w-4" />Excel</a>
          <a className="btn btn-secondary btn-sm" href={`/imprimir/relatorio?${qs}`} target="_blank"><Printer className="h-4 w-4" />PDF</a>
        </div> : <span className="text-[13px] text-muted">Exportação não liberada no seu acesso</span>}>
        <ReportTable r={r} />
      </Panel>
    </>
  );
}
