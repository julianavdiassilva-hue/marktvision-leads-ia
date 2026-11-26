/** Variáveis de personalização das mensagens: {{nome}}, {{primeiro_nome}}, {{empresa}}, {{cidade}}, {{vendedor}}, {{minha_empresa}}. */
export const TEMPLATE_VARS = [
  { key: "primeiro_nome", label: "Primeiro nome" },
  { key: "nome", label: "Nome completo" },
  { key: "empresa", label: "Empresa do contato" },
  { key: "cidade", label: "Cidade" },
  { key: "vendedor", label: "Vendedor responsável" },
  { key: "minha_empresa", label: "Minha empresa" },
] as const;

export type TemplateData = {
  name?: string | null; organization?: string | null; city?: string | null; owner_name?: string | null; company_name?: string | null;
};

/** Substitui variáveis; quando o dado não existe, usa um texto neutro (nunca deixa "{{...}}" na mensagem). */
export function renderTemplate(body: string, d: TemplateData): string {
  const first = (d.name ?? "").trim().split(/\s+/)[0] ?? "";
  const values: Record<string, string> = {
    primeiro_nome: first || "tudo bem",
    nome: d.name?.trim() || "",
    empresa: d.organization?.trim() || d.name?.trim() || "sua empresa",
    cidade: d.city?.trim() || "sua cidade",
    vendedor: d.owner_name?.trim() || "nossa equipe",
    minha_empresa: d.company_name?.trim() || "",
  };
  return body
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => (k.toLowerCase() in values ? values[k.toLowerCase()] : m))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.!?])/g, "$1")
    .trim();
}

export function unknownVars(body: string): string[] {
  const keys = new Set<string>(TEMPLATE_VARS.map((v) => v.key));
  return [...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase()).filter((k) => !keys.has(k));
}
