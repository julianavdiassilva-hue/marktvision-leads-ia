"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ActionButton, ActionForm, Field, Modal, SubmitButton } from "@/components/forms";
import { createListAction, deleteListAction, updateListAction } from "@/app/actions/contacts";

export function ListCreateButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="h-5 w-5" />Nova lista</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova lista">
        <ActionForm action={createListAction} onSuccess={(r) => { setOpen(false); const id = (r as { data?: { id: string } }).data?.id; if (id) router.push(`/contatos/listas/${id}`); }}>
          <div className="space-y-4">
            <Field label="Nome da lista" name="name"><input id="list-name" name="name" className="input" autoFocus placeholder="Ex.: Clínicas de Belém" /></Field>
            <Field label="Descrição" name="description" optional><input name="description" className="input" /></Field>
          </div>
          <div className="mt-6 flex justify-end gap-2.5"><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><SubmitButton>Criar lista</SubmitButton></div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function ListEditButton({ list }: { list: { id: string; name: string; description: string | null } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>Renomear</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Editar lista">
        <ActionForm action={updateListAction.bind(null, list.id)} onSuccess={() => setOpen(false)} resetOnSuccess={false}>
          <div className="space-y-4">
            <Field label="Nome da lista" name="name"><input name="name" className="input" defaultValue={list.name} /></Field>
            <Field label="Descrição" name="description" optional><input name="description" className="input" defaultValue={list.description ?? ""} /></Field>
          </div>
          <div className="mt-6 flex justify-end"><SubmitButton>Salvar</SubmitButton></div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function ListDeleteButton({ id, name }: { id: string; name: string }) {
  return <ActionButton variant="ghost" action={() => deleteListAction(id)} confirm={`Excluir a lista "${name}"? Os contatos continuam na base central.`}>Excluir</ActionButton>;
}
