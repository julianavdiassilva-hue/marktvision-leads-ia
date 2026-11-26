import type { FeatureKey } from "./features";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /** Exibe se o usuário tiver QUALQUER uma destas funcionalidades. Vazio = sempre. */
  anyOf: FeatureKey[];
  adminOnly?: boolean;
  /** Fase do roadmap em que o módulo é entregue (até lá a página informa o status). */
  phase?: number;
};

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", anyOf: ["dashboard"] },
  { href: "/campanhas", label: "Campanhas", icon: "Megaphone", anyOf: ["campaigns"] },
  { href: "/contatos", label: "Contatos e listas", icon: "Users", anyOf: ["contacts", "contact_lists", "spreadsheet_import", "google_search"] },
  { href: "/conversas", label: "Conversas", icon: "MessagesSquare", anyOf: ["conversations"], phase: 6 },
  { href: "/crm", label: "CRM Comercial", icon: "KanbanSquare", anyOf: ["crm"], phase: 7 },
  { href: "/etiquetas", label: "Etiquetas", icon: "Tags", anyOf: ["tags"] },
  { href: "/chatbot", label: "Chatbot IA", icon: "Bot", anyOf: ["ai_chatbot"], phase: 8 },
  { href: "/contexto", label: "Contexto da empresa", icon: "BookOpen", anyOf: ["ai_chatbot"], phase: 8 },
  { href: "/whatsapp", label: "WhatsApp Comercial", icon: "MessageCircle", anyOf: ["whatsapp"] },
  { href: "/equipe", label: "Equipe Comercial", icon: "UserCog", anyOf: ["sales_team"], adminOnly: true },
  { href: "/relatorios", label: "Relatórios", icon: "BarChart3", anyOf: ["reports"], phase: 9 },
  { href: "/configuracoes", label: "Configurações", icon: "Settings", anyOf: [] },
];

export const PLATFORM_NAV: NavItem[] = [
  { href: "/admin/empresas", label: "Empresas", icon: "Building2", anyOf: [] },
  { href: "/admin/usuarios", label: "Usuários", icon: "UserRound", anyOf: [] },
  { href: "/admin/planos", label: "Planos e permissões", icon: "ShieldCheck", anyOf: [] },
  { href: "/admin/plataforma", label: "Administração da plataforma", icon: "Activity", anyOf: [] },
];
