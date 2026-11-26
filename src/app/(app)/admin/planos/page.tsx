import { requirePlatformPage } from "@/server/auth/next";
import { listPlans } from "@/server/services/plans";
import { PageHeader } from "@/components/ui";
import { PlanCard, PlanCreateButton } from "@/components/admin/plans";

export const metadata = { title: "Planos e permissões" };

export default async function PlansPage() {
  const ctx = await requirePlatformPage();
  const plans = await listPlans(ctx);
  return (
    <>
      <PageHeader title="Planos e permissões"
        description="Cada plano define as funcionalidades e os limites padrão. Exceções por empresa são feitas na página da empresa; por usuário, na página do usuário."
        actions={<PlanCreateButton />} />
      <div className="space-y-6">{plans.map((p) => <PlanCard key={p.id} plan={p} />)}</div>
    </>
  );
}
