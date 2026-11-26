"use server";
import { formToObject, runAction, type ActionResult } from "@/server/action";
import {
  addContactsToList, applyTag, assignOwner, createContact, deleteContacts, removeContactsFromList,
  resolveSelection, setConsent, setContactsStatus, updateContact, type ContactFilters,
} from "@/server/services/contacts";
import { createList, deleteList, updateList } from "@/server/services/lists";
import { createTag, deleteTag, updateTag } from "@/server/services/tags";
import { invalid } from "@/server/errors";

export async function createContactAction(_: ActionResult | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const d = formToObject(fd);
    const r = await createContact(ctx, { ...d, listId: d.listId || undefined, ownerUserId: d.ownerUserId || undefined });
    return { message: "Contato cadastrado.", data: r };
  });
}
export async function updateContactAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => { await updateContact(ctx, id, formToObject(fd)); return { message: "Contato salvo." }; });
}

export type Selection = { ids?: string[]; filters?: ContactFilters };
export type BulkOp = "add_list" | "remove_list" | "tag" | "untag" | "owner" | "status" | "consent" | "delete";

/** Ações em lote sobre a seleção (IDs marcados ou todos os resultados do filtro). */
export async function bulkContactsAction(sel: Selection, op: BulkOp, arg?: string | null, extra?: string): Promise<ActionResult> {
  return runAction(async (ctx) => {
    const ids = await resolveSelection(ctx, sel);
    if (!ids.length) throw invalid("Nenhum contato selecionado.");
    const n = ids.length;
    switch (op) {
      case "add_list": { const r = await addContactsToList(ctx, ids, arg!); return { message: `${r.added} contato(s) adicionados à lista${r.already ? ` (${r.already} já estavam nela)` : ""}.` }; }
      case "remove_list": { const r = await removeContactsFromList(ctx, ids, arg!); return { message: `${r.removed} contato(s) removidos da lista.` }; }
      case "tag": { const r = await applyTag(ctx, ids, arg!, true); return { message: `Etiqueta aplicada a ${r.changed} contato(s).` }; }
      case "untag": { const r = await applyTag(ctx, ids, arg!, false); return { message: `Etiqueta removida de ${r.changed} contato(s).` }; }
      case "owner": { const r = await assignOwner(ctx, ids, arg || null); return { message: `${r.updated} contato(s) transferidos.` }; }
      case "status": { const r = await setContactsStatus(ctx, ids, arg!); return { message: `Situação atualizada em ${r.updated} contato(s).` }; }
      case "consent": { const r = await setConsent(ctx, ids, arg!, extra ?? ""); return { message: `Consentimento registrado em ${r.updated} contato(s).` }; }
      case "delete": { const r = await deleteContacts(ctx, ids); return { message: `${r.deleted} de ${n} contato(s) excluídos.` }; }
    }
  });
}

export async function createListAction(_: ActionResult | null, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async (ctx) => {
    const r = await createList(ctx, formToObject(fd) as never);
    return { message: "Lista criada.", data: r };
  });
}
export async function updateListAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => { await updateList(ctx, id, formToObject(fd) as never); return { message: "Lista salva." }; });
}
export async function deleteListAction(id: string) {
  return runAction(async (ctx) => { await deleteList(ctx, id); });
}

export async function createTagAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => { await createTag(ctx, formToObject(fd) as never); return { message: "Etiqueta criada." }; });
}
export async function updateTagAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async (ctx) => { await updateTag(ctx, id, formToObject(fd) as never); return { message: "Etiqueta salva." }; });
}
export async function deleteTagAction(id: string) {
  return runAction(async (ctx) => { await deleteTag(ctx, id); });
}
