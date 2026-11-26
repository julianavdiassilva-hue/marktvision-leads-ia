import { requireModulePage } from "@/server/auth/next";
import { ModulePending } from "@/components/module-pending";

export const metadata = { title: "Conversas" };

export default async function Page() {
  await requireModulePage(["conversations"]);
  return (
    <ModulePending title="Conversas" phase={6}
      description="Central de conversas no estilo WhatsApp Web, integrada ao CRM."
      connections={['Mensagens recebidas pelo webhook do WhatsApp', 'IA ativável por conversa; vendedor assume e a IA para', 'Painel lateral com dados do contato, etiquetas e etapa do CRM']} />
  );
}
