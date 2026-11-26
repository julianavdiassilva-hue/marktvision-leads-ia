import { requireModulePage } from "@/server/auth/next";
import { isCompanyAdmin } from "@/server/guards";
import { connectionMembers, embeddedSignupConfig, listConnections, qrConfig, webhookInfo } from "@/server/services/whatsapp";
import { evolutionConfig } from "@/server/integrations/whatsapp/evolution";
import { QrConnect } from "@/components/whatsapp/qr-connect";
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
  const qr = qrConfig();
  return (
    <>
      <PageHeader title="WhatsApp Comercial" description="Conecte os números da sua empresa. Cada número fica disponível automaticamente em campanhas, conversas, chatbot, CRM e relatórios." />
      <Panel title="Conectar WhatsApp" description="Conecte o número da sua empresa em menos de um minuto, escaneando um QR Code com o celular." className="mb-6">
        {!qr.ready && (
          <div className="mb-4"><Alert tone="amber">
            A conexão por QR Code ainda não está ativa nesta instalação: o servidor de conexão (Evolution API) precisa ser publicado e configurado (EVOLUTION_API_URL, EVOLUTION_API_KEY e APP_URL).
            {ctx.user.isPlatformAdmin && " Veja o passo a passo em INTEGRATIONS.md."}
          </Alert></div>
        )}
        <QrConnect ready={qr.ready} />
        <p className="mt-3 text-[13.5px] text-muted">
          Conexão não oficial (WhatsApp Web): funciona com números pessoais e WhatsApp Business. Para reduzir o risco de bloqueio do número pelo WhatsApp, os envios de campanhas são espaçados automaticamente — envie apenas para contatos que autorizaram receber mensagens.
        </p>
        <details className="mt-5 rounded-xl border border-line p-4">
          <summary className="cursor-pointer text-[15px] font-semibold text-muted">Integração oficial da Meta (alternativa para o futuro)</summary>
          <div className="mt-4">
            {!cfg.ready && <div className="mb-4"><Alert tone="amber">Requer o cadastro da Marktvision como Provedor de Tecnologia na Meta (META_APP_ID, META_APP_SECRET e META_EMBEDDED_SIGNUP_CONFIG_ID).</Alert></div>}
            <ConnectWhatsAppButtons appId={cfg.appId} configId={cfg.configId} graphVersion={cfg.graphVersion} ready={cfg.ready} />
            {isCompanyAdmin(ctx) && <ManualConnect />}
          </div>
        </details>
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
            <li>Servidor de QR Code (Evolution API): {evolutionConfig().ready ? `configurado (${evolutionConfig().url})` : "pendente (EVOLUTION_API_URL / EVOLUTION_API_KEY)"}</li>
            <li>Webhook da conexão por QR Code: {hook.url ? hook.url.replace("/whatsapp", "/evolution") : "defina APP_URL"}</li>
          </ul>
        </Panel>
      )}
    </>
  );
}
