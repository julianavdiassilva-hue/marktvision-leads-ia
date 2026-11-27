"use client";
import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Loader2, Plus, X } from "lucide-react";
import { ActionForm, Field, Modal, SubmitButton } from "@/components/forms";
import { Badge, Empty } from "@/components/ui";
import { ContactFields } from "./contact-form";
import { bulkContactsAction, createContactAction, type BulkOp, type Selection } from "@/app/actions/contacts";
import { CONSENT_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { fmtDate, fmtInt } from "@/lib/format";
import type { ContactFilters, ContactRow } from "@/server/services/contacts";

type Opt = { id: string; name: string };
export type ContactPerms = { canDelete: boolean; canAssign: boolean; canExport: boolean; canTag: boolean; canLists: boolean; isSeller: boolean; canDistribute?: boolean };

const PARAM: Record<keyof ContactFilters, string> = { q: "q", listId: "lista", tagId: "etiqueta", ownerId: "responsavel", source: "origem", status: "situacao", consent: "consentimento", page: "pagina" };

export function ContactsManager({ rows, total, page, pages, filters, lists, tags, team, perms, fixedListId }: {
  rows: ContactRow[]; total: number; page: number; pages: number; filters: ContactFilters;
  lists: Opt[]; tags: (Opt & { color: string })[]; team: Opt[]; perms: ContactPerms; fixedListId?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const setParam = (k: keyof ContactFilters, value: string) => {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(PARAM[k], value); else p.delete(PARAM[k]);
    if (k !== "page") p.delete("pagina");
    router.push(`?${p.toString()}`);
    setSelected(new Set()); setAllMatching(false);
  };
  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const count = allMatching ? total : selected.size;
  const selection: Selection = allMatching ? { filters: { ...filters, page: undefined } } : { ids: [...selected] };

  const run = (op: BulkOp, arg?: string | null, extra?: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setFeedback(null);
    start(async () => {
      const r = await bulkContactsAction(selection, op, arg, extra);
      setFeedback(r.ok ? { ok: true, text: r.message ?? "Concluído." } : { ok: false, text: r.error });
      if (r.ok) { setSelected(new Set()); setAllMatching(false); router.refresh(); }
    });
  };
  const exportHref = () => {
    const p = new URLSearchParams(sp.toString()); p.delete("pagina");
    if (fixedListId) p.set("lista", fixedListId);
    return `/api/contatos/exportar?${p.toString()}`;
  };
  const hasFilters = Object.entries(filters).some(([k, v]) => k !== "page" && v && !(fixedListId && k === "listId"));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <form onSubmit={(e) => { e.preventDefault(); setParam("q", String(new FormData(e.currentTarget).get("q") ?? "")); }} className="flex min-w-[260px] flex-1 gap-2">
          <input name="q" defaultValue={filters.q} className="input" placeholder="Buscar por nome, empresa, telefone, e-mail ou cidade" />
          <button className="btn btn-secondary">Buscar</button>
        </form>
        {perms.canExport && <a href={exportHref()} className="btn btn-secondary"><Download className="h-4 w-4" />Exportar CSV</a>}
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus className="h-5 w-5" />Novo contato</button>
      </div>

      <div className="mb-4 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {!fixedListId && <FilterSelect label="Lista" value={filters.listId} onChange={(v) => setParam("listId", v)} options={lists.map((l) => [l.id, l.name])} />}
        <FilterSelect label="Etiqueta" value={filters.tagId} onChange={(v) => setParam("tagId", v)} options={tags.map((t) => [t.id, t.name])} />
        {!perms.isSeller && <FilterSelect label="Responsável" value={filters.ownerId} onChange={(v) => setParam("ownerId", v)} options={[["none", "Sem responsável"], ...team.map((t) => [t.id, t.name] as [string, string])]} />}
        <FilterSelect label="Origem" value={filters.source} onChange={(v) => setParam("source", v)} options={Object.entries(SOURCE_LABEL)} />
        <FilterSelect label="Situação" value={filters.status} onChange={(v) => setParam("status", v)} options={Object.entries(STATUS_LABEL)} />
        <FilterSelect label="Consentimento" value={filters.consent} onChange={(v) => setParam("consent", v)} options={Object.entries(CONSENT_LABEL)} />
      </div>
      {hasFilters && <button className="mb-3 text-[14px] font-semibold text-brand-dark hover:underline" onClick={() => router.push(fixedListId ? "?" : "/contatos")}>Limpar filtros</button>}

      {feedback && (
        <div role={feedback.ok ? "status" : "alert"} className={clsx("mb-3 flex items-center justify-between rounded-lg border px-4 py-2.5 text-[15px] font-medium",
          feedback.ok ? "border-brand/25 bg-brand-light text-brand-dark" : "border-danger/25 bg-danger-light text-danger")}>
          {feedback.text}<button onClick={() => setFeedback(null)} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      )}

      {count > 0 && (
        <BulkBar count={count} pending={pending} lists={lists} tags={tags} team={team} perms={perms} fixedListId={fixedListId} selectionRef={selection}
          onRun={run} onClear={() => { setSelected(new Set()); setAllMatching(false); }} />
      )}

      <div className="panel overflow-x-auto">
        {rows.length === 0 ? (
          <Empty title={hasFilters ? "Nenhum contato encontrado com estes filtros" : "Nenhum contato cadastrado"}
            description="Cadastre manualmente, importe uma planilha ou pesquise empresas no Google (Fase 03)." />
        ) : (
          <table className="table min-w-[980px]">
            <thead>
              <tr>
                <th className="w-10"><input type="checkbox" aria-label="Selecionar página" className="h-4 w-4 accent-[#008C48]" checked={allOnPage || allMatching}
                  onChange={(e) => { const s = new Set(selected); pageIds.forEach((id) => (e.target.checked ? s.add(id) : s.delete(id))); setSelected(s); setAllMatching(false); }} /></th>
                <th>Contato</th><th>Telefone</th><th>Cidade</th><th>Etiquetas</th><th>Situação</th>{!perms.isSeller && <th>Responsável</th>}<th>Origem</th><th>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {allOnPage && !allMatching && total > rows.length && (
                <tr><td colSpan={9} className="bg-brand-50 text-center text-[14px]">
                  {rows.length} contatos desta página selecionados. <button className="font-semibold text-brand-dark underline" onClick={() => setAllMatching(true)}>Selecionar todos os {fmtInt(total)} resultados</button>
                </td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className={clsx((selected.has(r.id) || allMatching) && "[&>td]:bg-brand-50")}>
                  <td><input type="checkbox" aria-label={`Selecionar ${r.name ?? r.phone_e164}`} className="h-4 w-4 accent-[#008C48]" checked={allMatching || selected.has(r.id)}
                    onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(r.id); else s.delete(r.id); setSelected(s); setAllMatching(false); }} /></td>
                  <td>
                    <Link href={`/contatos/${r.id}`} className="font-semibold text-ink hover:text-brand">{r.name || r.organization || formatPhone(r.phone_e164) || r.email}</Link>
                    {r.organization && r.name && <p className="text-[13px] text-muted">{r.organization}</p>}
                    {r.consent_status === "opted_out" && <p className="text-[13px] font-semibold text-danger">Descadastrado</p>}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">{formatPhone(r.phone_e164) || <span className="text-muted">—</span>}</td>
                  <td>{r.city ?? <span className="text-muted">—</span>}</td>
                  <td><div className="flex max-w-[220px] flex-wrap gap-1">{r.tags.map((t) => <TagChip key={t.id} {...t} />)}</div></td>
                  <td><Badge tone={r.commercial_status === "customer" ? "green" : r.commercial_status === "lost" ? "red" : "gray"}>{STATUS_LABEL[r.commercial_status]}</Badge></td>
                  {!perms.isSeller && <td className="text-[14px]">{r.owner_name ?? <span className="text-muted">—</span>}</td>}
                  <td className="text-[14px] text-muted">{SOURCE_LABEL[r.source]}</td>
                  <td className="text-[14px] text-muted">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[15px] text-muted">
        <span>{fmtInt(total)} contato(s){pages > 1 && ` · página ${page} de ${pages}`}</span>
        {pages > 1 && (
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>Anterior</button>
            <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setParam("page", String(page + 1))}>Próxima</button>
          </div>
        )}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} wide title="Novo contato" description="Informe pelo menos nome, telefone, e-mail ou empresa. Os demais campos são opcionais.">
        <ActionForm action={createContactAction} onSuccess={() => setCreating(false)}>
          <ContactFields />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {perms.canLists && (
              <Field label="Adicionar à lista" name="listId">
                <select name="listId" className="input" defaultValue={fixedListId ?? ""}>
                  <option value="">Nenhuma</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            )}
            {perms.canAssign && (
              <Field label="Vendedor responsável" name="ownerUserId">
                <select name="ownerUserId" className="input" defaultValue=""><option value="">Sem responsável</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              </Field>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-2.5">
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
            <SubmitButton>Cadastrar contato</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </div>
  );
}

export function TagChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12.5px] font-semibold" style={{ borderColor: color + "55", color, background: color + "12" }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />{name}
    </span>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select aria-label={label} className={clsx("input py-2", value && "border-brand bg-brand-50 font-semibold")} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}: todas</option>
      {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

function BulkBar({ count, pending, lists, tags, team, perms, fixedListId, onRun, onClear, selectionRef }: {
  count: number; pending: boolean; lists: Opt[]; tags: Opt[]; team: Opt[]; perms: ContactPerms; fixedListId?: string; selectionRef: Selection;
  onRun: (op: BulkOp, arg?: string | null, extra?: string, confirm?: string) => void; onClear: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const pick = (op: BulkOp, placeholder: string, options: [string, string][], confirm?: (label: string) => string) => (
    <select className="input w-auto py-1.5 text-[14px]" value="" disabled={pending} aria-label={placeholder}
      onChange={(e) => { const opt = options.find(([k]) => k === e.target.value); if (opt) onRun(op, opt[0] === "__none" ? null : opt[0], undefined, confirm?.(opt[1])); }}>
      <option value="">{placeholder}</option>
      {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
  return (
    <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-white px-4 py-3 shadow-sm">
      <span className="mr-1 text-[15px] font-bold text-brand-dark">{fmtInt(count)} selecionado(s)</span>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
      {perms.canLists && !fixedListId && lists.length > 0 && pick("add_list", "Adicionar à lista…", lists.map((l) => [l.id, l.name]))}
      {perms.canLists && fixedListId && <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => onRun("remove_list", fixedListId, undefined, "Remover os contatos selecionados desta lista? Eles continuam na base de contatos.")}>Remover da lista</button>}
      {perms.canTag && tags.length > 0 && pick("tag", "Aplicar etiqueta…", tags.map((t) => [t.id, t.name]))}
      {perms.canTag && tags.length > 0 && pick("untag", "Remover etiqueta…", tags.map((t) => [t.id, t.name]))}
      {pick("status", "Alterar situação…", Object.entries(STATUS_LABEL))}
      {perms.canAssign && pick("owner", "Transferir para…", [...team.map((t) => [t.id, t.name] as [string, string]), ["__none", "Sem responsável"]], (n) => `Transferir ${count} contato(s) para ${n}?`)}
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => setConsent(true)}>Consentimento</button>
      {perms.canDistribute && <DistributeButton team={team} pending={pending} selection={selectionRef} />}
      {perms.canDelete && <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => onRun("delete", null, undefined, `Excluir definitivamente ${count} contato(s)? O histórico deles também será removido.`)}>Excluir</button>}
      <button className="ml-auto text-[14px] font-semibold text-muted hover:text-ink" onClick={onClear}>Limpar seleção</button>
      <ConsentModal open={consent} onClose={() => setConsent(false)} count={count} onSave={(s, src) => { setConsent(false); onRun("consent", s, src); }} />
    </div>
  );
}

export function ConsentModal({ open, onClose, count, onSave }: { open: boolean; onClose: () => void; count: number; onSave: (status: string, source: string) => void }) {
  const [status, setStatus] = useState("opted_in");
  const [source, setSource] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Registrar consentimento" description={`Aplica-se a ${count} contato(s). Exigência da LGPD e das políticas do WhatsApp.`}>
      <div className="space-y-4">
        <div className="space-y-2">
          {Object.entries(CONSENT_LABEL).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2.5 text-[15px]"><input type="radio" name="consent" value={k} checked={status === k} onChange={() => setStatus(k)} className="h-4 w-4 accent-[#008C48]" />{l}</label>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="consent-source">Como foi obtido / motivo {status !== "opted_in" && <span className="font-normal text-muted">(opcional)</span>}</label>
          <input id="consent-source" className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ex.: pediu informações pelo site em 10/11" />
        </div>
        <p className="text-[13px] text-muted">Contatos descadastrados não recebem mensagens de campanhas.</p>
      </div>
      <div className="mt-6 flex justify-end gap-2.5">
        <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => onSave(status, source)}>Registrar</button>
      </div>
    </Modal>
  );
}

function DistributeButton({ team, pending, selection }: { team: Opt[]; pending: boolean; selection: Selection }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [only, setOnly] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <>
      <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => setOpen(true)}>Distribuir entre vendedores</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Distribuir leads" description="Rodízio entre os vendedores escolhidos, começando por quem tem menos contatos. Conversas e negociações abertas acompanham o contato.">
        <div className="space-y-2">{team.map((t) => (
          <label key={t.id} className="flex items-center gap-2.5 text-[15px]"><input type="checkbox" className="h-4 w-4 accent-[#008C48]" checked={sel.has(t.id)}
            onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(t.id); else s.delete(t.id); setSel(s); }} />{t.name}</label>))}</div>
        <label className="mt-4 flex items-center gap-2.5 text-[15px]"><input type="checkbox" className="h-4 w-4 accent-[#008C48]" checked={only} onChange={(e) => setOnly(e.target.checked)} />Somente contatos sem responsável</label>
        {msg && <p className="mt-3 text-[14.5px] font-medium text-danger">{msg}</p>}
        <div className="mt-5 flex justify-end gap-2"><button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || !sel.size} onClick={() => start(async () => {
            const { distributeAction } = await import("@/app/actions/crm");
            const r = await distributeAction(selection, [...sel], only);
            if (!r.ok) setMsg(r.error); else { setOpen(false); router.refresh(); alert(r.message); }
          })}>Distribuir</button></div>
      </Modal>
    </>
  );
}
