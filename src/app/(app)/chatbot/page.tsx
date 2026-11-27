import { requireModulePage } from "@/server/auth/next";
import { isCompanyAdmin } from "@/server/guards";
import { getAiSettings } from "@/server/services/ai-agent";
import { aiConfig } from "@/server/integrations/ai";
import { PageHeader } from "@/components/ui";
import { AgentSettings, AgentTester } from "@/components/ai/agent";

export const metadata = { title: "Chatbot IA" };

export default async function ChatbotPage() {
  const ctx = await requireModulePage(["ai_chatbot"], { adminOnly: true });
  const [s, p] = [await getAiSettings(ctx), aiConfig()];
  return (
    <>
      <PageHeader title="Chatbot IA" description="Agente comercial que atende no WhatsApp usando o Contexto da empresa: recepciona, tira dúvidas, qualifica e transfere para o vendedor." />
      <div className="grid gap-6 2xl:grid-cols-[1fr_420px]">
        <AgentSettings s={s} provider={{ ready: p.ready, label: p.label, model: p.model }} canEdit={isCompanyAdmin(ctx)} />
        <div><AgentTester disabled={!p.ready} /></div>
      </div>
    </>
  );
}
