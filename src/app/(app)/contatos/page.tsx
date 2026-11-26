import { requireModulePage } from "@/server/auth/next";
import { ModulePending } from "@/components/module-pending";

export const metadata = { title: "Contatos e listas" };

export default async function Page() {
  await requireModulePage(["contacts","contact_lists"]);
  return (
    <ModulePending title="Contatos e listas" phase={2}
      description="Base central única de contatos, listas e etiquetas da empresa."
      connections={['Contato com identificador único por empresa e deduplicação por telefone', 'Mesmo contato aparece em campanhas, conversas e CRM', 'Pesquisa no Google e importação de planilhas alimentam esta base (Fase 03)']} />
  );
}
