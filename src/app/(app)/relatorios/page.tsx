import { requireModulePage } from "@/server/auth/next";
import { ModulePending } from "@/components/module-pending";

export const metadata = { title: "Relatórios" };

export default async function Page() {
  await requireModulePage(["reports"]);
  return (
    <ModulePending title="Relatórios" phase={9}
      description="Relatórios de prospecção, campanhas, atendimento, conversão, vendas e metas."
      connections={['Calculados exclusivamente a partir dos dados reais', 'Exportação em PDF, Excel e CSV (funcionalidade "Exportação de dados")']} />
  );
}
