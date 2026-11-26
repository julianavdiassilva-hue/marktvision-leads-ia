import { requireModulePage } from "@/server/auth/next";
import { ModulePending } from "@/components/module-pending";

export const metadata = { title: "CRM Comercial" };

export default async function Page() {
  await requireModulePage(["crm"]);
  return (
    <ModulePending title="CRM Comercial" phase={7}
      description="Funil de vendas em Kanban e lista, com oportunidades, vendas e motivos de perda."
      connections={['Funil padrão já criado automaticamente para cada empresa', 'Oportunidade ligada ao contato, à conversa e à campanha de origem', 'Venda registrada atualiza dashboard, vendedor e campanha']} />
  );
}
