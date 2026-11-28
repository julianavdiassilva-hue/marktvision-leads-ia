/**
 * Identidade visual (White Label) — cálculo de cores, contraste e variáveis CSS.
 * Código puro: usado no servidor (validação/aplicação) e no navegador (pré-visualização).
 */
export const THEME_FIELDS = [
  { key: "primary", label: "Cor principal", hint: "Ícones, destaques, gráficos e itens ativos" },
  { key: "secondary", label: "Cor secundária", hint: "Links, textos de destaque e item ativo do menu" },
  { key: "button", label: "Cor dos botões", hint: "Botões principais (o texto do botão se ajusta sozinho)" },
  { key: "sidebar", label: "Cor do menu lateral", hint: "Fundo do menu (os textos se ajustam sozinhos)" },
  { key: "background", label: "Cor de fundo", hint: "Fundo das telas — use um tom claro" },
  { key: "text", label: "Cor dos textos", hint: "Textos principais — use um tom escuro" },
] as const;
export type ThemeKey = (typeof THEME_FIELDS)[number]["key"];
export type ThemeColors = Record<ThemeKey, string>;

/** Padrão Marktvision (fundo branco, verde #008C48). */
export const DEFAULT_THEME: ThemeColors = {
  primary: "#008c48", secondary: "#006b38", button: "#008c48", sidebar: "#f7f9f8", background: "#ffffff", text: "#172b22",
};
/** Valores atuais do sistema — usados quando as cores de origem são as padrão (aparência idêntica). */
const DEFAULT_VARS: Record<string, string> = {
  "--color-brand": "#008c48", "--color-brand-dark": "#006b38", "--color-brand-light": "#e8f5ec", "--color-brand-50": "#f3faf5",
  "--color-surface": "#f7f9f8", "--color-ink": "#172b22", "--color-muted": "#55665d", "--color-line": "#e2e9e5", "--color-page": "#ffffff",
  "--color-btn": "#008c48", "--color-btn-hover": "#006b38", "--color-btn-ink": "#ffffff",
  "--color-sidebar": "#f7f9f8", "--color-sidebar-ink": "#172b22", "--color-sidebar-muted": "#55665d", "--color-sidebar-hover": "#ffffff",
  "--color-sidebar-active": "#e8f5ec", "--color-sidebar-active-ink": "#006b38", "--color-sidebar-icon": "#008c48",
};
export const defaultThemeVars = () => ({ ...DEFAULT_VARS });

export function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let s = v.trim().toLowerCase();
  if (!s.startsWith("#")) s = "#" + s;
  if (/^#[0-9a-f]{3}$/.test(s)) s = "#" + s.slice(1).split("").map((c) => c + c).join("");
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");
/** Mistura: peso `w` da cor `a` sobre `b`. */
export const mix = (a: string, b: string, w: number) => { const A = rgb(a), B = rgb(b); return hex(A.map((x, i) => x * w + B[i] * (1 - w))); };
export function luminance(h: string) {
  const [r, g, b] = rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const DARK_INK = "#0f1a14";
/** Cor de texto legível sobre um fundo (branco ou quase preto, o de maior contraste). */
export const inkOn = (bg: string) => (contrast("#ffffff", bg) >= contrast(DARK_INK, bg) ? "#ffffff" : DARK_INK);
const isDark = (h: string) => inkOn(h) === "#ffffff";
/** Aproxima `color` de `toward` até atingir o contraste mínimo com `bg` (e `bg2`, se houver). */
function ensureContrast(color: string, bg: string, min: number, bg2?: string) {
  const toward = isDark(bg) ? "#ffffff" : "#000000";
  for (let w = 0; w <= 1.0001; w += 0.04) {
    const c = mix(toward, color, w);
    if (contrast(c, bg) >= min && (!bg2 || contrast(c, bg2) >= min)) return c;
  }
  return toward;
}

export function resolveColors(partial: Partial<Record<ThemeKey, string | null | undefined>>): ThemeColors {
  const out = { ...DEFAULT_THEME };
  for (const f of THEME_FIELDS) { const v = normalizeHex(partial[f.key]); if (v) out[f.key] = v; }
  return out;
}

/** Variáveis CSS completas para um conjunto de cores (aparência padrão quando as cores são as padrão). */
export function themeVars(c: ThemeColors): Record<string, string> {
  const d = DEFAULT_THEME, v: Record<string, string> = { ...DEFAULT_VARS };
  const same = (...k: ThemeKey[]) => k.every((x) => c[x] === d[x]);
  v["--color-page"] = c.background;
  v["--color-ink"] = c.text;
  v["--color-brand"] = c.primary;
  v["--color-brand-dark"] = same("secondary", "background") ? DEFAULT_VARS["--color-brand-dark"] : ensureContrast(c.secondary, c.background, 4.5, "#ffffff");
  if (!same("primary", "background")) { v["--color-brand-light"] = mix(c.primary, c.background, 0.1); v["--color-brand-50"] = mix(c.primary, c.background, 0.05); }
  if (!same("text", "background")) {
    v["--color-muted"] = ensureContrast(mix(c.text, c.background, 0.7), c.background, 4.6, "#ffffff");
    v["--color-line"] = mix(c.text, c.background, 0.12);
    v["--color-surface"] = mix(c.text, c.background, 0.035);
  }
  if (!same("button")) { v["--color-btn"] = c.button; v["--color-btn-ink"] = inkOn(c.button); v["--color-btn-hover"] = mix("#000000", c.button, 0.16); }
  if (!same("sidebar", "text", "primary", "secondary", "background")) {
    const s = c.sidebar, dark = isDark(s);
    v["--color-sidebar"] = s;
    v["--color-sidebar-ink"] = dark ? "#ffffff" : ensureContrast(c.text, s, 4.5);
    v["--color-sidebar-muted"] = dark ? ensureContrast(mix("#ffffff", s, 0.72), s, 4.5) : ensureContrast(mix(c.text, s, 0.7), s, 4.5);
    v["--color-sidebar-hover"] = dark ? mix("#ffffff", s, 0.1) : mix("#ffffff", s, 0.7);
    v["--color-sidebar-active"] = dark ? mix("#ffffff", s, 0.16) : mix(c.primary, s, 0.12);
    v["--color-sidebar-active-ink"] = dark ? "#ffffff" : ensureContrast(c.secondary, v["--color-sidebar-active"], 4.5);
    v["--color-sidebar-icon"] = dark ? ensureContrast(mix(c.primary, "#ffffff", 0.35), s, 3) : ensureContrast(c.primary, s, 3);
  }
  return v;
}

export const cssOf = (vars: Record<string, string>) => Object.entries(vars).map(([k, x]) => `${k}:${x}`).join(";");

/** Regras de legibilidade. Retorna mensagens em português (vazio = aprovado). */
export function validateTheme(c: ThemeColors): string[] {
  const e: string[] = [];
  const r = (n: number) => n.toFixed(1).replace(".", ",");
  if (luminance(c.background) < 0.6) e.push("A cor de fundo precisa ser clara (o sistema usa quadros brancos sobre o fundo). Escolha um tom próximo do branco.");
  const tb = Math.min(contrast(c.text, c.background), contrast(c.text, "#ffffff"));
  if (tb < 4.5) e.push(`A cor dos textos tem pouco contraste com o fundo (${r(tb)}:1; mínimo 4,5:1). Escolha um tom mais escuro.`);
  const pb = contrast(c.primary, c.background);
  if (pb < 3) e.push(`A cor principal está clara demais para ícones e destaques sobre o fundo (${r(pb)}:1; mínimo 3:1).`);
  const sb = contrast(c.secondary, c.background);
  if (sb < 3) e.push(`A cor secundária é usada em links e textos de destaque e está clara demais (${r(sb)}:1; mínimo 3:1).`);
  const bb = contrast(c.button, c.background);
  if (bb < 1.5) e.push("A cor dos botões é quase igual à cor de fundo; os botões ficariam invisíveis.");
  return e;
}
