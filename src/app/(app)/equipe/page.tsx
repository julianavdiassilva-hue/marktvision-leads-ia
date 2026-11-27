import { requireModulePage } from "@/server/auth/next";
import { hasFeature } from "@/server/guards";
import { listUsers } from "@/server/services/users";
import { listGoals, periodOf, sellerIndicators } from "@/server/services/team";
import { teamOptions } from "@/server/services/contacts";
import { PageHeader, Panel } from "@/components/ui";
import { UserCreateButton, UsersTable } from "@/components/admin/users";
import { GoalsPanel, IndicatorsTable, PeriodFilter } from "@/components/crm/team";

export const metadata = { title: "Equipe Comercial" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const ctx = await requireModulePage(["sales_team"], { adminOnly: true });
  const period = periodOf(await searchParams);
  const [users, indicators, team, goals] = await Promise.all([
    listUsers(ctx), sellerIndicators(ctx, period), teamOptions(ctx), hasFeature(ctx, "goals") ? listGoals(ctx, period) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Equipe Comercial" description={`Vendedores de ${ctx.company!.name}: desempenho, metas e acessos. Para distribuir leads, selecione contatos em Contatos e listas.`}
        actions={<UserCreateButton fixedCompanyId={ctx.company!.id} label="Novo vendedor" />} />
      <div className="mb-4"><PeriodFilter from={period.from} to={period.to} /></div>
      <Panel title="Desempenho por vendedor" description="Calculado a partir de conversas, negociações e vendas reais do período." padded={false} className="mb-6">
        <IndicatorsTable rows={indicators} />
      </Panel>
      {hasFeature(ctx, "goals") && (
        <Panel title="Metas" description="Individuais ou da equipe, com o realizado atualizado automaticamente." className="mb-6">
          <GoalsPanel goals={goals} team={team} from={period.from} to={period.to} canEdit />
        </Panel>
      )}
      <Panel title="Acessos da equipe" padded={false}><UsersTable users={users} basePath="/equipe" currentUserId={ctx.user.id} /></Panel>
    </>
  );
}
