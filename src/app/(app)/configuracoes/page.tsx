import { requirePage } from "@/server/auth/next";
import { getOwnCompanyProfile } from "@/server/services/companies";
import { isCompanyAdmin } from "@/server/guards";
import { PageHeader, Panel } from "@/components/ui";
import { ChangePasswordForm, CompanyProfileForm } from "@/components/settings";
import { ROLE_LABEL } from "@/lib/features";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requirePage();
  const company = isCompanyAdmin(ctx) && ctx.company ? await getOwnCompanyProfile(ctx) : null;
  return (
    <>
      <PageHeader title="Configurações" description="Sua conta e os dados da empresa." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Minha conta" description={`${ctx.user.name} · login ${ctx.user.username} · ${ROLE_LABEL[ctx.role]}`}>
          <ChangePasswordForm />
        </Panel>
        {company && <Panel title="Dados da empresa" description="Todos os campos, exceto o nome, são opcionais."><CompanyProfileForm c={company} /></Panel>}
      </div>
    </>
  );
}
