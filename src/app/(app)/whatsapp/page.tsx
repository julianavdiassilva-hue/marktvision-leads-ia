import { requireModulePage } from "@/server/auth/next";
import { isCompanyAdmin } from "@/server/guards";
import { connectionMembers, embeddedSignupConfig, listConnections, webhookInfo } from "@/server/services/whatsapp";
import { teamOptions } from "@/server/services/contacts";
import { Alert, Empty, PageHeader, Panel } from "@/components/ui";
import { ConnectWhatsAppButtons } from "@/components/whatsapp/connect-button";
import { ConnectionsList, ManualConnect } from "@/components/whatsapp/connections";

export const metadata = { title: "WhatsApp Comercial" };

export default async function WhatsAppPage() {
  const ctx = await requireModulePage(["whatsapp"], { adminOnly: true });
  const [rows, team, members] = await Promise.all([listConnections(ctx), teamOptions(ctx), connectionMembers(ctx)]);
  const cfg = embeddedSignupConfig();
  const hook = webhookInfo();
  return (
    <>
      <PageHeader title="WhatsApp Comercial" description="Conecte os números da sua empresa pela integração oficial da Meta. Cada número fica disponível em campanhas, conversas, chatbot, CRM e relatórios." />
      <Panel title="Conectar WhatsApp" description="A conexão é feita por você, pelo celular, em poucos minutos — sem precisar de suporte técnico." className="mb-6">
        {!cfg.ready && (
          <div className="mb-4"><Alert tone="amber">
            A conexão pelo botão ainda não está disponível nesta instalação: a Marktvision precisa concluir o cadastro como Provedor de Tecnologia na Meta e configurar META_APP_ID, META_APP_SECRET e META_EMBEDDED_SIGNUP_CONFIG_ID.
            {ctx.user.isPlatformAdmin && " Veja o passo a passo em INTEGRATIONS.md."}
          </Alert></div>
        )}
        <ConnectWhatsAppButtons appId={cfg.appId} configId={cfg.configId} graphVersion={cfg.graphVersion} ready={cfg.ready} />
        <p className="mt-4 text-[13.5px] text-muted">
          Números pessoais (aplicativo WhatsApp comum) não podem ser conectados por meios oficiais. Para usar um número pessoal, migre-o para o WhatsApp Business (gratuito) e conecte pela primeira opção.
          Mensagens da plataforma seguem as regras da Meta: modelos aprovados para iniciar conversas, janela de 24h e descadastramento.
        </p>
        {isCompanyAdmin(ctx) && <ManualConnect />}
      </Panel>
      <h2 className="mb-3 text-[19px] font-bold">Números conectados</h2>
      {rows.length === 0 ? <div className="panel"><Empty title="Nenhum número conectado" description="Use “Conectar WhatsApp” acima. Depois de conectado, o número aparece automaticamente nas campanhas e na central de conversas." /></div>
        : <ConnectionsList rows={rows} team={team} members={members} canManage={isCompanyAdmin(ctx)} />}
      {ctx.user.isPlatformAdmin && (
        <Panel title="Configuração técnica da plataforma (visível só ao administrador geral)" className="mt-6">
          <ul className="space-y-1.5 text-[14.5px]">
            <li>URL do webhook: <code className="rounded bg-surface px-1.5">{hook.url ?? "defina APP_URL"}</code></li>
            <li>Token de verificação do webhook: {hook.verifyTokenConfigured ? "configurado" : "pendente (META_WEBHOOK_VERIFY_TOKEN)"}</li>
            <li>Segredo do app (assinatura dos webhooks): {hook.appSecretConfigured ? "configurado" : "pendente (META_APP_SECRET)"}</li>
            <li>Embedded Signup: {cfg.ready ? "pronto" : "pendente (META_APP_ID, META_EMBEDDED_SIGNUP_CONFIG_ID)"}</li>
            <li>Criptografia das credenciais: {hook.encryptionConfigured ? "configurada" : "pendente (ENCRYPTION_KEY)"}</li>
          </ul>
        </Panel>
      )}
    </>
  );
}
