import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/next";
import { hasFeature } from "@/server/guards";
import { buildReport, REPORTS } from "@/server/services/reports";
import { periodOf } from "@/server/services/team";
import { ReportTable } from "@/components/reports/report-table";
import { Logo } from "@/components/logo";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const metadata = { title: "Relatório (PDF)" };

/** Versão de impressão: o navegador salva em PDF ("Salvar como PDF"). */
export default async function PrintReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAuth();
  if (!ctx) redirect("/login");
  if (!ctx.company || !hasFeature(ctx, "reports") || !hasFeature(ctx, "data_export")) redirect("/acesso-negado");
  const sp = await searchParams;
  if (!REPORTS[sp.tipo ?? ""]) redirect("/relatorios");
  const r = await buildReport(ctx, sp.tipo!, { ...periodOf(sp), sellerId: sp.vendedor, campaignId: sp.campanha, source: sp.origem }).catch(() => null);
  if (!r) redirect("/acesso-negado");
  return (
    <main className="mx-auto max-w-5xl p-8 print:p-0">
      <style>{`@media print { @page { size: A4 landscape; margin: 12mm } .no-print { display: none } }`}</style>
      <div className="mb-6 flex items-center justify-between border-b border-line pb-4"><Logo /><div className="text-right text-[13px] text-muted"><p className="font-semibold text-ink">{ctx.company.name}</p><p>Gerado em {fmtDateTime(new Date())} por {ctx.user.name}</p></div></div>
      <h1 className="text-[22px] font-bold">{r.title}</h1>
      <p className="mb-5 text-[14px] text-muted">Período: {fmtDate(r.period.from + "T12:00:00")} a {fmtDate(r.period.to + "T12:00:00")} · dados reais registrados no sistema</p>
      <div className="rounded-lg border border-line"><ReportTable r={r} /></div>
      <button className="no-print btn btn-primary mt-6" id="print">Salvar como PDF / Imprimir</button>
      <script dangerouslySetInnerHTML={{ __html: `document.getElementById('print').onclick=()=>window.print();setTimeout(()=>window.print(),600);` }} />
    </main>
  );
}
