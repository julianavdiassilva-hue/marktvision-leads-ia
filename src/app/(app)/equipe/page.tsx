import { requireModulePage } from "@/server/auth/next";
import { listUsers } from "@/server/services/users";
import { Alert, PageHeader, Panel } from "@/components/ui";
import { UserCreateButton, UsersTable } from "@/components/admin/users";

export const metadata = { title: "Equipe Comercial" };

export default async function TeamPage() {
  const ctx = await requireModulePage(["sales_team"], { adminOnly: true });
  const users = await listUsers(ctx);
  return (
    <>
      <PageHeader title="Equipe Comercial" description={`Administradores e vendedores de ${ctx.company!.name}.`}
        actions={<UserCreateButton fixedCompanyId={ctx.company!.id} label="Novo vendedor" />} />
      <Panel padded={false}><UsersTable users={users} basePath="/equipe" currentUserId={ctx.user.id} /></Panel>
      <div className="mt-6"><Alert tone="amber">Indicadores por vendedor, distribuição de leads e metas serão ativados na Fase 07, usando os dados reais de conversas, CRM e vendas.</Alert></div>
    </>
  );
}
