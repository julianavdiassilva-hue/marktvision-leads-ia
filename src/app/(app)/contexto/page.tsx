import { requireModulePage } from "@/server/auth/next";
import { ModulePending } from "@/components/module-pending";

export const metadata = { title: "Contexto da empresa" };

export default async function Page() {
  await requireModulePage(["ai_chatbot"], { adminOnly: true });
  return (
    <ModulePending title="Contexto da empresa" phase={8}
      description="Base de conhecimento da empresa: produtos, serviços, preços, horários, regras e documentos."
      connections={['Isolada por empresa (RLS no banco)', 'Utilizada pelo Chatbot IA e pelas mensagens geradas com IA']} />
  );
}
