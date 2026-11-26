"use client";
import Link from "next/link";
import { useState } from "react";
import { ActionButton, ActionForm, Field, Modal, SubmitButton } from "@/components/forms";
import { Empty } from "@/components/ui";
import { TagChip } from "./contacts-manager";
import { createTagAction, deleteTagAction, updateTagAction } from "@/app/actions/contacts";
import { fmtInt } from "@/lib/format";

type Tag = { id: string; name: string; color: string; contacts: number };

function ColorPicker({ colors, value }: { colors: string[]; value?: string }) {
  const [sel, setSel] = useState(value ?? colors[0]);
  return (
    <div className="flex flex-wrap gap-2">
      <input type="hidden" name="color" value={sel} />
      {colors.map((c) => (
        <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setSel(c)}
          className="h-8 w-8 rounded-full ring-offset-2 transition" style={{ background: c, boxShadow: sel === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }} />
      ))}
    </div>
  );
}

export function TagsManager({ tags, colors, canEdit }: { tags: Tag[]; colors: string[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Tag | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <section className="panel h-fit p-5">
        <h2 className="mb-4 text-[17px] font-bold">Nova etiqueta</h2>
        <ActionForm action={createTagAction}>
          <div className="space-y-4">
            <Field label="Nome" name="name"><input id="tag-name" name="name" className="input" placeholder="Ex.: Cliente quente" /></Field>
            <Field label="Cor" name="color"><ColorPicker colors={colors} /></Field>
          </div>
          <div className="mt-5 flex justify-end"><SubmitButton>Criar etiqueta</SubmitButton></div>
        </ActionForm>
      </section>
      <section className="panel overflow-x-auto">
        {tags.length === 0 ? <Empty title="Nenhuma etiqueta" description="Sugestões: Novo lead, Interessado, Cliente quente, Aguardando retorno, Sem interesse, Cliente ativo." /> : (
          <table className="table">
            <thead><tr><th>Etiqueta</th><th className="text-right">Contatos</th><th /></tr></thead>
            <tbody>{tags.map((t) => (
              <tr key={t.id}>
                <td><TagChip name={t.name} color={t.color} /></td>
                <td className="text-right tabular-nums"><Link className="font-semibold hover:text-brand" href={`/contatos?etiqueta=${t.id}`}>{fmtInt(t.contacts)}</Link></td>
                <td className="text-right">{canEdit && <div className="flex justify-end gap-1">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(t)}>Editar</button>
                  <ActionButton variant="ghost" action={() => deleteTagAction(t.id)} confirm={`Excluir a etiqueta "${t.name}"? Ela será removida de ${t.contacts} contato(s).`}>Excluir</ActionButton>
                </div>}</td>
              </tr>))}
            </tbody>
          </table>
        )}
      </section>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar etiqueta">
        {editing && (
          <ActionForm action={updateTagAction.bind(null, editing.id)} onSuccess={() => setEditing(null)} resetOnSuccess={false}>
            <div className="space-y-4">
              <Field label="Nome" name="name"><input name="name" className="input" defaultValue={editing.name} /></Field>
              <Field label="Cor" name="color"><ColorPicker colors={colors} value={editing.color} /></Field>
            </div>
            <div className="mt-6 flex justify-end"><SubmitButton>Salvar</SubmitButton></div>
          </ActionForm>
        )}
      </Modal>
    </div>
  );
}
