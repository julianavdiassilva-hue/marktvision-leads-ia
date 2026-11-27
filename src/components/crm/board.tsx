"use client";
import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CalendarClock, KanbanSquare, List, Loader2, MessageSquareText, Plus, Settings2, Trash2, Trophy, XCircle } from "lucide-react";
import { Modal } from "@/components/forms";
import { Badge } from "@/components/ui";
import { createOppAction, deleteStageAction, loseOppAction, moveOppAction, moveStageAction, saveStageAction, searchContactsAction, updateOppAction, winOppAction } from "@/app/actions/crm";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import type { OppCard, Stage } from "@/server/services/crm";

type Opt = { id: string; name: string };

export function CrmBoard({ stages, cards, team, view, isAdmin, isSeller, lostReasons }: {
  stages: Stage[]; cards: OppCard[]; team: Opt[]; view: "kanban" | "lista"; isAdmin: boolean; isSeller: boolean; lostReasons: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [win, setWin] = useState<OppCard | null>(null);
  const [lose, setLose] = useState<OppCard | null>(null);
  const [edit, setEdit] = useState<OppCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [customize, setCustomize] = useState(false);
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(sp.toString()); if (v) p.set(k, v); else p.delete(k); router.push(`/crm?${p}`); };
  const done = (r: { ok: boolean; error?: string; message?: string }) => { setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error! }); if (r.ok) router.refresh(); };
  const drop = (stage: Stage, beforeId: string | null) => {
    const card = cards.find((c) => c.id === drag); setDrag(null); setOver(null);
    if (!card) return;
    if (stage.kind === "won") return setWin(card);
    if (stage.kind === "lost") return setLose(card);
    if (card.stage_id === stage.id && !beforeId) return;
    start(async () => done(await moveOppAction(card.id, stage.id, beforeId)));
  };
  const stageOf = (id: string) => stages.find((s) => s.id === id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <nav className="flex gap-1 rounded-lg bg-surface p-1">
          <button onClick={() => setParam("v", "")} className={clsx("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[14.5px] font-semibold", view === "kanban" ? "bg-white text-brand-dark shadow-sm" : "text-muted")}><KanbanSquare className="h-4 w-4" />Kanban</button>
          <button onClick={() => setParam("v", "lista")} className={clsx("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[14.5px] font-semibold", view === "lista" ? "bg-white text-brand-dark shadow-sm" : "text-muted")}><List className="h-4 w-4" />Lista</button>
        </nav>
        <form onSubmit={(e) => { e.preventDefault(); setParam("q", String(new FormData(e.currentTarget).get("q") ?? "")); }}>
          <input name="q" defaultValue={sp.get("q") ?? ""} className="input w-64 py-2" placeholder="Buscar negociação ou contato" />
        </form>
        {!isSeller && (
          <select className="input w-auto py-2" aria-label="Vendedor" value={sp.get("vendedor") ?? ""} onChange={(e) => setParam("vendedor", e.target.value)}>
            <option value="">Todos os vendedores</option><option value="none">Sem responsável</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {pending && <Loader2 className="h-5 w-5 animate-spin text-brand" />}
        <div className="ml-auto flex gap-2">
          {isAdmin && <button className="btn btn-secondary" onClick={() => setCustomize(true)}><Settings2 className="h-4 w-4" />Personalizar funil</button>}
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus className="h-5 w-5" />Nova negociação</button>
        </div>
      </div>
      {msg && <div role={msg.ok ? "status" : "alert"} className={clsx("mb-3 rounded-lg border px-4 py-2.5 text-[15px] font-medium", msg.ok ? "border-brand/25 bg-brand-light text-brand-dark" : "border-danger/25 bg-danger-light text-danger")}>{msg.text}</div>}

      {view === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4" data-testid="kanban">
          {stages.map((s) => (
            <section key={s.id} data-testid={`etapa-${s.name}`} onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)} onDrop={() => drop(s, null)}
              className={clsx("flex w-[280px] shrink-0 flex-col rounded-xl border bg-surface", over === s.id ? "border-brand ring-2 ring-brand/20" : "border-line")}>
              <header className="border-b border-line px-3 py-2.5" style={{ borderTop: `3px solid ${s.color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                <p className="flex items-center justify-between text-[15px] font-bold">{s.name}<span className="rounded-full bg-white px-2 text-[13px] text-muted ring-1 ring-line">{s.count}</span></p>
                <p className="text-[13px] text-muted">{fmtMoney(s.total)}</p>
              </header>
              <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
                {cards.filter((c) => c.stage_id === s.id).map((c) => (
                  <article key={c.id} draggable onDragStart={() => setDrag(c.id)} onDragEnd={() => setDrag(null)} onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.stopPropagation(); drop(s, c.id); }} onClick={() => setEdit(c)}
                    className={clsx("cursor-grab rounded-lg border border-line bg-white p-3 shadow-sm transition hover:border-brand/50 active:cursor-grabbing", drag === c.id && "opacity-50")}
                    data-testid={`card-${c.contact_name ?? c.id}`}>
                    <p className="text-[15px] font-semibold leading-snug">{c.contact_name || c.organization || formatPhone(c.phone_e164)}</p>
                    {c.title && <p className="text-[13.5px] text-muted">{c.title}</p>}
                    <p className="mt-1.5 text-[15px] font-bold text-brand-dark">{c.value ? fmtMoney(c.value) : <span className="font-normal text-muted">Sem valor</span>}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
                      {!isSeller && <span>{c.owner_name ?? "Sem responsável"}</span>}
                      {c.campaign_name && <span>· {c.campaign_name}</span>}
                      {c.next_follow_up_at && <span className={clsx("inline-flex items-center gap-1", new Date(c.next_follow_up_at) < new Date() && c.status === "open" && "font-semibold text-danger")}><CalendarClock className="h-3.5 w-3.5" />{fmtDateTime(c.next_follow_up_at)}</span>}
                      {c.lost_reason && <span className="text-danger">· {c.lost_reason}</span>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table min-w-[900px]">
            <thead><tr><th>Contato</th><th>Etapa</th><th className="text-right">Valor</th>{!isSeller && <th>Vendedor</th>}<th>Campanha</th><th>Próximo retorno</th><th>Atualizado</th></tr></thead>
            <tbody>{cards.map((c) => (
              <tr key={c.id} className="cursor-pointer" onClick={() => setEdit(c)}>
                <td><p className="font-semibold">{c.contact_name || c.organization}</p><p className="text-[13px] text-muted">{c.title ?? formatPhone(c.phone_e164)}</p></td>
                <td><Badge tone={c.status === "won" ? "green" : c.status === "lost" ? "red" : "gray"}>{stageOf(c.stage_id)?.name}</Badge></td>
                <td className="text-right font-semibold tabular-nums">{c.value ? fmtMoney(c.value) : "—"}</td>
                {!isSeller && <td>{c.owner_name ?? "—"}</td>}
                <td className="text-[14px]">{c.campaign_name ?? "—"}</td>
                <td className="text-[14px]">{fmtDateTime(c.next_follow_up_at)}</td>
                <td className="text-[14px] text-muted">{fmtDateTime(c.updated_at)}</td>
              </tr>))}
            </tbody>
          </table>
          {cards.length === 0 && <p className="p-8 text-center text-muted">Nenhuma negociação.</p>}
        </div>
      )}

      <WinModal card={win} onClose={() => setWin(null)} onDone={(r) => { setWin(null); done(r); }} />
      <LoseModal card={lose} reasons={lostReasons} onClose={() => setLose(null)} onDone={(r) => { setLose(null); done(r); }} />
      <EditModal card={edit} team={team} isAdmin={isAdmin} stages={stages} onClose={() => setEdit(null)} onWin={(c) => { setEdit(null); setWin(c); }} onLose={(c) => { setEdit(null); setLose(c); }} onDone={(r) => { setEdit(null); done(r); }}
        onMove={(c, stageId) => { setEdit(null); const st = stages.find((x) => x.id === stageId)!; if (st.kind === "won") setWin(c); else if (st.kind === "lost") setLose(c); else start(async () => done(await moveOppAction(c.id, stageId))); }} />
      <CreateModal open={creating} team={team} isAdmin={isAdmin} onClose={() => setCreating(false)} onDone={(r) => { setCreating(false); done(r); }} />
      <CustomizeModal open={customize} stages={stages} onClose={() => setCustomize(false)} />
    </div>
  );
}

type R = { ok: boolean; error?: string; message?: string };

function WinModal({ card, onClose, onDone }: { card: OppCard | null; onClose: () => void; onDone: (r: R) => void }) {
  const [amount, setAmount] = useState(""); const [notes, setNotes] = useState(""); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  return (
    <Modal open={!!card} onClose={onClose} title="Registrar venda" description={card ? `${card.contact_name ?? ""} — a venda atualiza dashboard, vendedor e campanha de origem.` : ""}>
      <label className="label" htmlFor="win-amount">Valor da venda (R$)</label>
      <input id="win-amount" className="input text-[17px]" inputMode="decimal" placeholder={card?.value ? String(card.value).replace(".", ",") : "0,00"} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      <label className="label mt-3" htmlFor="win-notes">Observações <span className="font-normal text-muted">(opcional)</span></label>
      <textarea id="win-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {err && <p role="alert" className="mt-2 text-[14px] font-medium text-danger">{err}</p>}
      <div className="mt-5 flex justify-end gap-2"><button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await winOppAction(card!.id, amount || String(card!.value ?? ""), notes); if (!r.ok) setErr(r.error); else { setAmount(""); setNotes(""); onDone(r); } })}>
          <Trophy className="h-4 w-4" />Registrar venda</button></div>
    </Modal>
  );
}

function LoseModal({ card, reasons, onClose, onDone }: { card: OppCard | null; reasons: string[]; onClose: () => void; onDone: (r: R) => void }) {
  const [reason, setReason] = useState(""); const [other, setOther] = useState(""); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  return (
    <Modal open={!!card} onClose={onClose} title="Negociação perdida" description="O motivo alimenta os relatórios de perda.">
      <div className="grid gap-2 sm:grid-cols-2">{reasons.map((r) => (
        <label key={r} className={clsx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[15px]", reason === r ? "border-brand bg-brand-50" : "border-line")}>
          <input type="radio" className="accent-[#008C48]" checked={reason === r} onChange={() => setReason(r)} />{r}</label>))}</div>
      {reason === "Outro" && <input className="input mt-3" placeholder="Descreva o motivo" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Outro motivo" />}
      {err && <p role="alert" className="mt-2 text-[14px] font-medium text-danger">{err}</p>}
      <div className="mt-5 flex justify-end gap-2"><button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-danger" disabled={pending} onClick={() => start(async () => { const r = await loseOppAction(card!.id, reason === "Outro" ? other : reason); if (!r.ok) setErr(r.error); else onDone(r); })}>
          <XCircle className="h-4 w-4" />Marcar como perdida</button></div>
    </Modal>
  );
}

function EditModal({ card, team, isAdmin, stages, onClose, onWin, onLose, onDone, onMove }: { card: OppCard | null; team: Opt[]; isAdmin: boolean; stages: Stage[];
  onClose: () => void; onWin: (c: OppCard) => void; onLose: (c: OppCard) => void; onDone: (r: R) => void; onMove: (c: OppCard, stageId: string) => void }) {
  const [f, setF] = useState<Record<string, string>>({}); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  const v = (k: keyof OppCard) => f[k] ?? (card?.[k] == null ? "" : k === "next_follow_up_at" ? new Date(String(card[k])).toISOString().slice(0, 16) : k === "value" ? String(card[k]).replace(".", ",") : String(card[k]));
  return (
    <Modal open={!!card} onClose={() => { setF({}); onClose(); }} wide title={card?.contact_name || "Negociação"} description={card ? `${stages.find((s) => s.id === card.stage_id)?.name} · ${card.campaign_name ? `campanha ${card.campaign_name}` : "sem campanha de origem"}` : ""}>
      {card && <>
        <div className="mb-4">
          <label className="label" htmlFor="e-stage">Mover para etapa</label>
          <select id="e-stage" className="input" value={card.stage_id} onChange={(e) => onMove(card, e.target.value)}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href={`/contatos/${card.contact_id}`} className="btn btn-secondary btn-sm">Ficha do contato</Link>
          {card.conversation_id && <Link href={`/conversas?c=${card.conversation_id}`} className="btn btn-secondary btn-sm"><MessageSquareText className="h-4 w-4" />Abrir conversa</Link>}
          {card.status !== "won" && <button className="btn btn-primary btn-sm" onClick={() => onWin(card)}><Trophy className="h-4 w-4" />Registrar venda</button>}
          {card.status !== "lost" && <button className="btn btn-danger btn-sm" onClick={() => onLose(card)}>Marcar como perdida</button>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="e-title">Título</label><input id="e-title" className="input" value={v("title")} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><label className="label" htmlFor="e-value">Valor da negociação (R$)</label><input id="e-value" className="input" inputMode="decimal" value={v("value")} onChange={(e) => setF({ ...f, value: e.target.value })} /></div>
          {isAdmin && <div><label className="label" htmlFor="e-owner">Vendedor responsável</label>
            <select id="e-owner" className="input" value={f.owner_user_id ?? card.owner_user_id ?? ""} onChange={(e) => setF({ ...f, owner_user_id: e.target.value })}>
              <option value="">Sem responsável</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
          <div><label className="label" htmlFor="e-follow">Próximo retorno</label><input id="e-follow" type="datetime-local" className="input" value={v("next_follow_up_at")} onChange={(e) => setF({ ...f, next_follow_up_at: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="e-notes">Observações</label><textarea id="e-notes" className="input" rows={3} value={v("notes")} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>
        {err && <p role="alert" className="mt-2 text-[14px] font-medium text-danger">{err}</p>}
        <div className="mt-5 flex justify-end gap-2"><button className="btn btn-secondary" onClick={() => { setF({}); onClose(); }}>Fechar</button>
          <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
            const r = await updateOppAction(card.id, { title: v("title"), value: v("value"), notes: v("notes"), nextFollowUpAt: v("next_follow_up_at") ? new Date(v("next_follow_up_at")).toISOString() : "",
              ...(isAdmin ? { ownerUserId: (f.owner_user_id ?? card.owner_user_id ?? "") || null } : {}) });
            if (!r.ok) setErr(r.error); else { setF({}); onDone(r); } })}>Salvar</button></div>
      </>}
    </Modal>
  );
}

function CreateModal({ open, team, isAdmin, onClose, onDone }: { open: boolean; team: Opt[]; isAdmin: boolean; onClose: () => void; onDone: (r: R) => void }) {
  const [q, setQ] = useState(""); const [results, setResults] = useState<{ id: string; name: string | null; organization: string | null; phone_e164: string | null }[]>([]);
  const [contact, setContact] = useState<{ id: string; name: string | null } | null>(null);
  const [f, setF] = useState({ title: "", value: "", ownerUserId: "" }); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  return (
    <Modal open={open} onClose={onClose} title="Nova negociação" description="Escolha o contato da base central.">
      {!contact ? (<>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await searchContactsAction(q); setResults(r.ok ? (r.data as typeof results) : []); }); }}>
          <input className="input" autoFocus aria-label="Buscar contato" placeholder="Nome, empresa ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-secondary">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}</button>
        </form>
        <ul className="mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {results.map((c) => <li key={c.id}><button className="w-full px-3 py-2 text-left hover:bg-brand-50" onClick={() => setContact(c)}><b>{c.name || c.organization}</b> <span className="text-muted">{formatPhone(c.phone_e164)}</span></button></li>)}
          {results.length === 0 && <li className="px-3 py-3 text-[14px] text-muted">Busque um contato. Para um contato novo, cadastre em Contatos e listas.</li>}
        </ul>
      </>) : (<>
        <p className="mb-3 text-[15px]">Contato: <b>{contact.name}</b> <button className="text-brand-dark underline" onClick={() => setContact(null)}>trocar</button></p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="n-title">Título</label><input id="n-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><label className="label" htmlFor="n-value">Valor (R$)</label><input id="n-value" className="input" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></div>
          {isAdmin && <div className="sm:col-span-2"><label className="label" htmlFor="n-owner">Vendedor</label><select id="n-owner" className="input" value={f.ownerUserId} onChange={(e) => setF({ ...f, ownerUserId: e.target.value })}>
            <option value="">Responsável atual do contato</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
        </div>
        {err && <p role="alert" className="mt-2 text-[14px] font-medium text-danger">{err}</p>}
        <div className="mt-5 flex justify-end gap-2"><button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await createOppAction({ contactId: contact.id, ...f }); if (!r.ok) setErr(r.error); else { setContact(null); setF({ title: "", value: "", ownerUserId: "" }); onDone(r); } })}>Criar negociação</button></div>
      </>)}
    </Modal>
  );
}

function CustomizeModal({ open, stages, onClose }: { open: boolean; stages: Stage[]; onClose: () => void }) {
  const router = useRouter(); const [name, setName] = useState(""); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  const run = (fn: () => Promise<R>) => start(async () => { const r = await fn(); if (!r.ok) setErr(r.error!); else { setErr(null); router.refresh(); } });
  return (
    <Modal open={open} onClose={onClose} title="Personalizar funil" description="Etapas de venda e de perda são fixas; as demais podem ser criadas, renomeadas, reordenadas e excluídas.">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {stages.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-3 py-2">
            <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
            <input className="input flex-1 py-1.5" defaultValue={s.name} aria-label={`Nome da etapa ${s.name}`} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && run(() => saveStageAction(e.target.value, s.color, s.id))} />
            {s.kind === "open" ? <>
              <button aria-label="Subir" className="p-1 text-muted hover:text-ink" onClick={() => run(() => moveStageAction(s.id, -1))}><ArrowUp className="h-4 w-4" /></button>
              <button aria-label="Descer" className="p-1 text-muted hover:text-ink" onClick={() => run(() => moveStageAction(s.id, 1))}><ArrowDown className="h-4 w-4" /></button>
              <button aria-label={`Excluir ${s.name}`} className="p-1 text-muted hover:text-danger" onClick={() => run(() => deleteStageAction(s.id))}><Trash2 className="h-4 w-4" /></button>
            </> : <Badge tone={s.kind === "won" ? "green" : "red"}>{s.kind === "won" ? "Venda" : "Perda"}</Badge>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2"><input className="input" placeholder="Nova etapa (ex.: Visita técnica)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nova etapa" />
        <button className="btn btn-primary" disabled={pending || !name.trim()} onClick={() => { run(() => saveStageAction(name, "#008C48")); setName(""); }}>Adicionar</button></div>
      {err && <p role="alert" className="mt-2 text-[14px] font-medium text-danger">{err}</p>}
    </Modal>
  );
}
