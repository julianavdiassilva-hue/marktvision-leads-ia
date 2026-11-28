import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, withScope } from "@/server/db";
import { createCompany, setCompanyFeature } from "@/server/services/companies";
import { activeBrand, getBranding, publicBrandBySlug, publicLogo, removeLogo, resetBranding, saveBranding, uploadLogo } from "@/server/services/branding";
import { DEFAULT_THEME, defaultThemeVars, inkOn, resolveColors, themeVars, validateTheme } from "@/lib/theme";
import { scopeOf } from "@/server/guards";
import { AppError } from "@/server/errors";
import type { AuthContext } from "@/server/auth/core";
import { ADMIN, loginAs } from "./helpers";

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d4944415478da63f8cfc0f01f0005000201" + "a5b1e1f00000000049454e44ae426082", "hex");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const b64 = (b: Buffer) => b.toString("base64");

let admin: AuthContext, adminA: AuthContext, sellerA: AuthContext, adminB: AuthContext, sellerB: AuthContext;
let A: string, B: string;
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AppError);

beforeAll(async () => {
  admin = await loginAs(ADMIN.username, ADMIN.password);
  A = (await createCompany(admin, { name: "Clínica São José", users: [
    { name: "Admin Alfa", username: "admin.alfa", password: "alfasenha1", role: "company_admin" },
    { name: "Vend Alfa", username: "vend.alfa", password: "alfasenha2", role: "seller" }] })).id;
  B = (await createCompany(admin, { name: "Beta Refrigeração", users: [
    { name: "Admin Beta", username: "admin.beta", password: "betasenha1", role: "company_admin" },
    { name: "Vend Beta", username: "vend.beta", password: "betasenha2", role: "seller" }] })).id;
  [adminA, sellerA, adminB, sellerB] = await Promise.all([loginAs("admin.alfa", "alfasenha1"), loginAs("vend.alfa", "alfasenha2"), loginAs("admin.beta", "betasenha1"), loginAs("vend.beta", "betasenha2")]);
});
afterAll(async () => { await closePool(); });

describe("Identidade visual (White Label)", () => {
  it("endereço de login gerado a partir do nome, sem acentos e único", async () => {
    const a = await getBranding(admin, A);
    expect(a.brand.slug).toBe("clinica-sao-jose");
    expect(a.brand.customized).toBe(false);
    expect(a.brand.colors).toEqual(DEFAULT_THEME);
    const dup = (await createCompany(admin, { name: "Clínica São José" })).id;
    expect((await getBranding(admin, dup)).brand.slug).toBe("clinica-sao-jose-2");
  });

  it("administrador geral personaliza duas empresas de forma independente", async () => {
    await saveBranding(admin, A, { displayName: "Alfa Saúde", primary: "#1d4ed8", secondary: "#1e3a8a", button: "#1D4ED8", sidebar: "#0f172a", background: "#f8fafc", text: "#0f172a" });
    await saveBranding(admin, B, { displayName: "Beta Frio", primary: "#b91c1c", secondary: "#7f1d1d", button: "#ea580c", sidebar: "#fff7ed", background: "#ffffff", text: "#1c1917" });
    await uploadLogo(admin, A, { name: "alfa.png", base64: b64(PNG) });
    await uploadLogo(admin, B, { name: "beta.jpg", base64: b64(JPG) });
    const [ba, bb] = await Promise.all([activeBrand(sellerA), activeBrand(sellerB)]);
    expect(ba).toMatchObject({ displayName: "Alfa Saúde", companyId: A, colors: { primary: "#1d4ed8", button: "#1d4ed8", sidebar: "#0f172a" } });
    expect(bb).toMatchObject({ displayName: "Beta Frio", companyId: B, colors: { primary: "#b91c1c", button: "#ea580c" } });
    expect(ba!.logoUrl).toContain(`/api/marca/${A}/logo`);
    expect(bb!.logoUrl).toContain(`/api/marca/${B}/logo`);
    expect((await publicLogo(A))!.mime_type).toBe("image/png");
    expect((await publicLogo(B))!.mime_type).toBe("image/jpeg");
    expect((await activeBrand(adminA))!.colors).toEqual(ba!.colors); // todos os usuários da empresa veem a mesma identidade
  });

  it("admin da empresa só personaliza se o administrador geral liberar, e somente a própria empresa", async () => {
    const e1 = await err(saveBranding(adminA, A, { primary: "#0f766e" }));
    expect(e1?.code).toBe("FORBIDDEN"); expect(e1?.message).toMatch(/não está liberada/);
    await setCompanyFeature(admin, A, "branding", true);
    const adminA2 = await loginAs("admin.alfa", "alfasenha1");
    expect(adminA2.features).toContain("branding");
    await saveBranding(adminA2, A, { displayName: "Alfa Saúde", primary: "#0f766e", secondary: "#115e59", button: "#0f766e", sidebar: "#0f172a", background: "#f8fafc", text: "#0f172a" });
    expect((await activeBrand(sellerA))!.colors.primary).toBe("#0f766e");
    expect((await activeBrand(sellerB))!.colors.primary).toBe("#b91c1c"); // outra empresa intacta
    expect((await err(saveBranding(adminA2, B, { primary: "#000000" })))?.code).toBe("FORBIDDEN");
    expect((await err(uploadLogo(adminA2, B, { base64: b64(PNG) })))?.code).toBe("FORBIDDEN");
    expect((await err(resetBranding(adminA2, B)))?.code).toBe("FORBIDDEN");
    expect((await err(saveBranding(adminA2, A, { slug: "outro-endereco" })))?.message).toMatch(/Somente o administrador geral/);
    const sellerA2 = await loginAs("vend.alfa", "alfasenha2");
    expect(sellerA2.features).not.toContain("branding");
    expect((await err(saveBranding(sellerA2, A, { primary: "#000000" })))?.code).toBe("FORBIDDEN");
  });

  it("isolamento no banco (RLS): uma empresa não lê a personalização nem os arquivos de outra", async () => {
    const rows = await withScope(scopeOf(adminA), async (db) => ({
      branding: await db.query(`select company_id from company_branding`),
      files: await db.query(`select company_id from company_files`),
    }));
    expect(rows.branding.map((r) => r.company_id)).toEqual([A]);
    expect(rows.files.map((r) => r.company_id)).toEqual([A]);
    const write = await err(withScope(scopeOf(adminA), (db) => db.exec(`update company_branding set primary_color = '#000000' where company_id = $1`, [B])));
    expect(write).toBeNull(); // nenhuma linha visível => nada alterado
    expect((await activeBrand(sellerB))!.colors.primary).toBe("#b91c1c");
  });

  it("validação: hexadecimal, contraste/legibilidade e arquivo da logomarca", async () => {
    expect((await err(saveBranding(admin, A, { primary: "verde" })))?.code).toBe("VALIDATION");
    const low = await err(saveBranding(admin, A, { text: "#dddddd" }));
    expect(low?.code).toBe("VALIDATION"); expect(low?.message).toMatch(/contraste/);
    expect((await err(saveBranding(admin, A, { background: "#111111", text: "#ffffff" })))?.message).toMatch(/fundo precisa ser clara/);
    expect((await err(uploadLogo(admin, A, { base64: b64(Buffer.from("<svg onload=alert(1)></svg>")) })))?.message).toMatch(/PNG, JPG ou WEBP/);
    expect((await err(uploadLogo(admin, A, { base64: b64(Buffer.concat([PNG, Buffer.alloc(1024 * 1024)])) })))?.message).toMatch(/1 MB/);
    expect(validateTheme(DEFAULT_THEME)).toEqual([]);
    expect(themeVars(DEFAULT_THEME)).toEqual(defaultThemeVars()); // sem mudança visual no padrão
    expect(inkOn("#0f172a")).toBe("#ffffff");
    expect(inkOn("#fde047")).not.toBe("#ffffff");
    expect(resolveColors({ primary: "#ABC" }).primary).toBe("#aabbcc");
  });

  it("substituir e remover a logomarca", async () => {
    const before = (await activeBrand(sellerB))!.logoUrl;
    await uploadLogo(admin, B, { base64: b64(PNG) });
    const after = (await activeBrand(sellerB))!.logoUrl;
    expect(after).not.toBe(before);
    expect((await publicLogo(B))!.mime_type).toBe("image/png");
    await removeLogo(admin, B);
    expect((await activeBrand(sellerB))!.logoUrl).toBeNull();
    expect(await publicLogo(B)).toBeNull();
    expect((await publicLogo(A))!.mime_type).toBe("image/png"); // a outra empresa mantém a dela
  });

  it("restaurar o padrão volta à identidade Marktvision sem afetar a outra empresa", async () => {
    await resetBranding(admin, B);
    expect(await activeBrand(sellerB)).toBeNull();
    const pub = await publicBrandBySlug("beta-refrigeracao");
    expect(pub).toMatchObject({ customized: false, colors: DEFAULT_THEME, active: true });
    expect((await activeBrand(sellerA))!.displayName).toBe("Alfa Saúde");
    expect(await publicBrandBySlug("nao-existe")).toBeNull();
  });

  it("endereço de acesso: somente o administrador geral altera e não pode repetir", async () => {
    await saveBranding(admin, B, { slug: "beta" });
    expect((await publicBrandBySlug("beta"))?.companyId).toBe(B);
    const dup = await err(saveBranding(admin, A, { slug: "beta" }));
    expect(dup?.code).toBe("CONFLICT"); expect(dup?.message).toMatch(/endereço de acesso já está em uso/);
  });
});
