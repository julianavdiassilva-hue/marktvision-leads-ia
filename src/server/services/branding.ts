import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope, SYSTEM, type Db } from "../db";
import { forbidden, invalid, notFound } from "../errors";
import { hasFeature, isCompanyAdmin, scopeOf } from "../guards";
import { audit } from "../audit";
import { uuid, parse } from "../validation";
import { getFile, putFile, removeFiles, sniffImage } from "../storage";
import { DEFAULT_THEME, normalizeHex, resolveColors, THEME_FIELDS, validateTheme, type ThemeColors, type ThemeKey } from "@/lib/theme";

export const LOGO_MAX_BYTES = 1024 * 1024; // 1 MB
const LOGO_KEY = "branding/logo";

type Row = {
  company_id: string; display_name: string | null; logo_key: string | null; logo_version: number; updated_at: string;
  primary_color: string | null; secondary_color: string | null; button_color: string | null;
  sidebar_color: string | null; background_color: string | null; text_color: string | null;
};
const COL: Record<ThemeKey, keyof Row> = {
  primary: "primary_color", secondary: "secondary_color", button: "button_color", sidebar: "sidebar_color", background: "background_color", text: "text_color",
};

/** Identidade visual pronta para aplicar (sem dados internos). */
export type Brand = {
  companyId: string; companyName: string; slug: string; displayName: string | null; colors: ThemeColors;
  customized: boolean; logoUrl: string | null;
};

const logoUrl = (companyId: string, version: number) => `/api/marca/${companyId}/logo?v=${version}`;

function toBrand(company: { id: string; name: string; slug: string }, row: Row | null): Brand {
  const colors = resolveColors(Object.fromEntries(THEME_FIELDS.map((f) => [f.key, row?.[COL[f.key]] as string | null])));
  return {
    companyId: company.id, companyName: company.name, slug: company.slug, displayName: row?.display_name ?? null, colors,
    customized: !!row, logoUrl: row?.logo_key ? logoUrl(company.id, row.logo_version) : null,
  };
}

/** Quem pode personalizar: administrador geral (qualquer empresa) ou admin da PRÓPRIA empresa com a funcionalidade liberada. */
export function canEditBranding(ctx: AuthContext, companyId: string) {
  if (ctx.user.isPlatformAdmin) return true;
  return ctx.company?.id === companyId && isCompanyAdmin(ctx) && hasFeature(ctx, "branding");
}
function guard(ctx: AuthContext, companyId: string) {
  parse(uuid, companyId);
  if (canEditBranding(ctx, companyId)) return;
  if (ctx.company?.id === companyId && isCompanyAdmin(ctx))
    throw forbidden("A personalização da identidade visual não está liberada para sua empresa. Solicite ao administrador geral.");
  throw forbidden("Você não tem permissão para alterar a identidade visual desta empresa.");
}

async function load(db: Db, companyId: string) {
  const company = await db.maybeOne<{ id: string; name: string; slug: string }>(`select id, name, slug from companies where id = $1`, [companyId]);
  if (!company) throw notFound("Empresa não encontrada.");
  const row = await db.maybeOne<Row>(`select * from company_branding where company_id = $1`, [companyId]);
  return { company, row };
}

export async function getBranding(ctx: AuthContext, companyId: string) {
  guard(ctx, companyId);
  return withScope(scopeOf(ctx), async (db) => {
    const { company, row } = await load(db, companyId);
    return { brand: toBrand(company, row), updatedAt: row?.updated_at ?? null, canEditSlug: ctx.user.isPlatformAdmin };
  });
}

/** Identidade da empresa ativa na sessão (layout). Nunca aplicada no painel do administrador geral. */
export async function activeBrand(ctx: AuthContext): Promise<Brand | null> {
  if (!ctx.company) return null;
  return withScope(scopeOf(ctx), async (db) => {
    const { company, row } = await load(db, ctx.company!.id).catch(() => ({ company: null, row: null }));
    return company && row ? toBrand(company, row) : null;
  });
}

const colorField = z.string().trim().optional().transform((v, c) => {
  if (!v) return null;
  const h = normalizeHex(v);
  if (!h) { c.addIssue({ code: "custom", message: "Use o formato hexadecimal, por exemplo #008C48." }); return z.NEVER; }
  return h;
});
const saveSchema = z.object({
  displayName: z.string().trim().max(60, "O nome exibido pode ter no máximo 60 caracteres.").optional().transform((v) => v || null),
  slug: z.string().trim().toLowerCase().optional().transform((v) => v || undefined)
    .refine((v) => v === undefined || (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) && v.length >= 2 && v.length <= 60),
      "Endereço de acesso: use letras minúsculas, números e hífens (2 a 60 caracteres)."),
  primary: colorField, secondary: colorField, button: colorField, sidebar: colorField, background: colorField, text: colorField,
});

export async function saveBranding(ctx: AuthContext, companyId: string, raw: z.input<typeof saveSchema>) {
  guard(ctx, companyId);
  const input = parse(saveSchema, raw);
  const colors = resolveColors(input);
  const problems = validateTheme(colors);
  if (problems.length) throw invalid(problems.join(" "));
  if (input.slug !== undefined && !ctx.user.isPlatformAdmin) throw forbidden("Somente o administrador geral altera o endereço de acesso.");
  return withScope(scopeOf(ctx), async (db) => {
    await load(db, companyId);
    // Cor igual à padrão é gravada como vazia (segue o padrão Marktvision).
    const val = (k: ThemeKey) => (colors[k] === DEFAULT_THEME[k] ? null : colors[k]);
    await db.exec(
      `insert into company_branding (company_id, display_name, primary_color, secondary_color, button_color, sidebar_color, background_color, text_color, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (company_id) do update set display_name = excluded.display_name, primary_color = excluded.primary_color, secondary_color = excluded.secondary_color,
         button_color = excluded.button_color, sidebar_color = excluded.sidebar_color, background_color = excluded.background_color,
         text_color = excluded.text_color, updated_by = excluded.updated_by`,
      [companyId, input.displayName, val("primary"), val("secondary"), val("button"), val("sidebar"), val("background"), val("text"), ctx.user.id]);
    if (input.slug !== undefined) await db.exec(`update companies set slug = $2 where id = $1`, [companyId, input.slug]);
    await audit(db, ctx, "branding.update", { type: "company", id: companyId, companyId }, { colors, displayName: input.displayName, slug: input.slug });
  });
}

export async function uploadLogo(ctx: AuthContext, companyId: string, file: { name?: string; base64: string }) {
  guard(ctx, companyId);
  const buf = Buffer.from(file?.base64 ?? "", "base64");
  if (!buf.length) throw invalid("Selecione a imagem da logomarca.");
  if (buf.length > LOGO_MAX_BYTES) throw invalid("A logomarca deve ter no máximo 1 MB.");
  const mime = sniffImage(buf);
  if (!mime) throw invalid("Formato não aceito. Envie a logomarca em PNG, JPG ou WEBP (de preferência PNG com fundo transparente).");
  return withScope(scopeOf(ctx), async (db) => {
    await load(db, companyId);
    await putFile(db, companyId, LOGO_KEY, buf, mime, ctx.user.id);
    const r = await db.one<{ logo_version: number }>(
      `insert into company_branding (company_id, logo_key, logo_version, updated_by) values ($1, $2, 1, $3)
       on conflict (company_id) do update set logo_key = excluded.logo_key, logo_version = company_branding.logo_version + 1, updated_by = excluded.updated_by
       returning logo_version`, [companyId, LOGO_KEY, ctx.user.id]);
    await audit(db, ctx, "branding.logo_upload", { type: "company", id: companyId, companyId }, { mime, size: buf.length });
    return { url: logoUrl(companyId, r.logo_version) };
  });
}

export async function removeLogo(ctx: AuthContext, companyId: string) {
  guard(ctx, companyId);
  return withScope(scopeOf(ctx), async (db) => {
    await load(db, companyId);
    await removeFiles(db, companyId, "branding/");
    await db.exec(`update company_branding set logo_key = null, logo_version = logo_version + 1, updated_by = $2 where company_id = $1`, [companyId, ctx.user.id]);
    await audit(db, ctx, "branding.logo_remove", { type: "company", id: companyId, companyId });
  });
}

/** Restaura o padrão Marktvision: apaga cores, nome exibido e logomarca (o endereço de acesso é mantido). */
export async function resetBranding(ctx: AuthContext, companyId: string) {
  guard(ctx, companyId);
  return withScope(scopeOf(ctx), async (db) => {
    await load(db, companyId);
    await removeFiles(db, companyId, "branding/");
    await db.exec(`delete from company_branding where company_id = $1`, [companyId]);
    await audit(db, ctx, "branding.reset", { type: "company", id: companyId, companyId });
  });
}

// ---------- Acesso público (antes do login): somente dados de apresentação ----------

/** Tela de login da empresa: /entrar/<slug>. */
export async function publicBrandBySlug(slug: string): Promise<(Brand & { active: boolean }) | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  return withScope(SYSTEM, async (db) => {
    const c = await db.maybeOne<{ id: string; name: string; slug: string; is_active: boolean }>(`select id, name, slug, is_active from companies where slug = $1`, [slug]);
    if (!c) return null;
    const row = await db.maybeOne<Row>(`select * from company_branding where company_id = $1`, [c.id]);
    return { ...toBrand(c, row), active: c.is_active };
  });
}

/** Arquivo da logomarca (rota pública /api/marca/<empresa>/logo). Só lê a chave da logomarca daquela empresa. */
export async function publicLogo(companyId: string) {
  if (!uuid.safeParse(companyId).success) return null;
  return withScope(SYSTEM, async (db) => {
    const row = await db.maybeOne<{ logo_key: string | null }>(`select logo_key from company_branding where company_id = $1`, [companyId]);
    return row?.logo_key ? getFile(db, companyId, row.logo_key) : null;
  });
}

/** Endereço de login da empresa do usuário (para voltar à tela personalizada ao sair). */
export async function companySlugFor(ctx: AuthContext) {
  if (!ctx.company || ctx.user.isPlatformAdmin) return null;
  return withScope(scopeOf(ctx), async (db) => (await db.maybeOne<{ slug: string }>(`select slug from companies where id = $1`, [ctx.company!.id]))?.slug ?? null);
}
