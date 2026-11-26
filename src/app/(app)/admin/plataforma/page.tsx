import Link from "next/link";
import { requirePlatformPage } from "@/server/auth/next";
import { platformOverview } from "@/server/services/platform";
import { Empty, PageHeader, Panel, Stat, StatusDot } from "@/components/ui";
import { fmtDateTime, fmtInt } from "@/lib/format";

export const metadata = { title: "Administração da plataforma" };

const ACTIONS: Record<string, string> = {
  "auth.login": "Login", "company.create": "Empresa cadastrada", "company.update": "Empresa editada",
  "company.update_profile": "Dados da empresa editados", "company.activate": "Empresa reativada", "company.deactivate": "Empresa desativada",
  "company.feature": "Funcionalidade alterada", "company.features_reset": "Funcionalidades restauradas", "company.limits": "Limites alterados",
  "user.create": "Usuário criado", "user.update": "Usuário editado", "user.activate": "Usuário ativado", "user.deactivate": "Usuário desativado",
  "user.reset_password": "Senha redefinida", "user.change_own_password": "Senha alterada", "user.permission": "Permissão individual alterada",
  "plan.create": "Plano criado", "plan.update": "Plano editado", "plan.feature": "Funcionalidade do plano alterada", "plan.delete": "Plano excluído",
};

export default async function PlatformPage() {
  const ctx = await requirePlatformPage();
  const { totals, usage, logs } = await platformOverview(ctx);
  return (
    <>
      <PageHeader title="Administração da plataforma" description="Utilização real da plataforma e registro de auditoria." />
      <div className="panel mb-6 grid divide-line sm:grid-cols-2 sm:divide-x lg:grid-cols-4 [&>*]:border-b [&>*]:border-line lg:[&>*:nth-last-child(-n+4)]:border-b-0">
        <Stat label="Empresas ativas" value={`${fmtInt(totals.active_companies)} / ${fmtInt(totals.companies)}`} href="/admin/empresas" />
        <Stat label="Usuários das empresas" value={fmtInt(totals.users)} href="/admin/usuarios" />
        <Stat label="Usuários ativos (24h)" value={fmtInt(totals.active_sessions)} />
        <Stat label="Logins (7 dias)" value={fmtInt(totals.logins_7d)} />
        <Stat label="Contatos na plataforma" value={fmtInt(totals.contacts)} />
        <Stat label="Campanhas" value={fmtInt(totals.campaigns)} />
        <Stat label="Mensagens no mês" value={fmtInt(totals.messages_month)} />
        <Stat label="Planos" value={<Link href="/admin/planos" className="text-brand hover:underline">Gerenciar</Link>} />
      </div>
      <Panel title="Utilização por empresa" padded={false} className="mb-6">
        {usage.length === 0 ? <Empty title="Nenhuma empresa cadastrada" /> : (
          <div className="overflow-x-auto"><table className="table min-w-[820px]">
            <thead><tr><th>Empresa</th><th>Plano</th><th className="text-right">Usuários</th><th className="text-right">Contatos</th><th className="text-right">Campanhas</th><th className="text-right">Mensagens no mês</th><th>Última atividade</th><th>Situação</th></tr></thead>
            <tbody>{usage.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/admin/empresas/${u.id}`} className="font-semibold hover:text-brand">{u.name}</Link></td>
                <td>{u.plan_name ?? "—"}</td>
                <td className="text-right tabular-nums">{fmtInt(u.users)}</td><td className="text-right tabular-nums">{fmtInt(u.contacts)}</td>
                <td className="text-right tabular-nums">{fmtInt(u.campaigns)}</td><td className="text-right tabular-nums">{fmtInt(u.messages_month)}</td>
                <td className="text-[14px] text-muted">{u.last_activity ? fmtDateTime(u.last_activity) : "Sem acesso"}</td>
                <td><StatusDot active={u.is_active} /></td>
              </tr>))}
            </tbody></table></div>
        )}
      </Panel>
      <Panel title="Auditoria" description="Últimas 50 ações registradas." padded={false}>
        <div className="overflow-x-auto"><table className="table min-w-[720px]">
          <thead><tr><th>Data</th><th>Ação</th><th>Usuário</th><th>Empresa</th></tr></thead>
          <tbody>{logs.map((l) => (
            <tr key={l.id}><td className="text-[14px] text-muted">{fmtDateTime(l.created_at)}</td><td className="font-medium">{ACTIONS[l.action] ?? l.action}</td><td>{l.user_name ?? "—"}</td><td>{l.company_name ?? "Plataforma"}</td></tr>
          ))}</tbody></table></div>
      </Panel>
    </>
  );
}
