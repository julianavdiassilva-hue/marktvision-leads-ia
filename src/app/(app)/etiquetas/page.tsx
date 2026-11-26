import { requireModulePage } from "@/server/auth/next";
import { ModulePending } from "@/components/module-pending";

export const metadata = { title: "Etiquetas" };

export default async function Page() {
  await requireModulePage(["tags"]);
  return (
    <ModulePending title="Etiquetas" phase={2}
      description="Etiquetas personalizadas com nome e cor, vinculadas ao contato central."
      connections={['Etiqueta aplicada na conversa aparece no CRM e nos contatos', 'Regras de aplicação automática']} />
  );
}
