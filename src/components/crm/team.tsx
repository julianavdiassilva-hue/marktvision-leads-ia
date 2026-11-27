"use client";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Empty } from "@/components/ui";
import { deleteGoalAction, saveGoalAction } from "@/app/actions/crm";
import { fmtDate, fmtInt, fmtMoney } from "@/lib/format";
import type { GoalRow, SellerIndicator } from "@/server/services/team";

export function PeriodFilter({ from, to }: { from: string; to: string }) {
  return (
    <form className="flex flex-wrap items-end gap-2">
      <div><label className="label text-[13px]" htmlFor="de">De</label><input id="de" name="de" type="date" defaultValue={from} className="input py-2" /></div>
      <div><label className="label text-[13px]" htmlFor="ate">Até</label><input id="ate" name="ate" type="date" defaultValue={to} className="input py-2" /></div>
      <button className="btn btn-secondary">Aplicar</button>
    </form>
  );
}

export function Progress({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface ring-1 ring-line"><div className={clsx("h-full rounded-full", value >= 100 ? "bg-brand" : value >= 60 ? "bg-brand/70" : "bg-warning")} style={{ width: `${Math.min(100, value)}%` }} /></div>
      <span className="text-[13.5px] font-semibold tabular-nums">{value}%</span>
    </div>
  );
}

export function IndicatorsTable({ rows }: { rows: SellerIndicator[] }) {
  if (!rows.length) return <Empty title="Sem vendedores" />;
  return (
    <div className="overflow-x-auto"><table className="table min-w-[1000px]">
      <thead><tr><th>Vendedor</th><th className="text-right">Leads recebidos</th><th className="text-right">Atendidos</th><th className="text-right">Pendentes</th><th className="text-right">Negociações</th>
        <th className="text-right">Vendas</th><th className="text-right">Valor</th><th className="text-right">Conversão</th><th className="text-right">1ª resposta</th><th>Meta</th></tr></thead>
      <tbody>{rows.map((r) => {
        const conv = r.won + r.lost ? Math.round((r.won / (r.won + r.lost)) * 1000) / 10 : null;
        return (
          <tr key={r.user_id}>
            <td><p className="font-semibold">{r.name}</p><p className="text-[13px] text-muted">{r.role === "seller" ? "Vendedor" : "Administrador"}{!r.is_active && " · inativo"}</p></td>
            <td className="text-right tabular-nums">{fmtInt(r.leads_received)}</td><td className="text-right tabular-nums">{fmtInt(r.leads_attended)}</td>
            <td className={clsx("text-right tabular-nums", r.pending > 0 && "font-semibold text-warning")}>{fmtInt(r.pending)}</td>
            <td className="text-right tabular-nums">{fmtInt(r.open_opportunities)}</td><td className="text-right tabular-nums">{fmtInt(r.sales_count)}</td>
            <td className="text-right font-semibold tabular-nums">{fmtMoney(r.sales_amount)}</td>
            <td className="text-right tabular-nums">{conv == null ? "—" : `${conv}%`}</td>
            <td className="text-right tabular-nums">{r.avg_first_response_min == null ? "—" : r.avg_first_response_min < 60 ? `${r.avg_first_response_min} min` : `${(r.avg_first_response_min / 60).toFixed(1)} h`}</td>
            <td><Progress value={r.goal_progress} /></td>
          </tr>);
      })}</tbody>
    </table></div>
  );
}

const METRICS: Record<string, string> = { sales_amount: "Valor vendido (R$)", sales_count: "Quantidade de vendas", leads_attended: "Leads atendidos", opportunities_created: "Negociações criadas" };

export function GoalsPanel({ goals, team, from, to, canEdit }: { goals: GoalRow[]; team: { id: string; name: string }[]; from: string; to: string; canEdit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ userId: "team", metric: "sales_amount", target: "", periodStart: from, periodEnd: to });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      {canEdit && (
        <div className="mb-4 grid gap-2 rounded-xl bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_0.8fr_0.9fr_0.9fr_auto] lg:items-end">
          <div><label className="label text-[13px]" htmlFor="g-user">Para</label><select id="g-user" className="input py-2" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
            <option value="team">Equipe (meta coletiva)</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div><label className="label text-[13px]" htmlFor="g-metric">Indicador</label><select id="g-metric" className="input py-2" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}>
            {Object.entries(METRICS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label className="label text-[13px]" htmlFor="g-target">Meta</label><input id="g-target" className="input py-2" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></div>
          <div><label className="label text-[13px]" htmlFor="g-start">Início</label><input id="g-start" type="date" className="input py-2" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></div>
          <div><label className="label text-[13px]" htmlFor="g-end">Fim</label><input id="g-end" type="date" className="input py-2" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await saveGoalAction(f); setMsg(r.ok ? { ok: true, text: r.message! } : { ok: false, text: r.error }); if (r.ok) { setF({ ...f, target: "" }); router.refresh(); } })}>Salvar meta</button>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={clsx("mb-3 text-[14.5px] font-medium", msg.ok ? "text-brand-dark" : "text-danger")}>{msg.text}</p>}
      {goals.length === 0 ? <p className="text-[15px] text-muted">Nenhuma meta no período.</p> : (
        <ul className="divide-y divide-line">{goals.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-4 py-3">
            <div className="min-w-[220px] flex-1"><p className="font-semibold">{g.user_name ?? "Equipe"} · {METRICS[g.metric]}</p><p className="text-[13px] text-muted">{fmtDate(g.period_start)} a {fmtDate(g.period_end)}</p></div>
            <p className="text-[14.5px] tabular-nums">{g.metric === "sales_amount" ? `${fmtMoney(g.achieved)} de ${fmtMoney(g.target)}` : `${fmtInt(Number(g.achieved))} de ${fmtInt(Number(g.target))}`}</p>
            <Progress value={g.progress} />
            {canEdit && <button aria-label="Excluir meta" className="text-muted hover:text-danger" onClick={() => start(async () => { await deleteGoalAction(g.id); router.refresh(); })}><Trash2 className="h-4 w-4" /></button>}
          </li>))}
        </ul>
      )}
    </div>
  );
}
