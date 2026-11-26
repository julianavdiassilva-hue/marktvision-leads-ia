/**
 * Teste ponta a ponta da Fase 01 no navegador real (Playwright + Chromium).
 * Usa o banco de TESTES: reseta, cria o admin, sobe `next start` na porta 3100.
 * Pré-requisito: `npm run build`.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { resetDatabase } from "../../scripts/reset";
import { seedPlatformAdmin } from "../../scripts/seed";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.E2E_SHOTS ?? "docs/screenshots";
mkdirSync(SHOTS, { recursive: true });

const results: { name: string; ok: boolean; error?: string }[] = [];
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name}`); }
  catch (e) { results.push({ name, ok: false, error: (e as Error).message.split("\n")[0] }); console.log(`  ✗ ${name}\n    ${(e as Error).message.split("\n")[0]}`); }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

async function login(page: Page, user: string, pass: string) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`);
  await page.fill("#username", user);
  await page.fill("#password", pass);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/", { timeout: 15000 }), page.click("button[type=submit]")]);
}
const navLabels = async (page: Page) => (await page.locator("aside nav ul a").allInnerTexts()).map((t) => t.replace(/F\d+$/, "").trim());

async function main() {
  await resetDatabase(process.env.TEST_DATABASE_OWNER_URL, false);
  await seedPlatformAdmin(process.env.TEST_DATABASE_OWNER_URL, { name: "Administrador Marktvision", username: "admin", password: "admin-e2e-2026" });
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: "ignore", detached: true,
  });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

    console.log("Fase 01 — fluxo no navegador");
    await step("login inválido mostra erro em português", async () => {
      await page.goto(`${BASE}/login`);
      await page.screenshot({ path: `${SHOTS}/01-login.png` });
      await page.fill("#username", "admin"); await page.fill("#password", "errada123"); await page.click("button[type=submit]");
      await page.getByText("Login ou senha incorretos.").waitFor();
    });
    await step("acesso sem login redireciona ao login", async () => {
      await page.context().clearCookies();
      await page.goto(`${BASE}/admin/empresas`);
      assert(page.url().includes("/login?next=%2Fadmin%2Fempresas"), "não redirecionou: " + page.url());
    });
    await step("administrador geral entra", async () => {
      await login(page, "admin", "admin-e2e-2026");
      await page.waitForURL(/\/admin\/empresas$/);
      const labels = await navLabels(page);
      for (const l of ["Empresas", "Usuários", "Planos e permissões", "Administração da plataforma"]) assert(labels.includes(l), `menu sem ${l}`);
    });
    await step("1. cadastra empresa somente com o nome", async () => {
      await page.getByRole("button", { name: "Nova empresa" }).click();
      await page.fill("#name", "Clínica Odonto Belém");
      await page.getByRole("button", { name: "Cadastrar empresa" }).click();
      await page.waitForURL(/\/admin\/empresas\/[0-9a-f-]{36}/);
      await page.getByRole("heading", { name: "Clínica Odonto Belém" }).waitFor();
    });
    await step("2-3. cadastra empresa + administrador + 2 vendedores na mesma tela", async () => {
      await page.goto(`${BASE}/admin/empresas`);
      await page.getByRole("button", { name: "Nova empresa" }).click();
      await page.fill("#name", "Refrigeração Pará");
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Adicionar acesso" }).click();
      const rows = [["Paula Gestora", "paula.ref", "paulasenha1", "company_admin"], ["Rui Vendas", "rui.ref", "ruisenha12", "seller"], ["Sara Vendas", "sara.ref", "sarasenha1", "seller"]];
      for (const [i, [n, u, p, r]] of rows.entries()) {
        await page.fill(`input[name="users[${i}][name]"]`, n); await page.fill(`input[name="users[${i}][username]"]`, u);
        await page.fill(`input[name="users[${i}][password]"]`, p); await page.selectOption(`select[name="users[${i}][role]"]`, r);
      }
      await page.screenshot({ path: `${SHOTS}/02-nova-empresa.png` });
      await page.getByRole("button", { name: "Cadastrar empresa" }).click();
      await page.waitForURL(/\/admin\/empresas\/[0-9a-f-]{36}/);
      for (const u of ["paula.ref", "rui.ref", "sara.ref"]) await page.getByText(u, { exact: true }).waitFor();
    });
    await step("4. bloqueia funcionalidades da empresa (Campanhas e WhatsApp)", async () => {
      for (const f of ["Campanhas", "WhatsApp Comercial"]) {
        const sw = page.getByRole("switch", { name: f, exact: true });
        await sw.click();
        await page.waitForFunction((n) => document.querySelector(`[role=switch][aria-label="${n}"]`)?.getAttribute("aria-checked") === "false", f);
      }
      await page.waitForTimeout(800);
      await page.reload();
      assert((await page.getByRole("switch", { name: "Campanhas", exact: true }).getAttribute("aria-checked")) === "false", "não persistiu");
      await page.getByText("Bloqueada individualmente").first().waitFor();
      await page.screenshot({ path: `${SHOTS}/03-empresa-funcionalidades.png`, fullPage: true });
    });
    await step("5-6. administrador da empresa: menu respeita o plano", async () => {
      await login(page, "paula.ref", "paulasenha1");
      const labels = await navLabels(page);
      assert(!labels.includes("Campanhas") && !labels.includes("WhatsApp Comercial"), "menu exibe módulo bloqueado: " + labels);
      assert(labels.includes("Equipe Comercial") && labels.includes("CRM Comercial"), "menu incompleto: " + labels);
      assert(!labels.includes("Empresas"), "admin da empresa vê área da plataforma");
      await page.screenshot({ path: `${SHOTS}/04-dashboard-admin-empresa.png` });
    });
    await step("acesso indevido por URL é bloqueado no servidor (admin da empresa)", async () => {
      for (const url of ["/campanhas", "/whatsapp", "/admin/empresas", "/admin/usuarios", "/admin/planos", "/admin/plataforma"]) {
        const res = await page.request.get(BASE + url, { maxRedirects: 0 });
        assert(res.status() === 307 && (res.headers()["location"] ?? "").endsWith("/acesso-negado"), `${url} => HTTP ${res.status()}`);
        await page.goto(BASE + url);
        assert(page.url().endsWith("/acesso-negado"), `${url} acessível: ${page.url()}`);
      }
    });
    await step("administrador da empresa cria vendedor pela Equipe Comercial", async () => {
      await page.goto(`${BASE}/equipe`);
      await page.getByRole("button", { name: "Novo vendedor" }).click();
      await page.fill("#name", "Tiago Novo"); await page.fill("#username", "tiago.ref"); await page.fill("#password", "tiagosenha1");
      await page.getByRole("button", { name: "Criar acesso" }).click();
      await page.getByText("tiago.ref", { exact: true }).waitFor();
      await page.screenshot({ path: `${SHOTS}/05-equipe.png` });
    });
    await step("permissão individual: retira CRM do vendedor Rui", async () => {
      await page.getByRole("link", { name: "Rui Vendas" }).click();
      await page.getByRole("switch", { name: "CRM", exact: true }).click();
      await page.getByText("Retirada individualmente").waitFor();
    });
    await step("vendedor: menu reduzido e sem áreas administrativas", async () => {
      await login(page, "rui.ref", "ruisenha12");
      const labels = await navLabels(page);
      assert(!labels.includes("CRM Comercial"), "CRM ainda visível: " + labels);
      assert(!labels.includes("Equipe Comercial") && !labels.includes("Chatbot IA"), "vendedor vê área admin: " + labels);
      assert(labels.includes("Conversas"), "vendedor sem Conversas");
      for (const url of ["/crm", "/equipe", "/chatbot", "/contexto", "/admin/empresas"]) {
        await page.goto(BASE + url);
        assert(page.url().endsWith("/acesso-negado"), `${url} acessível ao vendedor`);
      }
    });
    await step("isolamento: admin da empresa A não abre usuário da empresa B por URL", async () => {
      await login(page, "admin", "admin-e2e-2026");
      await page.goto(`${BASE}/admin/usuarios`);
      const href = await page.getByRole("link", { name: "Paula Gestora" }).getAttribute("href");
      const paulaId = href!.split("/").pop();
      // cria admin de outra empresa
      await page.getByRole("button", { name: "Novo acesso" }).click();
      await page.fill("#name", "Ursula Odonto"); await page.fill("#username", "ursula.odonto"); await page.fill("#password", "ursulasenha");
      await page.selectOption("#role", "company_admin");
      await page.selectOption("#companyId", { label: "Clínica Odonto Belém" });
      await page.getByRole("button", { name: "Criar acesso" }).click();
      await page.getByText("ursula.odonto", { exact: true }).waitFor();
      await login(page, "ursula.odonto", "ursulasenha");
      await page.goto(`${BASE}/equipe/${paulaId}`);
      await page.getByText("Página ou registro não encontrado").waitFor();
      assert(!(await page.getByText("Paula Gestora").count()), "dados de outra empresa exibidos");
    });
    await step("admin geral entra no ambiente de uma empresa pelo seletor", async () => {
      await login(page, "admin", "admin-e2e-2026");
      await page.selectOption("#company-switch", { label: "Refrigeração Pará" });
      await page.waitForURL(/\/dashboard$/);
      const labels = await navLabels(page);
      assert(labels.includes("Dashboard") && !labels.includes("Campanhas"), "menu não reflete a empresa: " + labels);
      await page.goto(`${BASE}/admin/plataforma`);
      await page.screenshot({ path: `${SHOTS}/06-plataforma.png`, fullPage: true });
    });
    await step("desativar empresa bloqueia o login dos usuários", async () => {
      await page.goto(`${BASE}/admin/empresas`);
      await page.getByRole("link", { name: "Clínica Odonto Belém" }).click();
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Desativar empresa" }).click();
      await page.getByRole("button", { name: "Reativar empresa" }).waitFor();
      await page.context().clearCookies();
      await page.goto(`${BASE}/login`);
      await page.fill("#username", "ursula.odonto"); await page.fill("#password", "ursulasenha"); await page.click("button[type=submit]");
      await page.getByText(/empresa estão desativados/).waitFor();
    });
    await step("responsividade: celular sem rolagem horizontal", async () => {
      const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      await m.goto(`${BASE}/login`);
      await m.fill("#username", "paula.ref"); await m.fill("#password", "paulasenha1");
      await Promise.all([m.waitForURL(/dashboard/), m.click("button[type=submit]")]);
      const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert(!overflow, "rolagem horizontal no celular");
      await m.screenshot({ path: `${SHOTS}/07-celular-dashboard.png` });
      await m.getByRole("button", { name: "Abrir menu" }).click();
      await m.getByRole("link", { name: "Equipe Comercial" }).click();
      await m.waitForURL(/\/equipe$/);
      await m.close();
    });
    await browser.close();
  } finally {
    try { process.kill(-server.pid!); } catch {}
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} cenários aprovados`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
