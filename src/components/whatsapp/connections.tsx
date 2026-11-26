"use client";
import clsx from "clsx";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { disconnectAction, manualConnectAction, setMembersAction, setRateAction, syncTemplatesAction, testConnectionAction } from "@/app/actions/whatsapp";
import { fmtDateTime, fmtInt } from "@/lib/format";
import type { ConnectionRow } from "@/server/services/whatsapp";
import type { ActionResult } from "@/server/action";

const STATUS: Record<string, [string, "green" | "red" | "amber" | "gray"]> = {
  connected: ["Conectado", "green"], disconnected: ["Desconectado", "gray"], error: ["Com erro", "red"], pending: ["Pendente", "amber"],
};
const MODE: Record<string, string> = { coexistence: "WhatsApp Business + API (coexistência)", cloud_api: "Somente API", manual: "Conexão manual" };

export function ConnectionsList({ rows, team, members, canManage }: {
  rows: ConnectionRow[]; team: { id: string; name: string }[]; members: { connection_id: string; user_id: string }[]; canManage: boolean;
}) {
  return <div className="space-y-4">{rows.map((c) => <ConnectionCard key={c.id} c={c} team={team} memberIds={members.filter((m) => m.connection_id === c.id).map((m) => m.user_id)} canManage={canManage} />)}</div>;
}

function ConnectionCard({ c, team, memberIds, canManage }: { c: ConnectionRow; team: { id: string; name: string }[]; memberIds: string[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sel, setSel] = useState(new Set(memberIds));
  const [rate, setRate] = useState(String(c.settings?.per_minute ?? 20));
  const run = (fn: () => Promise<ActionResult>, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setMsg(null);
    start(async () => { const r = await fn(); setMsg(r.ok ? { ok: true, text: r.message ?? "Concluído." } : { ok: false, text: r.error }); if (r.ok) router.refresh(); });
  };
  const [label, tone] = STATUS[c.status] ?? STATUS.pending;
  const ob = c.onboarding as { sync_deadline?: string; history_shared?: boolean; history_progress?: number; contacts_sync_requested_at?: string };
  return (
    <section className="panel p-5" data-testid={`conexao-${c.id}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5"><h3 className="text-[19px] font-bold">{c.display_name}</h3><Badge tone={tone}>{label}</Badge><Badge tone="gray">{MODE[c.connection_mode] ?? c.connection_mode}</Badge></div>
          <p className="mt-1 text-[16px] font-semibold tabular-nums">{c.phone_number ?? "Número não informado"}</p>
          <p className="mt-1 text-[14px] text-muted">
            Conectado em {fmtDateTime(c.connected_at)} · última sincronização {fmtDateTime(c.last_sync_at)}
            {c.quality_rating && ` · qualidade ${c.quality_rating}`} · {fmtInt(c.templates)} modelo(s) · {fmtInt(c.messages_month)} mensagem(ns) enviadas no mês
          </p>
          {c.connection_mode === "coexistence" && (
            <p className="mt-1 text-[14px] text-muted">Sincronização do app: contatos {ob.contacts_sync_requested_at ? "solicitados" : "aguardando"} · histórico {ob.history_shared === false ? "não compartilhado pelo cliente" : ob.history_progress != null ? `${ob.history_progress}%` : "aguardando"}</p>
          )}
          {c.last_error && <p className="mt-2 rounded-lg bg-danger-light px-3 py-2 text-[14px] font-medium text-danger">{c.last_error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {pending && <Loader2 className="h-5 w-5 animate-spin self-center text-brand" />}
          {c.status !== "disconnected" && <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => testConnectionAction(c.id))}>Testar conexão</button>}
          {c.status !== "disconnected" && <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => syncTemplatesAction(c.id))}>Sincronizar modelos</button>}
          {canManage && c.status !== "disconnected" && <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => run(() => disconnectAction(c.id), "Desconectar este número? Campanhas não poderão usá-lo até reconectar.")}>Desconectar</button>}
          {canManage && c.status === "disconnected" && <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => run(() => disconnectAction(c.id, true), "Excluir esta conexão? O histórico de conversas e mensagens é mantido.")}>Excluir</button>}
        </div>
      </div>
      {c.status === "disconnected" && <p className="mt-3 text-[14px] text-muted">Para reconectar, use “Conectar WhatsApp” acima com o mesmo número: a conexão é retomada com o histórico preservado.</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={clsx("mt-3 text-[14.5px] font-medium", msg.ok ? "text-brand-dark" : "text-danger")}>{msg.text}</p>}
      {canManage && (
        <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-[1fr_260px]">
          <div>
            <p className="label">Vendedores responsáveis por este número</p>
            <p className="mb-2 text-[13px] text-muted">Novas conversas de contatos sem responsável são distribuídas entre eles (quem tiver menos conversas abertas recebe).</p>
            <div className="flex flex-wrap gap-2">
              {team.map((t) => (
                <label key={t.id} className={clsx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[14.5px]", sel.has(t.id) ? "border-brand bg-brand-50 font-semibold" : "border-line")}>
                  <input type="checkbox" className="h-4 w-4 accent-[#008C48]" checked={sel.has(t.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(t.id); else s.delete(t.id); setSel(s); }} />{t.name}
                </label>
              ))}
            </div>
            <button className="btn btn-secondary btn-sm mt-2" disabled={pending} onClick={() => run(() => setMembersAction(c.id, [...sel]))}>Salvar vendedores</button>
          </div>
          <div>
            <label className="label" htmlFor={`rate-${c.id}`}>Ritmo de envio das campanhas</label>
            <div className="flex gap-2"><input id={`rate-${c.id}`} className="input" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} /><span className="self-center text-[14px] text-muted">/min</span></div>
            <button className="btn btn-secondary btn-sm mt-2" disabled={pending} onClick={() => run(() => setRateAction(c.id, Number(rate)))}>Salvar ritmo</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Alternativa avançada: credenciais geradas manualmente no painel da Meta (ex.: testes, parceiros). */
export function ManualConnect() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ displayName: "", phoneNumberId: "", businessAccountId: "", accessToken: "", perMinute: "20" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="mt-6">
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-ink">
        <ChevronDown className={clsx("h-4 w-4 transition", open && "rotate-180")} />Conexão manual (avançado)
      </button>
      {open && (
        <form className="panel mt-3 grid gap-3 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setMsg(null); start(async () => { const r = await manualConnectAction(f); setMsg(r.ok ? { ok: true, text: r.message! } : { ok: false, text: r.error }); if (r.ok) router.refresh(); }); }}>
          <p className="text-[14px] text-muted sm:col-span-2">Use somente se já tiver um número configurado na Meta com token permanente. O caminho recomendado é o botão “Conectar WhatsApp”.</p>
          {([["displayName", "Nome da conexão"], ["phoneNumberId", "ID do número (Phone number ID)"], ["businessAccountId", "ID da conta (WABA)"], ["accessToken", "Token de acesso permanente"]] as const).map(([k, l]) => (
            <div key={k}><label className="label" htmlFor={`mc-${k}`}>{l}</label><input id={`mc-${k}`} className="input" type={k === "accessToken" ? "password" : "text"} autoComplete="off" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
          ))}
          <div className="flex items-end sm:col-span-2"><button className="btn btn-primary" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Validar na Meta e conectar</button></div>
          {msg && <p role={msg.ok ? "status" : "alert"} className={clsx("text-[14.5px] font-medium sm:col-span-2", msg.ok ? "text-brand-dark" : "text-danger")}>{msg.text}</p>}
        </form>
      )}
    </div>
  );
}
