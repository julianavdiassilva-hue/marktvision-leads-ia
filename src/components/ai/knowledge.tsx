"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/forms";
import { Badge, Empty, Panel } from "@/components/ui";
import { deleteDocumentAction, deleteKnowledgeAction, saveKnowledgeAction, uploadDocumentAction } from "@/app/actions/ai";
import { fmtDateTime } from "@/lib/format";

type Entry = { id: string; category: string; title: string; content: string; is_active: boolean; updated_at: string };
type Doc = { id: string; filename: string; size_bytes: number; chars: number; created_at: string };

export function KnowledgeManager({ entries, documents, categories, canEdit }: { entries: Entry[]; documents: Doc[]; categories: Record<string, string>; canEdit: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<Entry> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const done = (r: { ok: boolean; error?: string; message?: string }) => { setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error! }); if (r.ok) router.refresh(); };
  const onFile = (f?: File) => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => start(async () => done(await uploadDocumentAction({ name: f.name, type: f.type, base64: String(rd.result).split(",")[1] ?? "" })));
    rd.readAsDataURL(f);
  };
  const grouped = Object.entries(categories).map(([k, l]) => [k, l, entries.filter((e) => e.category === k)] as const).filter(([, , list]) => list.length);
  return (
    <div className="space-y-6">
      {msg && <div role={msg.ok ? "status" : "alert"} className={`rounded-lg border px-4 py-2.5 text-[15px] font-medium ${msg.ok ? "border-brand/25 bg-brand-light text-brand-dark" : "border-danger/25 bg-danger-light text-danger"}`}>{msg.text}</div>}
      <Panel title="Informações" description="Produtos, serviços, preços, horários, regras… O agente só responde com o que estiver aqui."
        actions={canEdit && <button className="btn btn-primary" onClick={() => setEdit({ category: "company", is_active: true })}><Plus className="h-5 w-5" />Nova informação</button>}>
        {entries.length === 0 ? <Empty title="Nenhuma informação cadastrada" description="Comece por: informações da empresa, serviços, preços e horários. Sem isso, o agente apenas recepciona e transfere para a equipe." /> : (
          <div className="space-y-5">{grouped.map(([k, l, list]) => (
            <div key={k}><p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-muted">{l}</p>
              <ul className="divide-y divide-line rounded-xl border border-line">{list.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1"><p className="font-semibold">{e.title} {!e.is_active && <Badge tone="gray">Inativa</Badge>}</p>
                    <p className="line-clamp-2 whitespace-pre-wrap text-[14.5px] text-muted">{e.content}</p></div>
                  {canEdit && <><button aria-label={`Editar ${e.title}`} className="text-muted hover:text-brand" onClick={() => setEdit(e)}><Pencil className="h-4 w-4" /></button>
                    <button aria-label={`Excluir ${e.title}`} className="text-muted hover:text-danger" onClick={() => confirm(`Excluir "${e.title}"?`) && start(async () => done(await deleteKnowledgeAction(e.id)))}><Trash2 className="h-4 w-4" /></button></>}
                </li>))}</ul></div>))}</div>
        )}
      </Panel>
      <Panel title="Documentos" description="PDF, TXT, MD ou CSV (até 5 MB). O texto é extraído e usado somente pelo agente desta empresa."
        actions={canEdit && <><input ref={fileRef} type="file" accept=".pdf,.txt,.md,.csv" className="hidden" data-testid="doc-input" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button className="btn btn-secondary" disabled={pending} onClick={() => fileRef.current?.click()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Anexar documento</button></>}>
        {documents.length === 0 ? <p className="text-[15px] text-muted">Nenhum documento.</p> : (
          <ul className="divide-y divide-line">{documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5"><FileText className="h-5 w-5 text-brand" />
              <span className="flex-1"><b>{d.filename}</b> <span className="text-[13.5px] text-muted">· {d.chars.toLocaleString("pt-BR")} caracteres · {fmtDateTime(d.created_at)}</span></span>
              {canEdit && <button aria-label={`Excluir ${d.filename}`} className="text-muted hover:text-danger" onClick={() => start(async () => done(await deleteDocumentAction(d.id)))}><Trash2 className="h-4 w-4" /></button>}
            </li>))}</ul>
        )}
      </Panel>
      <EntryModal entry={edit} categories={categories} onClose={() => setEdit(null)} onDone={(r) => { setEdit(null); done(r); }} />
    </div>
  );
}

function EntryModal({ entry, categories, onClose, onDone }: { entry: Partial<Entry> | null; categories: Record<string, string>; onClose: () => void; onDone: (r: { ok: boolean; message?: string }) => void }) {
  const [f, setF] = useState<Partial<Entry>>({}); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  const v = { ...entry, ...f };
  return (
    <Modal open={!!entry} onClose={() => { setF({}); onClose(); }} wide title={entry?.id ? "Editar informação" : "Nova informação"}>
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <div><label className="label" htmlFor="k-cat">Categoria</label><select id="k-cat" className="input" value={v.category ?? "company"} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {Object.entries(categories).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="k-title">Título</label><input id="k-title" className="input" value={v.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex.: Instalação de ar split" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="k-content">Conteúdo</label>
          <textarea id="k-content" className="input" rows={8} value={v.content ?? ""} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="Escreva como explicaria a um novo atendente. Inclua valores e condições exatamente como devem ser informados." /></div>
        <label className="flex items-center gap-2.5 text-[15px]"><input type="checkbox" className="h-4 w-4 accent-[#008C48]" checked={v.is_active ?? true} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Usar no atendimento</label>
      </div>
      {err && <p role="alert" className="mt-2 text-[14px] font-medium text-danger">{err}</p>}
      <div className="mt-5 flex justify-end gap-2"><button className="btn btn-secondary" onClick={() => { setF({}); onClose(); }}>Cancelar</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await saveKnowledgeAction({ category: v.category ?? "company", title: v.title ?? "", content: v.content ?? "", isActive: v.is_active ?? true }, entry?.id);
          if (!r.ok) setErr(r.error); else { setF({}); onDone(r); } })}>Salvar</button></div>
    </Modal>
  );
}
