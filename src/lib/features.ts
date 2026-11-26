/**
 * Catálogo de funcionalidades — fonte única usada pelo frontend (menu)
 * e pelo backend (autorização). As chaves espelham a tabela `features`.
 */
export const FEATURES = [
  { key: "dashboard", name: "Dashboard" },
  { key: "google_search", name: "Pesquisa no Google" },
  { key: "spreadsheet_import", name: "Importação de planilhas" },
  { key: "contact_lists", name: "Listas de contatos" },
  { key: "contacts", name: "Contatos" },
  { key: "campaigns", name: "Campanhas" },
  { key: "scripts", name: "Scripts" },
  { key: "tags", name: "Etiquetas" },
  { key: "conversations", name: "Conversas" },
  { key: "ai_chatbot", name: "Chatbot IA" },
  { key: "ai_messages", name: "Mensagens com IA" },
  { key: "whatsapp", name: "WhatsApp Comercial" },
  { key: "crm", name: "CRM" },
  { key: "sales_team", name: "Equipe Comercial" },
  { key: "broadcasts", name: "Disparos de mensagens" },
  { key: "goals", name: "Metas" },
  { key: "reports", name: "Relatórios" },
  { key: "data_export", name: "Exportação de dados" },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export const FEATURE_KEYS: FeatureKey[] = FEATURES.map((f) => f.key);
export const featureName = (k: string) => FEATURES.find((f) => f.key === k)?.name ?? k;
export function isFeatureKey(k: string): k is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(k);
}

/** Funcionalidades que um vendedor recebe por padrão (se a empresa tiver). */
export const SELLER_DEFAULT_FEATURES: FeatureKey[] = [
  "dashboard", "contacts", "contact_lists", "tags", "conversations",
  "ai_messages", "crm", "goals", "reports",
];

/** Funcionalidades administrativas que exigem perfil de administrador da empresa. */
export const ADMIN_ONLY_FEATURES: FeatureKey[] = ["sales_team", "whatsapp", "ai_chatbot"];

export type Role = "platform_admin" | "company_admin" | "seller";
export const ROLE_LABEL: Record<Role, string> = {
  platform_admin: "Administrador geral",
  company_admin: "Administrador da empresa",
  seller: "Vendedor",
};

export const LIMIT_FIELDS = [
  { key: "max_users", label: "Usuários (total)" },
  { key: "max_sellers", label: "Vendedores" },
  { key: "max_contacts", label: "Contatos" },
  { key: "max_whatsapp_connections", label: "Números de WhatsApp" },
  { key: "max_messages_month", label: "Mensagens por mês" },
  { key: "max_google_searches_month", label: "Pesquisas no Google por mês" },
] as const;
export type LimitKey = (typeof LIMIT_FIELDS)[number]["key"];
export type Limits = Partial<Record<LimitKey, number | null>>;
