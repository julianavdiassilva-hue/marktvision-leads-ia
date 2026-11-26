import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { closePool, withScope } from "@/server/db";
import { login, logout, resolveSession, switchCompany } from "@/server/auth/core";
import { createCompany, getCompany, listCompanies, setCompanyActive, setCompanyFeature, setCompanyLimits } from "@/server/services/companies";
import { changeOwnPassword, createUser, getUserPermissions, listUsers, resetPassword, setUserActive, setUserFeature, updateUser } from "@/server/services/users";
import { createPlan, deletePlan, listPlans, setPlanFeature } from "@/server/services/plans";
import { dashboardSummary } from "@/server/services/dashboard";
import { platformOverview } from "@/server/services/platform";
import { scopeOf } from "@/server/guards";
import { AppError } from "@/server/errors";
import { ADMIN, loginAs, tokenOf } from "./helpers";
import type { AuthContext } from "@/server/auth/core";

let admin: AuthContext;
let companyA: string;
let companyB: string;

const expectError = async (p: Promise<unknown>, code: AppError["code"], msg?: RegExp) => {
  const e = await p.then(() => null, (err) => err);
  expect(e, "deveria ter falhado").toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(code);
  if (msg) expect((e as AppError).message).toMatch(msg);
};

beforeAll(async () => { admin = await loginAs(ADMIN.username, ADMIN.password); });
afterAll(async () => { await closePool(); });

describe("1-6. Empresas, usuários, login e permissões", () => {
  it("cadastra empresa somente com o nome (plano Completo por padrão)", async () => {
    const r = await createCompany(admin, { name: "Clínica Sorriso" });
    companyA = r.id;
    const { company, features } = await getCompany(admin, companyA);
    expect(company.name).toBe("Clínica Sorriso");
    expect(company.document).toBeNull();
    expect(company.plan_name).toBe("Completo");
    expect(features.every((f) => f.enabled)).toBe(true);
  });

  it("rejeita empresa sem nome com mensagem em português", async () => {
    await expectError(createCompany(admin, { name: "   " }), "VALIDATION", /nome da empresa/);
  });

  it("cria empresa + administrador + 2 vendedores na mesma tela (transação única)", async () => {
    const r = await createCompany(admin, {
      name: "Refrigeração Norte",
      users: [
        { name: "Ana Gestora", username: "ana.norte", password: "senhaana1", role: "company_admin" },
        { name: "Bruno Vendas", username: "bruno.norte", password: "senhabruno1", role: "seller" },
        { name: "Carla Vendas", username: "carla.norte", password: "senhacarla1", role: "seller" },
      ],
    });
    companyB = r.id;
    expect(r.users.map((u) => u.username)).toEqual(["ana.norte", "bruno.norte", "carla.norte"]);
  });

  it("não grava empresa pela metade se um acesso for inválido", async () => {
    const before = (await listCompanies(admin)).length;
    await expectError(createCompany(admin, {
      name: "Empresa Incompleta",
      users: [{ name: "X", username: "ana.norte", password: "qualquer123", role: "seller" }],
    }), "CONFLICT", /Acesso 1/);
    expect((await listCompanies(admin)).length).toBe(before);
  });

  it("cria admin e vendedores da empresa A depois do cadastro", async () => {
    await createUser(admin, { name: "Diego Admin", username: "Diego.Sorriso", password: "diegosenha", role: "company_admin", companyId: companyA });
    await createUser(admin, { name: "Eva Vendedora", username: "eva.sorriso", password: "evasenha1", role: "seller", companyId: companyA });
    await createUser(admin, { name: "Fábio Vendedor", username: "fabio.sorriso", password: "fabiosenha", role: "seller", companyId: companyA });
    const users = await listUsers(admin, { companyId: companyA });
    expect(users.map((u) => u.username).sort()).toEqual(["diego.sorriso", "eva.sorriso", "fabio.sorriso"]);
  });

  it("login por nome de usuário funciona para cada perfil", async () => {
    const diego = await loginAs("diego.sorriso", "diegosenha");
    expect(diego.role).toBe("company_admin");
    expect(diego.company?.id).toBe(companyA);
    const eva = await loginAs("EVA.SORRISO", "evasenha1");
    expect(eva.role).toBe("seller");
    const ana = await loginAs("ana.norte", "senhaana1");
    expect(ana.company?.id).toBe(companyB);
  });

  it("rejeita senha incorreta e senha fraca", async () => {
    await expectError(login("eva.sorriso", "errada"), "UNAUTHENTICATED", /incorretos/);
    await expectError(login("nao.existe", "qualquer"), "UNAUTHENTICATED", /incorretos/);
    await expectError(createUser(admin, { name: "Z", username: "zzz", password: "123", role: "seller", companyId: companyA }), "VALIDATION", /8 caracteres/);
  });

  it("vendedor recebe apenas funcionalidades padrão; admin da empresa recebe todas", async () => {
    const eva = await loginAs("eva.sorriso", "evasenha1");
    expect(eva.features).toContain("crm");
    expect(eva.features).toContain("conversations");
    expect(eva.features).not.toContain("sales_team");
    expect(eva.features).not.toContain("whatsapp");
    const diego = await loginAs("diego.sorriso", "diegosenha");
    expect(diego.features.length).toBe(18);
  });

  it("liberação/bloqueio por empresa altera imediatamente as permissões", async () => {
    await setCompanyFeature(admin, companyB, "campaigns", false);
    await setCompanyFeature(admin, companyB, "google_search", false);
    const ana = await loginAs("ana.norte", "senhaana1");
    expect(ana.features).not.toContain("campaigns");
    expect(ana.features).not.toContain("google_search");
    expect(ana.features).toContain("crm");
    const det = await getCompany(admin, companyB);
    expect(det.features.find((f) => f.key === "campaigns")?.override).toBe(false);
    // religar remove a exceção (volta a seguir o plano)
    await setCompanyFeature(admin, companyB, "google_search", true);
    const det2 = await getCompany(admin, companyB);
    expect(det2.features.find((f) => f.key === "google_search")?.override).toBeNull();
  });

  it("permissão individual por usuário (conceder e retirar)", async () => {
    const diego = await loginAs("diego.sorriso", "diegosenha");
    const eva = (await listUsers(diego)).find((u) => u.username === "eva.sorriso")!;
    await setUserFeature(diego, eva.id, "campaigns", true);
    await setUserFeature(diego, eva.id, "crm", false);
    const evaCtx = await loginAs("eva.sorriso", "evasenha1");
    expect(evaCtx.features).toContain("campaigns");
    expect(evaCtx.features).not.toContain("crm");
    const perms = await getUserPermissions(diego, eva.id);
    expect(perms.permissions.find((p) => p.key === "crm")?.override).toBe(false);
  });

  it("permissão individual não ultrapassa o que a empresa contratou", async () => {
    const ana = await loginAs("ana.norte", "senhaana1");
    const bruno = (await listUsers(ana)).find((u) => u.username === "bruno.norte")!;
    await expectError(setUserFeature(ana, bruno.id, "campaigns", true), "FORBIDDEN", /não está liberada para a empresa/);
  });
});

describe("Isolamento entre empresas", () => {
  it("admin da empresa B não lista nem altera usuários da empresa A", async () => {
    const ana = await loginAs("ana.norte", "senhaana1");
    const list = await listUsers(ana, { companyId: companyA });
    expect(list.every((u) => u.company_id === companyB)).toBe(true);
    const evaId = (await listUsers(admin, { companyId: companyA })).find((u) => u.username === "eva.sorriso")!.id;
    await expectError(resetPassword(ana, evaId, "invasor123"), "NOT_FOUND");
    await expectError(setUserActive(ana, evaId, false), "NOT_FOUND");
    await expectError(updateUser(ana, evaId, { name: "Hack", username: "hack" }), "NOT_FOUND");
    await expectError(createUser(ana, { name: "X", username: "x.invasor", password: "invasor123", role: "seller", companyId: companyA }), "FORBIDDEN");
  });

  it("RLS no banco bloqueia leitura cruzada mesmo com SQL direto", async () => {
    const ana = await loginAs("ana.norte", "senhaana1");
    const rows = await withScope(scopeOf(ana), async (db) => ({
      companies: await db.query(`select id from companies`),
      memberships: await db.query(`select company_id from company_memberships`),
      users: await db.query<{ username: string }>(`select username from users`),
      pipelines: await db.query<{ company_id: string }>(`select company_id from pipelines`),
    }));
    expect(rows.companies.map((r) => r.id)).toEqual([companyB]);
    expect(rows.memberships.every((r) => r.company_id === companyB)).toBe(true);
    expect(rows.users.map((u) => u.username)).not.toContain("eva.sorriso");
    expect(rows.pipelines.every((p) => p.company_id === companyB)).toBe(true);
  });

  it("RLS bloqueia escrita de dados em outra empresa", async () => {
    const ana = await loginAs("ana.norte", "senhaana1");
    const e = await withScope(scopeOf(ana), (db) =>
      db.exec(`insert into contacts (company_id, name) values ($1, 'invasor')`, [companyA])).then(() => null, (x) => x);
    expect(String(e?.message)).toMatch(/row-level security/);
    const upd = await withScope(scopeOf(ana), (db) => db.exec(`update companies set name = 'hack' where id = $1`, [companyA]));
    expect(upd).toBe(0);
  });

  it("vendedor não acessa funções administrativas", async () => {
    const bruno = await loginAs("bruno.norte", "senhabruno1");
    await expectError(listUsers(bruno), "FORBIDDEN");
    await expectError(listCompanies(bruno), "FORBIDDEN", /administrador geral/);
    await expectError(createCompany(bruno, { name: "x" }), "FORBIDDEN");
    await expectError(listPlans(bruno), "FORBIDDEN");
    await expectError(platformOverview(bruno), "FORBIDDEN");
  });

  it("dashboard retorna apenas dados reais da própria empresa", async () => {
    const ana = await loginAs("ana.norte", "senhaana1");
    const d = await dashboardSummary(ana);
    expect(d.contacts).toBe(0);
    expect(d.sales_amount).toBe("0");
  });
});

describe("Sessões, desativações e segurança da autenticação", () => {
  it("desativar empresa derruba sessões e bloqueia login", async () => {
    const r = await createCompany(admin, { name: "Escola Temporária", users: [{ name: "Gil", username: "gil.escola", password: "gilsenha1", role: "company_admin" }] });
    const gil = await loginAs("gil.escola", "gilsenha1");
    await setCompanyActive(admin, r.id, false);
    expect(await resolveSession(tokenOf(gil))).toBeNull();
    await expectError(login("gil.escola", "gilsenha1"), "FORBIDDEN", /desativad/);
    await setCompanyActive(admin, r.id, true);
    expect((await loginAs("gil.escola", "gilsenha1")).company?.id).toBe(r.id);
  });

  it("desativar usuário invalida a sessão imediatamente", async () => {
    const diego = await loginAs("diego.sorriso", "diegosenha");
    const fabio = await loginAs("fabio.sorriso", "fabiosenha");
    await setUserActive(diego, fabio.user.id, false);
    expect(await resolveSession(tokenOf(fabio))).toBeNull();
    await expectError(login("fabio.sorriso", "fabiosenha"), "FORBIDDEN");
    await setUserActive(diego, fabio.user.id, true);
    await loginAs("fabio.sorriso", "fabiosenha");
  });

  it("não permite desativar a si mesmo", async () => {
    const diego = await loginAs("diego.sorriso", "diegosenha");
    await expectError(setUserActive(diego, diego.user.id, false), "FORBIDDEN");
  });

  it("redefinir senha invalida sessões antigas e senha é armazenada com hash", async () => {
    const fabio = await loginAs("fabio.sorriso", "fabiosenha");
    await resetPassword(admin, fabio.user.id, "novasenha99");
    expect(await resolveSession(tokenOf(fabio))).toBeNull();
    await loginAs("fabio.sorriso", "novasenha99");
    const c = new Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL });
    await c.connect();
    const { rows } = await c.query(`select password_hash from users where username = 'fabio.sorriso'`);
    const { rows: s } = await c.query(`select token_hash from sessions limit 1`);
    await c.end();
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(s[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("troca da própria senha exige a senha atual", async () => {
    const carla = await loginAs("carla.norte", "senhacarla1");
    await expectError(changeOwnPassword(carla, "errada", "outrasenha1"), "VALIDATION", /atual está incorreta/);
    await changeOwnPassword(carla, "senhacarla1", "outrasenha1");
    await loginAs("carla.norte", "outrasenha1");
  });

  it("bloqueia força bruta após várias falhas", async () => {
    for (let i = 0; i < 8; i++) await login("bruno.norte", "errada").catch(() => {});
    await expectError(login("bruno.norte", "senhabruno1"), "RATE_LIMIT", /Muitas tentativas/);
  });

  it("logout invalida o token; token forjado não autentica", async () => {
    const ana = await loginAs("ana.norte", "senhaana1");
    await logout(tokenOf(ana));
    expect(await resolveSession(tokenOf(ana))).toBeNull();
    expect(await resolveSession("token-falso")).toBeNull();
  });

  it("admin geral entra no ambiente de uma empresa e vê as funcionalidades dela", async () => {
    const a = await loginAs(ADMIN.username, ADMIN.password);
    await switchCompany(a, companyB);
    const inB = (await resolveSession(tokenOf(a)))!;
    expect(inB.company?.id).toBe(companyB);
    expect(inB.features).not.toContain("campaigns");
    const ana = await loginAs("ana.norte", "senhaana1");
    await expectError(switchCompany(ana, companyA), "FORBIDDEN");
  });
});

describe("Planos e limites", () => {
  it("cria plano com funcionalidades e limites; aplica à empresa", async () => {
    const p = await createPlan(admin, { name: "WhatsApp + CRM", features: ["whatsapp", "crm", "conversations", "contacts", "sales_team"], limits: { max_sellers: "1" } });
    const r = await createCompany(admin, { name: "Loja Plano Básico", planId: p.id, users: [
      { name: "Hugo", username: "hugo.loja", password: "hugosenha1", role: "company_admin" },
      { name: "Iris", username: "iris.loja", password: "irissenha1", role: "seller" },
    ] });
    const hugo = await loginAs("hugo.loja", "hugosenha1");
    expect(hugo.features.sort()).toEqual(["contacts", "conversations", "crm", "sales_team", "whatsapp"]);
    await expectError(createUser(hugo, { name: "J", username: "j.loja", password: "jotasenha1", role: "seller", companyId: r.id }), "LIMIT", /1 vendedores/);
    await setCompanyLimits(admin, r.id, { max_sellers: "3" });
    await createUser(hugo, { name: "J", username: "j.loja", password: "jotasenha1", role: "seller", companyId: r.id });
    await setPlanFeature(admin, p.id, "reports", true);
    expect((await loginAs("hugo.loja", "hugosenha1")).features).toContain("reports");
    await expectError(deletePlan(admin, p.id), "CONFLICT", /em uso/);
  });

  it("login duplicado é rejeitado em qualquer empresa", async () => {
    await expectError(createUser(admin, { name: "Outro", username: "eva.sorriso", password: "outrasenha", role: "seller", companyId: companyB }), "CONFLICT", /já está em uso/);
  });
});
