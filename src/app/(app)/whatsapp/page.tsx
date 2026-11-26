import { requireModulePage } from "@/server/auth/next";
import { ModulePending } from "@/components/module-pending";

export const metadata = { title: "WhatsApp Comercial" };

export default async function Page() {
  await requireModulePage(["whatsapp"], { adminOnly: true });
  return (
    <ModulePending title="WhatsApp Comercial" phase={5}
      description="Conexão de números pela API oficial WhatsApp Business Platform (Meta)."
      connections={['Envio real, webhooks de recebimento e confirmação de entrega', 'Modelos aprovados, janela de 24h e descadastramento', 'Arquitetura modular para outros provedores autorizados']} />
  );
}
