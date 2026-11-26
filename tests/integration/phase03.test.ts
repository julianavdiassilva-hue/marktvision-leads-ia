import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closePool } from "@/server/db";
import { createCompany, setCompanyLimits } from "@/server/services/companies";
import { createContact, listContacts, getContact } from "@/server/services/contacts";
import { listLists } from "@/server/services/lists";
import { setUserFeature } from "@/server/services/users";
import { analyzeImport, runImport } from "@/server/services/imports";
import { buildQuery, savePlaces, searchCompanies } from "@/server/services/prospecting";
import { suggestMapping } from "@/lib/import-mapping";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/core";
import { ADMIN, loginAs } from "./helpers";

let admin: AuthContext, gestor: AuthContext, vend: AuthContext;
let companyId: string;
const expectError = async (p: Promise<unknown>, code: AppError["code"], msg?: RegExp) => {
  const e = await p.then(() => null, (err) => err);
  expect(e, "deveria ter falhado").toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code);
  if (msg) expect((e as AppError).message).toMatch(msg);
};

beforeAll(async () => {
  admin = await loginAs(ADMIN.username, ADMIN.password);
  companyId = (await createCompany(admin, { name: "Prospecção F3", users: [
    { name: "Gestor F3", username: "gestor.f3", password: "gestorsenha", role: "company_admin" },
    { name: "Vend F3", username: "vend.f3", password: "vendsenha1", role: "seller" },
  ] })).id;
  gestor = await loginAs("gestor.f3", "gestorsenha");
  vend = await loginAs("vend.f3", "vendsenha1");
});
afterAll(async () => { vi.unstubAllGlobals(); await closePool(); });

describe("Fase 03 — importação de planilhas", () => {
  it("detecta colunas pelo cabeçalho (com acentos e variações)", () => {
    const m = suggestMapping(["Nome do Contato", "Celular", "E-mail", "Razão Social", "Município", "UF", "Obs."]);
    expect(m).toEqual({ name: 0, phone: 1, email: 2, organization: 3, city: 4, state: 5, notes: 6 });
  });

  it("prévia classifica novos, existentes, repetidos e inválidos sem gravar", async () => {
    await createContact(gestor, { name: "Já existe", phone: "91 98000-0001" });
    const rows = [
      { name: "Novo A", phone: "(91) 98000-0002" },
      { name: "Existente", phone: "5591980000001" },
      { name: "Repetido", phone: "91980000002" },
      { name: "Telefone ruim", phone: "123" },
      { name: "Só e-mail", email: "contato@empresa.com.br" },
      {},
    ];
    const r = await analyzeImport(gestor, rows);
    expect(r.summary).toMatchObject({ total: 6, new: 2, existing: 1, file_duplicate: 1, invalid: 2 });
    expect(r.rows[3].reason).toMatch(/Telefone inválido/);
    expect((await listContacts(gestor)).total).toBe(1);
  });

  it("importa para nova lista sem duplicar e atualiza campos vazios do existente", async () => {
    const res = await runImport(gestor, [
      { name: "Novo A", phone: "(91) 98000-0002", city: "Ananindeua" },
      { name: "Existente", phone: "5591980000001", city: "Belém", organization: "Clínica X" },
      { name: "Repetido", phone: "91980000002" },
      { name: "Telefone ruim", phone: "123" },
    ], { newListName: "Importação novembro", fileName: "clientes.xlsx" });
    expect(res).toMatchObject({ created: 1, updated: 2, invalid: 1 });
    const list = (await listLists(gestor)).find((l) => l.name === "Importação novembro")!;
    expect(list.contacts).toBe(2);
    const existing = (await listContacts(gestor, { q: "Já existe" })).rows[0];
    expect(existing.city).toBe("Belém");
    expect(existing.name).toBe("Já existe"); // não sobrescreve dados já preenchidos
    expect((await listContacts(gestor, { source: "import" })).total).toBe(1);
  });

  it("vendedor importa contatos que ficam sob sua responsabilidade (após permissão individual)", async () => {
    await expectError(runImport(vend, [{ name: "x", phone: "91 98000-0098" }], {}), "FORBIDDEN");
    await setUserFeature(gestor, vend.user.id, "spreadsheet_import", true);
    vend = await loginAs("vend.f3", "vendsenha1");
    await runImport(vend, [{ name: "Lead importado", phone: "91 98000-0099" }], { fileName: "meus.csv" });
    expect((await listContacts(vend)).rows.map((r) => r.name)).toEqual(["Lead importado"]);
  });

  it("limite de contatos: importação inteira é recusada, nada gravado", async () => {
    const before = (await listContacts(gestor)).total;
    await setCompanyLimits(admin, companyId, { max_contacts: String(before + 1) });
    await expectError(runImport(gestor, [{ phone: "91 98000-1001" }, { phone: "91 98000-1002" }], {}), "LIMIT");
    expect((await listContacts(gestor)).total).toBe(before);
    await setCompanyLimits(admin, companyId, {});
  });

  it("sem funcionalidade liberada => bloqueado", async () => {
    const other = await createCompany(admin, { name: "Sem import", planId: null, users: [{ name: "S", username: "semimport", password: "semimport1", role: "company_admin" }] });
    void other;
    const s = await loginAs("semimport", "semimport1");
    await expectError(analyzeImport(s, [{ name: "x" }]), "FORBIDDEN");
  });
});

describe("Fase 03 — pesquisa no Google (código de integração)", () => {
  it("monta a consulta a partir de segmento e localização", () => {
    expect(buildQuery({ keyword: "Clínicas odontológicas", city: "Belém", state: "PA", neighborhood: "Umarizal" }))
      .toBe("Clínicas odontológicas em Umarizal, Belém - PA");
  });

  it("sem chave configurada informa claramente (sem resultados inventados)", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    await expectError(searchCompanies(gestor, { keyword: "restaurantes", city: "Ananindeua" }), "INTEGRATION", /GOOGLE_PLACES_API_KEY/);
  });

  it("mapeia a resposta da API, marca quem já está na base e salva sem duplicar", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "chave-de-teste";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.textQuery).toBe("escolas particulares em Benevides - PA");
      expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("chave-de-teste");
      return new Response(JSON.stringify({ places: [
        { id: "place-1", displayName: { text: "Escola Saber" }, internationalPhoneNumber: "+55 91 3222-0001", formattedAddress: "Rua A, 10 - Benevides - PA",
          websiteUri: "https://saber.edu.br", primaryTypeDisplayName: { text: "Escola" }, rating: 4.6, userRatingCount: 120,
          addressComponents: [{ longText: "Benevides", types: ["administrative_area_level_2"] }, { longText: "Pará", shortText: "PA", types: ["administrative_area_level_1"] }] },
        { id: "place-2", displayName: { text: "Colégio Já Cadastrado" }, nationalPhoneNumber: "(91) 98000-0002" },
      ], nextPageToken: "pg2" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await searchCompanies(gestor, { keyword: "escolas particulares", city: "Benevides", state: "PA" });
    expect(r.results).toHaveLength(2);
    expect(r.results[0]).toMatchObject({ name: "Escola Saber", city: "Benevides", state: "PA", rating: 4.6, alreadyInBase: false, phoneE164: "+559132220001" });
    expect(r.results[1].alreadyInBase).toBe(true);
    expect(r.nextPageToken).toBe("pg2");

    const saved = await savePlaces(gestor, r.results, { query: r.query, newListName: "Escolas Benevides" });
    expect(saved).toMatchObject({ created: 1, updated: 1 });
    const again = await savePlaces(gestor, r.results, { query: r.query, listId: saved.listId });
    expect(again.created).toBe(0);
    const escola = (await listContacts(gestor, { q: "Escola Saber" })).rows[0];
    expect(escola.source).toBe("google");
    const { contact } = await getContact(gestor, escola.id);
    expect(contact.google_place_id).toBe("place-1");
    expect(contact.website).toBe("https://saber.edu.br");
  });

  it("erros do Google viram mensagens claras", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expectError(searchCompanies(gestor, { keyword: "x restaurante" }), "INTEGRATION", /chave do Google foi recusada/);
  });

  it("limite mensal de pesquisas", async () => {
    await setCompanyLimits(admin, companyId, { max_google_searches_month: "1" });
    await expectError(searchCompanies(gestor, { keyword: "padarias" }), "LIMIT", /pesquisas no Google/);
    await setCompanyLimits(admin, companyId, {});
    delete process.env.GOOGLE_PLACES_API_KEY;
  });
});
