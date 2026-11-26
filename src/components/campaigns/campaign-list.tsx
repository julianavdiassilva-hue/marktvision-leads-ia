"use client";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, BarChart3, Copy, Loader2, Pause, Pencil, Play, RotateCcw, XCircle } from "lucide-react";
import { campaignOpAction } from "@/app/actions/campaigns";
import { fmtInt, fmtMoney, fmtDateTime } from "@/lib/format";
import type { CampaignOp, CampaignRow } from "@/server/services/campaigns";

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-surface text-muted border border-line" },
  scheduled: { label: "Programada", cls: "bg-sky-50 text-sky-800" },
  running: { label: "Em andamento", cls: "bg-brand-light text-brand-dark" },
  paused: { label: "Pausada", cls: "bg-warning-light text-warning" },
  completed: { label: "Concluída", cls: "bg-brand text-white" },
  cancelled: { label: "Cancelada", cls: "bg-danger-light text-danger" },
};

export function CampaignStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.draft;
  return <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold", s.cls)}>{status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />}{s.label}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface ring-1 ring-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

export function CampaignActions({ c, compact }: { c: Pick<CampaignRow, "id" | "status" | "is_archived" | "name">; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (op: CampaignOp, confirmText?: string, arg?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setMsg(null);
    start(async () => {
      const r = await campaignOpAction(c.id, op, arg);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Concluído." });
      const newId = (r.data as { id?: string } | undefined)?.id;
      if (op === "duplicate" && newId) router.push(`/campanhas/${newId}/editar`); else router.refresh();
    });
  };
  const B = ({ onClick, icon: Icon, label, tone = "secondary" }: { onClick: () => void; icon: typeof Play; label: string; tone?: "primary" | "secondary" | "danger" | "ghost" }) => (
    <button type="button" disabled={pending} onClick={onClick} className={clsx("btn btn-sm", `btn-${tone}`)} title={label}><Icon className="h-4 w-4" />{!compact && label}{compact && <span className="sr-only">{label}</span>}</button>
  );
  const s = c.status;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {pending && <Loader2 className="h-4 w-4 animate-spin self-center text-brand" />}
        {(s === "draft" || s === "scheduled") && <B tone="primary" icon={Play} label="Iniciar" onClick={() => run("start", `Iniciar a campanha "${c.name}" agora?`)} />}
        {s === "running" && <B icon={Pause} label="Pausar" onClick={() => run("pause")} />}
        {s === "paused" && <B tone="primary" icon={Play} label="Retomar" onClick={() => run("resume")} />}
        {["draft", "scheduled", "paused"].includes(s) && <Link href={`/campanhas/${c.id}/editar`} className="btn btn-secondary btn-sm" title="Editar"><Pencil className="h-4 w-4" />{!compact && "Editar"}</Link>}
        <Link href={`/campanhas/${c.id}`} className="btn btn-secondary btn-sm" title="Resultados"><BarChart3 className="h-4 w-4" />{!compact && "Resultados"}</Link>
        <B tone="ghost" icon={Copy} label="Duplicar" onClick={() => run("duplicate")} />
        {!["completed", "cancelled"].includes(s) && <B tone="ghost" icon={XCircle} label="Cancelar" onClick={() => run("cancel", "Cancelar esta campanha? Os envios restantes não serão realizados.")} />}
        {!c.is_archived && !["running", "scheduled"].includes(s) && <B tone="ghost" icon={Archive} label="Arquivar" onClick={() => run("archive")} />}
        {c.is_archived && <B tone="ghost" icon={RotateCcw} label="Restaurar" onClick={() => run("unarchive")} />}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={clsx("max-w-md text-right text-[13px] font-medium", msg.ok ? "text-brand-dark" : "text-danger")}>{msg.text}</p>}
    </div>
  );
}

export function CampaignList({ rows }: { rows: CampaignRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((c) => {
        const metrics: [string, number, boolean?][] = [["contatos", c.total], ["enviados", c.sent], ["entregues", c.delivered], ["respostas", c.replies],
          ["falhas", c.failed, c.failed > 0], ["ignorados", c.skipped], ["convertidos", c.converted], ["vendas", c.sales_count]];
        return (
          <li key={c.id} className="panel px-5 py-4" data-testid={`campanha-${c.number}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-md bg-brand-light px-2 py-0.5 text-[13px] font-bold tabular-nums text-brand-dark">{String(c.number).padStart(2, "0")}</span>
                  <Link href={`/campanhas/${c.id}`} className="truncate text-[17px] font-bold text-ink hover:text-brand">{c.name}</Link>
                </div>
                <p className="mt-1 truncate text-[14.5px] text-muted">Lista: <span className="font-medium text-ink">{c.list_name ?? "seleção própria"}</span>{c.scheduled_at && ` · início ${fmtDateTime(c.scheduled_at)}`}{c.sales_count > 0 && ` · ${fmtMoney(c.sales_amount)} em vendas`}</p>
              </div>
              <div className="lg:w-[230px]">
                <div className="mb-1.5 flex items-center justify-between"><CampaignStatus status={c.status} /><span className="text-[13px] font-semibold tabular-nums text-muted">{c.progress}%</span></div>
                <ProgressBar value={c.progress} />
              </div>
              <div className="lg:w-[290px]"><CampaignActions c={c} compact /></div>
            </div>
            <p className="mt-3 flex flex-wrap gap-x-1 gap-y-1 border-t border-line pt-3 text-[14.5px] text-muted">
              {metrics.map(([l, v, warn], i) => (
                <span key={l} className="whitespace-nowrap">
                  <b className={clsx("tabular-nums", warn ? "text-danger" : "text-ink")}>{fmtInt(v)}</b> {l}{i < metrics.length - 1 && <span className="mx-1.5 text-line">|</span>}
                </span>
              ))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
