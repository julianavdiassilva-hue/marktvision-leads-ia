import { requireModulePage } from "@/server/auth/next";
import { isCompanyAdmin } from "@/server/guards";
import { KNOWLEDGE_CATEGORIES, listKnowledge } from "@/server/services/knowledge";
import { PageHeader } from "@/components/ui";
import { KnowledgeManager } from "@/components/ai/knowledge";

export const metadata = { title: "Contexto da empresa" };

export default async function ContextPage() {
  const ctx = await requireModulePage(["ai_chatbot"], { adminOnly: true });
  const k = await listKnowledge(ctx);
  return (
    <>
      <PageHeader title="Contexto da empresa" description={`Tudo o que o agente de IA sabe sobre ${ctx.company!.name}. Informações de uma empresa nunca são usadas no atendimento de outra.`} />
      <KnowledgeManager entries={k.entries} documents={k.documents} categories={KNOWLEDGE_CATEGORIES} canEdit={isCompanyAdmin(ctx)} />
    </>
  );
}
