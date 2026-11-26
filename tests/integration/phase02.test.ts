import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, withScope } from "@/server/db";
import { createCompany, setCompanyFeature, setCompanyLimits } from "@/server/services/companies";
import {
  addContactsToList, applyTag, assignOwner, createContact, deleteContacts, exportContactsCsv, getContact,
  listContacts, removeContactsFromList, setConsent, updateContact, upsertContacts, normalizeContactInput,
} from "@/server/services/contacts";
import { createList, deleteList, listLists } from "@/server/services/lists";
import { createTag, deleteTag, listTags } from "@/server/services/tags";
import { scopeOf } from "@/server/guards";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/core";
import { ADMIN, loginAs } from "./helpers";

let admin: AuthContext, gestor: AuthContext, vend1: AuthContext, vend2: AuthContext, outro: AuthContext;
let companyId: string;

const expectError = async (p: Promise<unknown>, code: AppError["code"], msg?: RegExp) => {
  const e = await p.then(() => null, (err) => err);
  expect(e, "deveria ter falhado").toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code);
  if (msg) expect((e as AppError).message).toMatch(msg);
};

beforeAll(async () => {
  admin = await loginAs(ADMIN.username, ADMIN.password);
  const c = await createCompany(admin, { name: "Contatos SA", users: [
    { name: "Gestor", username: "gestor.f2", password: "gestorsenha", role: "company_admin" },
    { name: "Vendedor Um", username: "vend1.f2", password: "vend1senha", role: "seller" },
    { name: "Vendedor Dois", username: "vend2.f2", password: "vend2senha", role: "seller" },
  ] });
  companyId = c.id;
  await createCompany(admin, { name: "Outra Empresa F2", users: [{ name: "Outro", username: "outro.f2", password: "outrosenha", role: "company_admin" }] });
  gestor = await loginAs("gestor.f2", "gestorsenha");
  vend1 = await loginAs("vend1.f2", "vend1senha");
  vend2 = await loginAs("vend2.f2", "vend2senha");
  outro = await loginAs("outro.f2", "outrosenha");
});
afterAll(async () => { await closePool(); });

describe("Fase 02 — base central de contatos", () => {
  it("cadastra contato só com telefone e normaliza para E.164", async () => {
    const { id } = await createContact(gestor, { phone: "(91) 98888-1111" });
    const { contact } = await getContact(gestor, id);
    expect(contact.phone_e164).toBe("+5591988881111");
    expect(contact.source).toBe("manual");
  });

  it("exige ao menos um identificador e valida telefone/e-mail em português", async () => {
    await expectError(createContact(gestor, {}), "VALIDATION", /pelo menos nome/);
    await expectError(createContact(gestor, { phone: "123" }), "VALIDATION", /Telefone inválido/);
    await expectError(createContact(gestor, { name: "X", email: "x@" }), "VALIDATION", /E-mail inválido/);
  });

  it("impede contato duplicado pelo mesmo telefone em formatos diferentes", async () => {
    await expectError(createContact(gestor, { name: "Duplicado", phone: "5591988881111" }), "CONFLICT", /Já existe/);
  });

  it("upsert não duplica e completa apenas campos vazios", async () => {
    const r = await withScope(scopeOf(gestor), (db) => upsertContacts(db, gestor, companyId, [
      normalizeContactInput({ name: "Clínica Alfa", phone: "91 98888-1111", city: "Belém" }),
      normalizeContactInput({ name: "Clínica Beta", phone: "91 98888-2222" }),
      normalizeContactInput({ name: "Beta repetida na mesma importação", phone: "+5591988882222" }),
    ], "import"));
    expect(r.created).toBe(1);
    expect(r.matched).toBe(2);
    const list = await listContacts(gestor, { q: "988881111" });
    expect(list.total).toBe(1);
    expect(list.rows[0].name).toBe("Clínica Alfa");
    expect(list.rows[0].city).toBe("Belém");
  });

  it("vendedor cria contatos que ficam sob sua responsabilidade e só vê os seus", async () => {
    await createContact(vend1, { name: "Lead do Vendedor 1", phone: "91 97777-0001" });
    await createContact(vend2, { name: "Lead do Vendedor 2", phone: "91 97777-0002" });
    const v1 = await listContacts(vend1);
    expect(v1.rows.map((r) => r.name)).toEqual(["Lead do Vendedor 1"]);
    const all = await listContacts(gestor);
    expect(all.total).toBe(4);
    const other = (await listContacts(gestor, { q: "Vendedor 2" })).rows[0];
    await expectError(getContact(vend1, other.id), "NOT_FOUND");
    await expectError(updateContact(vend1, other.id, { name: "hack" }), "NOT_FOUND");
  });

  it("transferência de responsável (somente administrador)", async () => {
    const alfa = (await listContacts(gestor, { q: "Alfa" })).rows[0];
    await expectError(assignOwner(vend1, [alfa.id], vend1.user.id), "FORBIDDEN");
    await assignOwner(gestor, [alfa.id], vend1.user.id);
    expect((await listContacts(vend1)).rows.map((r) => r.name)).toContain("Clínica Alfa");
    const { events } = await getContact(gestor, alfa.id);
    expect(events.map((e) => e.type)).toContain("contact.owner_changed");
  });

  it("listas: criar, adicionar sem duplicar, filtrar e excluir sem apagar contatos", async () => {
    const { id: listId } = await createList(gestor, { name: "Clínicas de Belém" });
    await expectError(createList(gestor, { name: "clínicas de belém" }), "CONFLICT", /lista com este nome/);
    const ids = (await listContacts(gestor)).rows.map((r) => r.id);
    const a = await addContactsToList(gestor, ids, listId);
    expect(a.added).toBe(4);
    const b = await addContactsToList(gestor, ids, listId);
    expect(b.added).toBe(0);
    expect((await listContacts(gestor, { listId })).total).toBe(4);
    await removeContactsFromList(gestor, [ids[0]], listId);
    expect((await listLists(gestor)).find((l) => l.id === listId)?.contacts).toBe(3);
    await expectError(deleteList(vend1, listId), "FORBIDDEN");
    await deleteList(gestor, listId);
    expect((await listContacts(gestor)).total).toBe(4);
  });

  it("etiquetas vinculadas ao contato central e filtro por etiqueta", async () => {
    const { id: tagId } = await createTag(gestor, { name: "Cliente quente", color: "#DC2626" });
    const alfa = (await listContacts(gestor, { q: "Alfa" })).rows[0];
    await applyTag(vend1, [alfa.id], tagId);
    const filtered = await listContacts(gestor, { tagId });
    expect(filtered.rows.map((r) => r.id)).toEqual([alfa.id]);
    expect(filtered.rows[0].tags[0].name).toBe("Cliente quente");
    expect((await listTags(gestor))[0].contacts).toBe(1);
    // vendedor 2 não consegue etiquetar contato de outro vendedor (operação ignorada)
    const r = await applyTag(vend2, [alfa.id], tagId, false);
    expect(r.changed).toBe(0);
    await expectError(deleteTag(vend1, tagId), "FORBIDDEN");
  });

  it("consentimento: opt-in exige origem; opt-out registra data", async () => {
    const alfa = (await listContacts(gestor, { q: "Alfa" })).rows[0];
    await expectError(setConsent(gestor, [alfa.id], "opted_in", ""), "VALIDATION", /como o consentimento/);
    await setConsent(gestor, [alfa.id], "opted_in", "Formulário do site");
    let c = (await getContact(gestor, alfa.id)).contact;
    expect(c.consent_status).toBe("opted_in");
    expect(c.consent_at).toBeTruthy();
    await setConsent(gestor, [alfa.id], "opted_out", "Pediu para não receber");
    c = (await getContact(gestor, alfa.id)).contact;
    expect(c.opted_out_at).toBeTruthy();
  });

  it("exportação CSV exige a funcionalidade e protege contra fórmulas", async () => {
    await createContact(gestor, { name: "=HYPERLINK(\"x\")", phone: "91 96666-0000" });
    const csv = await exportContactsCsv(gestor, {});
    expect(csv.startsWith("﻿Nome;Telefone")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    await setCompanyFeature(admin, companyId, "data_export", false);
    const g = await loginAs("gestor.f2", "gestorsenha");
    await expectError(exportContactsCsv(g, {}), "FORBIDDEN", /Exportação de dados/);
  });

  it("limite de contatos do plano", async () => {
    await setCompanyLimits(admin, companyId, { max_contacts: "5" });
    await expectError(createContact(gestor, { name: "Sexto", phone: "91 95555-0000" }), "LIMIT", /5 contatos/);
    await setCompanyLimits(admin, companyId, {});
  });

  it("isolamento: outra empresa não vê nem altera contatos", async () => {
    expect((await listContacts(outro)).total).toBe(0);
    const alfa = (await listContacts(gestor, { q: "Alfa" })).rows[0];
    await expectError(getContact(outro, alfa.id), "NOT_FOUND");
    const r = await applyTag(outro, [alfa.id], (await createTag(outro, { name: "x", color: "#008C48" })).id);
    expect(r.changed).toBe(0);
    // mesmo telefone pode existir em empresas diferentes (bases independentes)
    await createContact(outro, { phone: "(91) 98888-1111" });
  });

  it("exclusão só pelo administrador; vendedor recebe erro", async () => {
    const ids = (await listContacts(gestor, { q: "HYPERLINK" })).rows.map((r) => r.id);
    await expectError(deleteContacts(vend1, ids), "FORBIDDEN");
    expect((await deleteContacts(gestor, ids)).deleted).toBe(1);
  });
});
