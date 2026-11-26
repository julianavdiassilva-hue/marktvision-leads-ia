"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Panel } from "@/components/ui";
import { ContactFields } from "./contact-form";
import { ConsentModal, TagChip, type ContactPerms } from "./contacts-manager";
import { bulkContactsAction, updateContactAction, type BulkOp } from "@/app/actions/contacts";
import { CONSENT_LABEL } from "@/lib/labels";
import { fmtDateTime } from "@/lib/format";

type Opt = { id: string; name: string };

export function ContactEdit({ contact }: { contact: Record<string, unknown> & { id: string } }) {
  return (
    <Panel title="Dados do contato">
      <ActionForm action={updateContactAction.bind(null, contact.id)} resetOnSuccess={false}>
        <ContactFields c={contact} />
        <div className="mt-5 flex justify-end"><SubmitButton>Salvar contato</SubmitButton></div>
      </ActionForm>
    </Panel>
  );
}

export function ContactSide({ contact, tags, lists, allTags, allLists, team, perms }: {
  contact: Record<string, unknown> & { id: string; owner_user_id: string | null };
  tags: (Opt & { color: string })[]; lists: Opt[]; allTags: (Opt & { color: string })[]; allLists: Opt[]; team: Opt[]; perms: ContactPerms;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const run = (op: BulkOp, arg?: string | null, extra?: string) => {
    setError(null);
    start(async () => { const r = await bulkContactsAction({ ids: [contact.id] }, op, arg, extra); if (!r.ok) setError(r.error); else router.refresh(); });
  };
  const freeTags = allTags.filter((t) => !tags.some((x) => x.id === t.id));
  const freeLists = allLists.filter((l) => !lists.some((x) => x.id === l.id));
  const consentStatus = String(contact.consent_status);
  return (
    <div className="space-y-5">
      {error && <div role="alert" className="rounded-lg border border-danger/25 bg-danger-light px-4 py-3 text-[15px] font-medium text-danger">{error}</div>}
      {pending && <p className="flex items-center gap-2 text-[14px] text-muted"><Loader2 className="h-4 w-4 animate-spin" />Salvando…</p>}
      {perms.canAssign && (
        <Panel title="Vendedor responsável">
          <select className="input" value={contact.owner_user_id ?? ""} disabled={pending} aria-label="Vendedor responsável" onChange={(e) => run("owner", e.target.value || null)}>
            <option value="">Sem responsável</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Panel>
      )}
      <Panel title="Consentimento" actions={<button className="btn btn-secondary btn-sm" onClick={() => setConsent(true)}>Registrar</button>}>
        <p className={`text-[16px] font-semibold ${consentStatus === "opted_out" ? "text-danger" : consentStatus === "opted_in" ? "text-brand-dark" : ""}`}>{CONSENT_LABEL[consentStatus]}</p>
        {contact.consent_source ? <p className="mt-1 text-[14px] text-muted">{String(contact.consent_source)}</p> : null}
        {consentStatus === "opted_in" && contact.consent_at ? <p className="text-[13px] text-muted">em {fmtDateTime(String(contact.consent_at))}</p> : null}
        {consentStatus === "opted_out" && contact.opted_out_at ? <p className="text-[13px] text-muted">em {fmtDateTime(String(contact.opted_out_at))}</p> : null}
        <ConsentModal open={consent} onClose={() => setConsent(false)} count={1} onSave={(s, src) => { setConsent(false); run("consent", s, src); }} />
      </Panel>
      {perms.canTag && (
        <Panel title="Etiquetas">
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 && <p className="text-[14px] text-muted">Nenhuma etiqueta.</p>}
            {tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1"><TagChip {...t} />
                <button aria-label={`Remover ${t.name}`} className="text-muted hover:text-danger" disabled={pending} onClick={() => run("untag", t.id)}><X className="h-4 w-4" /></button>
              </span>
            ))}
          </div>
          {freeTags.length > 0 && (
            <select className="input mt-3 py-2" value="" disabled={pending} aria-label="Adicionar etiqueta" onChange={(e) => e.target.value && run("tag", e.target.value)}>
              <option value="">Adicionar etiqueta…</option>{freeTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </Panel>
      )}
      {perms.canLists && (
        <Panel title="Listas">
          <ul className="space-y-1.5">
            {lists.length === 0 && <li className="text-[14px] text-muted">Não está em nenhuma lista.</li>}
            {lists.map((l) => (
              <li key={l.id} className="flex items-center justify-between text-[15px]">{l.name}
                <button className="text-[13px] font-semibold text-muted hover:text-danger" disabled={pending} onClick={() => run("remove_list", l.id)}>Remover</button>
              </li>
            ))}
          </ul>
          {freeLists.length > 0 && (
            <select className="input mt-3 py-2" value="" disabled={pending} aria-label="Adicionar à lista" onChange={(e) => e.target.value && run("add_list", e.target.value)}>
              <option value="">Adicionar à lista…</option>{freeLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </Panel>
      )}
    </div>
  );
}
