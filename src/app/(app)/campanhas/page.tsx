import { requireModulePage } from "@/server/auth/next";
import { ModulePending } from "@/components/module-pending";

export const metadata = { title: "Campanhas" };

export default async function Page() {
  await requireModulePage(["campaigns"]);
  return (
    <ModulePending title="Campanhas" phase={4}
      description="Central de campanhas com criação integrada: origem dos contatos, script, WhatsApp e atendimento."
      connections={['Usa listas e contatos da base central (sem cadastros paralelos)', 'Envia pelo WhatsApp conectado da empresa', 'Respostas entram na Central de Conversas e no CRM com a campanha de origem']} />
  );
}
