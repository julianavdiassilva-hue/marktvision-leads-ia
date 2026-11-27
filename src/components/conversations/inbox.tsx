"use client";
import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Bot, Check, CheckCheck, Clock, Loader2, MessageSquareText, Paperclip, Search, Send, Smartphone, Sparkles, UserCheck, X, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui";
import { TagChip } from "@/components/contacts/contacts-manager";
import {
  aiToggleAction, assumeAction, followUpAction, notesAction, opportunityAction, sendFileAction, sendMessageAction, statusAction, suggestAction, transferAction,
} from "@/app/actions/conversations";
import { bulkContactsAction } from "@/app/actions/contacts";
import { formatPhone } from "@/lib/phone";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { EVENT_LABEL, STATUS_LABEL } from "@/lib/labels";
import type { ConversationRow, MessageRow } from "@/server/services/conversations";

type Opt = { id: string; name: string };
type Detail = {
  conv: ConversationRow & { origin_campaign_id: string | null; campaign_name: string | null; campaign_number: number | null; next_follow_up_at: string | null;
    notes: string | null; email: string | null; city: string | null; commercial_status: string; consent_status: string; window_open: boolean };
  messages: MessageRow[]; opportunity: { id: string; stage: string; value: string | null; status: string } | null;
  events: { id: number; type: string; created_at: string; actor: string | null; data: Record<string, unknown> }[];
};
export type InboxPerms = { isAdmin: boolean; isSeller: boolean; canAi: boolean; canAiMessages: boolean; canCrm: boolean; canTags: boolean };

const FILTERS: [string, string][] = [["mine", "Minhas"], ["all", "Todas"], ["unassigned", "Sem responsável"], ["unread", "Não lidas"], ["closed", "Encerradas"]];

const initials = (n: string | null) => (n ?? "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const timeShort = (d: string | null) => {
  if (!d) return "";
  const dt = new Date(d); const today = new Date();
  return dt.toDateString() === today.toDateString()
    ? dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Belem" })
    : dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Belem" });
};

export function Inbox({ list, detail, filter, team, tags, quickReplies, perms }: {
  list: ConversationRow[]; detail: Detail | null; filter: string; team: Opt[]; tags: (Opt & { color: string })[];
  quickReplies: { id: string; shortcut: string; body: string }[]; perms: InboxPerms;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const selected = detail?.conv.id ?? null;
  const go = (params: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) { if (v) p.set(k, v); else p.delete(k); }
    router.push(`/conversas?${p.toString()}`);
  };
  const filters = perms.isSeller ? FILTERS.filter(([k]) => k !== "all" && k !== "unassigned") : FILTERS;

  return (
    <div className="-mx-4 -my-8 flex h-[calc(100vh-4rem)] border-line bg-white sm:-mx-8 lg:mx-0 lg:my-0 lg:h-[calc(100vh-8rem)] lg:rounded-xl lg:border">
      {/* Coluna 1 — lista */}
      <aside className={clsx("flex w-full flex-col border-r border-line md:w-[340px] md:shrink-0", selected && "hidden md:flex")}>
        <div className="border-b border-line p-3">
          <form onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") ?? "") || null, c: null }); }} className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={sp.get("q") ?? ""} className="input py-2 pl-9" placeholder="Buscar conversa" aria-label="Buscar conversa" />
          </form>
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {filters.map(([k, l]) => (
              <button key={k} onClick={() => go({ f: k, c: null })} className={clsx("whitespace-nowrap rounded-full px-3 py-1 text-[13.5px] font-semibold", filter === k ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink")}>{l}</button>
            ))}
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list.length === 0 && <li className="p-6 text-center text-[15px] text-muted">Nenhuma conversa aqui. As mensagens recebidas no WhatsApp conectado aparecem automaticamente.</li>}
          {list.map((c) => (
            <li key={c.id}>
              <button onClick={() => go({ c: c.id })} className={clsx("flex w-full gap-3 border-b border-line/70 px-3 py-3 text-left transition hover:bg-brand-50", selected === c.id && "bg-brand-light")}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-light text-[14px] font-bold text-brand-dark">{initials(c.contact_name ?? c.organization)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15.5px] font-semibold">{c.contact_name || c.organization || formatPhone(c.phone_e164)}</span>
                    <span className={clsx("shrink-0 text-[12px]", c.unread_count ? "font-bold text-brand" : "text-muted")}>{timeShort(c.last_message_at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] text-muted">{c.ai_enabled && <Bot className="mr-1 inline h-3.5 w-3.5 text-brand" />}{c.last_message_preview ?? "—"}</span>
                    {c.unread_count > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-[12px] font-bold text-white">{c.unread_count}</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    {c.tags.slice(0, 2).map((t) => <TagChip key={t.id} name={t.name} color={t.color} />)}
                    {!perms.isSeller && <span className="text-[12px] text-muted">{c.assigned_name ?? "Sem responsável"}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Coluna 2 — conversa */}
      {detail ? <Chat key={detail.conv.id} d={detail} quickReplies={quickReplies} perms={perms} onBack={() => go({ c: null })} /> : (
        <section className="hidden flex-1 flex-col items-center justify-center bg-surface text-center md:flex">
          <MessageSquareText className="h-14 w-14 text-brand/40" />
          <p className="mt-3 text-[18px] font-semibold">Selecione uma conversa</p>
          <p className="mt-1 max-w-sm text-[15px] text-muted">Respostas de campanhas e novas mensagens chegam aqui automaticamente.</p>
        </section>
      )}

      {/* Coluna 3 — contato e CRM */}
      {detail && <SidePanel key={`p-${detail.conv.id}`} d={detail} team={team} tags={tags} perms={perms} />}
    </div>
  );
}

function StatusIcon({ m }: { m: MessageRow }) {
  if (m.direction !== "outbound") return null;
  if (m.status === "failed") return <AlertCircle className="h-4 w-4 text-danger" aria-label="Falhou" />;
  if (m.status === "read") return <CheckCheck className="h-4 w-4 text-sky-500" aria-label="Lida" />;
  if (m.status === "delivered") return <CheckCheck className="h-4 w-4 text-muted" aria-label="Entregue" />;
  if (m.status === "sent") return <Check className="h-4 w-4 text-muted" aria-label="Enviada" />;
  return <Clock className="h-3.5 w-3.5 text-muted" aria-label="Enviando" />;
}
const senderLabel = (m: MessageRow) => m.sender_type === "ai" ? "IA" : m.sender_type === "campaign" ? "Campanha" : m.sender_type === "system" ? "Sistema"
  : m.channel === "business_app" ? "Celular" : m.channel === "history" ? "Histórico" : m.sender_name ?? "Equipe";

function Chat({ d, quickReplies, perms, onBack }: { d: Detail; quickReplies: { shortcut: string; body: string }[]; perms: InboxPerms; onBack: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const c = d.conv;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [d.messages.length]);
  const qr = text.startsWith("/") ? quickReplies.filter((q) => q.shortcut.startsWith(text.slice(1).toLowerCase())) : [];
  const send = () => {
    const body = text.trim(); if (!body) return;
    setErr(null);
    start(async () => { const r = await sendMessageAction(c.id, body); if (!r.ok) setErr(r.error); else { setText(""); router.refresh(); } });
  };
  const onFile = (f?: File) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return setErr("Arquivo maior que 15 MB.");
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] ?? "";
      setErr(null);
      start(async () => { const r = await sendFileAction(c.id, { name: f.name, type: f.type, base64, caption: text.trim() || undefined }); if (!r.ok) setErr(r.error); else { setText(""); router.refresh(); } });
    };
    reader.readAsDataURL(f);
  };
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button className="md:hidden" onClick={onBack} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-light text-[14px] font-bold text-brand-dark">{initials(c.contact_name ?? c.organization)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold">{c.contact_name || c.organization || formatPhone(c.phone_e164)}</p>
          <p className="truncate text-[13px] text-muted">{formatPhone(c.phone_e164)} · {c.connection_name ?? "sem número"}{c.ai_enabled ? " · IA atendendo" : c.assigned_name ? ` · ${c.assigned_name}` : ""}</p>
        </div>
        {c.ai_enabled && <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await assumeAction(c.id); if (!r.ok) setErr(r.error); router.refresh(); })}><UserCheck className="h-4 w-4" />Assumir atendimento</button>}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto bg-[#F4F1EC] px-4 py-4" data-testid="chat-messages">
        {d.messages.length === 0 && <p className="text-center text-[14px] text-muted">Sem mensagens.</p>}
        {d.messages.map((m) => (
          <div key={m.id} className={clsx("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
            <div className={clsx("max-w-[78%] rounded-xl px-3.5 py-2 text-[15px] leading-relaxed shadow-sm", m.direction === "outbound" ? "rounded-tr-sm bg-[#D9FDD3]" : "rounded-tl-sm bg-white")}>
              {m.direction === "outbound" && <p className="mb-0.5 flex items-center gap-1 text-[12px] font-semibold text-brand-dark">{m.channel === "business_app" && <Smartphone className="h-3 w-3" />}{m.sender_type === "ai" && <Bot className="h-3 w-3" />}{senderLabel(m)}{m.template_name && ` · modelo ${m.template_name}`}</p>}
              {m.media_type && <p className="mb-1 inline-flex items-center gap-1 rounded bg-black/5 px-2 py-0.5 text-[13px] font-semibold"><Paperclip className="h-3.5 w-3.5" />{({ image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento", sticker: "Figurinha", location: "Localização" } as Record<string, string>)[m.media_type] ?? m.media_type}</p>}
              {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
              <p className="mt-0.5 flex items-center justify-end gap-1 text-[11.5px] text-muted">{fmtDateTime(m.created_at)}<StatusIcon m={m} /></p>
              {m.status === "failed" && m.error && <p className="mt-1 text-[12.5px] font-medium text-danger">{m.error}</p>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <footer className="border-t border-line p-3">
        {err && <p role="alert" className="mb-2 flex items-start justify-between gap-2 rounded-lg bg-danger-light px-3 py-2 text-[14px] font-medium text-danger">{err}<button onClick={() => setErr(null)} aria-label="Fechar"><X className="h-4 w-4" /></button></p>}
        {c.provider === "meta_cloud" && !c.window_open && <p className="mb-2 text-[13px] text-warning">Fora da janela de 24h da Meta: aguarde o cliente responder para enviar mensagens livres.</p>}
        {c.consent_status === "opted_out" && <p className="mb-2 text-[13px] text-warning">Este contato pediu para não receber mensagens. Responda apenas se ele falar com você.</p>}
        {qr.length > 0 && (
          <ul className="mb-2 max-h-40 overflow-y-auto rounded-lg border border-line">
            {qr.map((q) => <li key={q.shortcut}><button className="w-full px-3 py-2 text-left text-[14px] hover:bg-brand-50" onClick={() => setText(q.body)}><b>/{q.shortcut}</b> <span className="text-muted">{q.body.slice(0, 80)}</span></button></li>)}
          </ul>
        )}
        <div className="flex items-end gap-2">
          {c.provider === "evolution" && <>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <button className="rounded-lg p-2.5 text-muted hover:bg-surface hover:text-brand" title="Enviar arquivo ou imagem" aria-label="Enviar arquivo" disabled={pending} onClick={() => fileRef.current?.click()}><Paperclip className="h-5 w-5" /></button>
          </>}
          {perms.canAiMessages && <button className="rounded-lg p-2.5 text-muted hover:bg-surface hover:text-brand" title="Sugerir resposta com IA" aria-label="Sugerir resposta com IA" disabled={pending}
            onClick={() => start(async () => { const r = await suggestAction(c.id); if (!r.ok) setErr(r.error); else setText(String(r.data)); })}><Sparkles className="h-5 w-5" /></button>}
          <textarea aria-label="Mensagem" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem — digite / para respostas rápidas" title="Enter envia · Shift+Enter quebra linha"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            className="input max-h-36 min-h-[44px] flex-1 resize-none py-2.5" />
          <button className="btn btn-primary h-11 w-11 p-0" onClick={send} disabled={pending || !text.trim()} aria-label="Enviar">{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button>
        </div>
      </footer>
    </section>
  );
}

function SidePanel({ d, team, tags, perms }: { d: Detail; team: Opt[]; tags: (Opt & { color: string })[]; perms: InboxPerms }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [notes, setNotes] = useState(d.conv.notes ?? "");
  const [follow, setFollow] = useState(d.conv.next_follow_up_at ? new Date(d.conv.next_follow_up_at).toISOString().slice(0, 16) : "");
  const c = d.conv;
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => {
    const r = await fn(); setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error! }); if (r.ok) router.refresh();
  });
  const free = tags.filter((t) => !c.tags.some((x) => x.id === t.id));
  return (
    <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-line bg-surface/60 xl:block">
      <div className="space-y-4 p-4 text-[14.5px]">
        <div>
          <p className="text-[17px] font-bold">{c.contact_name || c.organization || formatPhone(c.phone_e164)}</p>
          <p className="text-muted">{formatPhone(c.phone_e164)}{c.email ? ` · ${c.email}` : ""}{c.city ? ` · ${c.city}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="green">{STATUS_LABEL[c.commercial_status]}</Badge>{c.consent_status === "opted_out" && <Badge tone="red">Descadastrado</Badge>}</div>
          <Link href={`/contatos/${c.contact_id}`} className="mt-2 inline-block font-semibold text-brand-dark hover:underline">Abrir ficha do contato</Link>
        </div>
        {msg && <p role={msg.ok ? "status" : "alert"} className={clsx("rounded-lg px-3 py-2 font-medium", msg.ok ? "bg-brand-light text-brand-dark" : "bg-danger-light text-danger")}>{msg.text}</p>}
        <Block title="Campanha de origem">{c.campaign_name ? `#${c.campaign_number} ${c.campaign_name}` : <span className="text-muted">Contato espontâneo</span>}</Block>
        <Block title="Vendedor responsável">
          {(perms.isAdmin || c.assigned_user_id) ? (
            <select className="input py-2" aria-label="Transferir conversa" value={c.assigned_user_id ?? ""} disabled={pending}
              onChange={(e) => run(() => transferAction(c.id, e.target.value || null))}>
              {perms.isAdmin && <option value="">Sem responsável</option>}
              {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : <span className="text-muted">Sem responsável</span>}
        </Block>
        {perms.canAi && (
          <Block title="Chatbot IA nesta conversa">
            <label className="flex items-center justify-between gap-2">
              <span className="text-muted">{c.ai_enabled ? "IA respondendo automaticamente" : "Atendimento humano"}</span>
              <button role="switch" aria-checked={c.ai_enabled} aria-label="IA nesta conversa" disabled={pending} onClick={() => run(() => aiToggleAction(c.id, !c.ai_enabled))}
                className={clsx("relative inline-flex h-7 w-12 items-center rounded-full transition", c.ai_enabled ? "bg-brand" : "bg-slate-300")}>
                <span className={clsx("inline-block h-5 w-5 rounded-full bg-white shadow transition", c.ai_enabled ? "translate-x-6" : "translate-x-1")} />
              </button>
            </label>
          </Block>
        )}
        {perms.canTags && (
          <Block title="Etiquetas">
            <div className="flex flex-wrap gap-1.5">
              {c.tags.length === 0 && <span className="text-muted">Nenhuma</span>}
              {c.tags.map((t) => <span key={t.id} className="inline-flex items-center gap-1"><TagChip name={t.name} color={t.color} /><button aria-label={`Remover ${t.name}`} onClick={() => run(() => bulkContactsAction({ ids: [c.contact_id] }, "untag", t.id))}><X className="h-3.5 w-3.5 text-muted" /></button></span>)}
            </div>
            {free.length > 0 && <select className="input mt-2 py-1.5" aria-label="Adicionar etiqueta" value="" onChange={(e) => e.target.value && run(() => bulkContactsAction({ ids: [c.contact_id] }, "tag", e.target.value))}>
              <option value="">Adicionar etiqueta…</option>{free.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
          </Block>
        )}
        {perms.canCrm && (
          <Block title="Etapa no CRM">
            {d.opportunity ? <p><b>{d.opportunity.stage}</b>{d.opportunity.value ? ` · ${fmtMoney(d.opportunity.value)}` : ""} <Link href="/crm" className="ml-1 text-brand-dark hover:underline">Abrir CRM</Link></p>
              : <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => opportunityAction(c.id))}>Criar negociação</button>}
          </Block>
        )}
        <Block title="Próximo retorno">
          <div className="flex flex-col gap-2">
            <input type="datetime-local" className="input py-1.5" aria-label="Próximo retorno" value={follow} onChange={(e) => setFollow(e.target.value)} />
            <button className="btn btn-secondary btn-sm self-start" disabled={pending} onClick={() => run(() => followUpAction(c.id, follow ? new Date(follow).toISOString() : null))}>Salvar retorno</button>
          </div>
        </Block>
        <Block title="Observações">
          <textarea className="input" rows={3} aria-label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="btn btn-secondary btn-sm mt-2" disabled={pending} onClick={() => run(() => notesAction(c.id, notes))}>Salvar observações</button>
        </Block>
        <Block title="Histórico comercial">
          <ol className="space-y-1.5">{d.events.slice(0, 8).map((e) => <li key={e.id}><span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span><span className="block text-[12.5px] text-muted">{fmtDateTime(e.created_at)}{e.actor ? ` · ${e.actor}` : ""}</span></li>)}</ol>
        </Block>
        <button className="btn btn-secondary w-full" disabled={pending} onClick={() => run(() => statusAction(c.id, c.status === "closed" ? "open" : "closed"))}>{c.status === "closed" ? "Reabrir conversa" : "Encerrar conversa"}</button>
      </div>
    </aside>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[12.5px] font-bold uppercase tracking-wide text-muted">{title}</p>{children}</div>;
}
