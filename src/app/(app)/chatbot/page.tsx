import { requireModulePage } from "@/server/auth/next";
import { ModulePending } from "@/components/module-pending";

export const metadata = { title: "Chatbot IA" };

export default async function Page() {
  await requireModulePage(["ai_chatbot"], { adminOnly: true });
  return (
    <ModulePending title="Chatbot IA" phase={8}
      description="Agente comercial inteligente que atende pelo WhatsApp usando o contexto da empresa."
      connections={['Consulta somente a base de conhecimento da própria empresa', 'Qualifica, etiqueta, atualiza o CRM e transfere ao vendedor', 'Não inventa preços ou ofertas não cadastradas']} />
  );
}
