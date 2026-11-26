/** Campos importáveis e detecção automática de colunas pelo cabeçalho da planilha. */
export const IMPORT_FIELDS = [
  { key: "name", label: "Nome", synonyms: ["nome", "contato", "nome do contato", "cliente", "responsavel", "name"] },
  { key: "phone", label: "Telefone", synonyms: ["telefone", "fone", "tel", "celular", "phone", "numero", "contato telefone", "telefone 1"] },
  { key: "whatsapp", label: "WhatsApp", synonyms: ["whatsapp", "whats", "wpp", "zap", "zap zap", "celular whatsapp"] },
  { key: "organization", label: "Empresa", synonyms: ["empresa", "razao social", "nome fantasia", "fantasia", "company", "organizacao", "estabelecimento"] },
  { key: "email", label: "E-mail", synonyms: ["email", "e-mail", "e mail", "mail", "correio"] },
  { key: "city", label: "Cidade", synonyms: ["cidade", "municipio", "city"] },
  { key: "state", label: "UF / Estado", synonyms: ["uf", "estado", "state"] },
  { key: "neighborhood", label: "Bairro", synonyms: ["bairro", "regiao", "neighborhood"] },
  { key: "address", label: "Endereço", synonyms: ["endereco", "logradouro", "rua", "address"] },
  { key: "category", label: "Segmento", synonyms: ["segmento", "categoria", "ramo", "atividade", "category"] },
  { key: "notes", label: "Observações", synonyms: ["observacoes", "observacao", "obs", "notas", "comentarios", "notes"] },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_\-.:]+/g, " ").replace(/\s+/g, " ").trim();

/** Sugere o mapeamento campo → índice da coluna. Cada coluna é usada no máximo uma vez. */
export function suggestMapping(headers: string[]): Partial<Record<ImportField, number>> {
  const map: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();
  const h = headers.map((x) => norm(String(x ?? "")));
  for (const pass of ["exact", "contains"] as const) {
    for (const f of IMPORT_FIELDS) {
      if (map[f.key] !== undefined) continue;
      const idx = h.findIndex((col, i) => !used.has(i) && col && f.synonyms.some((s) => (pass === "exact" ? col === s : col.includes(s))));
      if (idx >= 0) { map[f.key] = idx; used.add(idx); }
    }
  }
  return map;
}

export const MAX_IMPORT_ROWS = 20000;
