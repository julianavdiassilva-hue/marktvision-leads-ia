import clsx from "clsx";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { pageError, requirePlatformPage } from "@/server/auth/next";
import { getCompany } from "@/server/services/companies";
import { planOptions } from "@/server/services/plans";
import { listUsers } from "@/server/services/users";
import { Alert, Panel, StatusDot } from "@/components/ui";
import { CompanyActiveButton, CompanyEditForm, CompanyFeatures, CompanyLimitsForm, EnterCompanyButton } from "@/components/admin/company-detail";
import { UserCreateButton, UsersTable } from "@/components/admin/users";
import { fmtDate } from "@/lib/format";
import { getBranding } from "@/server/services/branding";
import { BrandingEditor } from "@/components/branding/branding-editor";

export const metadata = { title: "Empresa" };

export default async function CompanyDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criada?: string; aba?: string }> }) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
  const sp = await searchParams;
  const [{ company, features, limits, usage }, plans, users] = await Promise.all([
    getCompany(ctx, id).catch(pageError), planOptions(ctx), listUsers(ctx, { companyId: id }),
  ]);
  const enabledCount = features.filter((f) => f.enabled).length;
  const tab = sp.aba === "identidade" ? "identidade" : "dados";
  const branding = tab === "identidade" ? await getBranding(ctx, id) : null;
  const brandingAllowed = features.find((f) => f.key === "branding")?.enabled ?? false;
  return (
    <>
      <Link href="/admin/empresas" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-dark hover:underline"><ArrowLeft className="h-4 w-4" />Empresas</Link>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3"><h1 className="text-[28px] font-bold tracking-tight">{company.name}</h1><StatusDot active={company.is_active} /></div>
          <p className="mt-1 text-[16px] text-muted">Plano {company.plan_name ?? "não definido"} · {enabledCount} de {features.length} funcionalidades · cadastrada em {fmtDate(company.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <CompanyActiveButton id={company.id} active={company.is_active} />
          {company.is_active && <EnterCompanyButton companyId={company.id} />}
        </div>
      </div>
      <nav className="mb-6 flex gap-1 border-b border-line" aria-label="Seções da empresa">
        {[["dados", "Dados e acessos", `/admin/empresas/${company.id}`], ["identidade", "Identidade Visual", `/admin/empresas/${company.id}?aba=identidade`]].map(([k, label, href]) => (
          <Link key={k} href={href} aria-current={tab === k ? "page" : undefined}
            className={clsx("-mb-px border-b-2 px-4 py-2.5 text-[15.5px] font-semibold", tab === k ? "border-brand text-brand-dark" : "border-transparent text-muted hover:text-ink")}>{label}</Link>
        ))}
      </nav>
      {branding && (
        <div className="space-y-5">
          <Alert tone={brandingAllowed ? "green" : "amber"}>
            {brandingAllowed
              ? "O administrador desta empresa também pode personalizar a identidade visual (funcionalidade \"Identidade visual\" liberada)."
              : "Somente você (administrador geral) pode personalizar esta empresa. Para permitir que o administrador da empresa personalize o próprio ambiente, ligue \"Identidade visual\" em Funcionalidades liberadas."}
          </Alert>
          <BrandingEditor companyId={company.id} companyName={company.name} slug={branding.brand.slug} canEditSlug={branding.canEditSlug}
            initial={{ colors: branding.brand.colors, displayName: branding.brand.displayName, logoUrl: branding.brand.logoUrl, customized: branding.brand.customized }} />
        </div>
      )}
      {!branding && sp.criada && <div className="mb-6"><Alert tone="green">Empresa cadastrada. Agora você pode criar os acessos, ajustar funcionalidades e limites quando quiser.</Alert></div>}
      {!branding && <div className="space-y-6">
        <Panel title="Acessos da empresa" description="Administradores e vendedores desta empresa." padded={false}
          actions={<UserCreateButton fixedCompanyId={company.id} />}>
          <UsersTable users={users} basePath="/admin/usuarios" currentUserId={ctx.user.id} platformView />
        </Panel>
        <Panel title="Funcionalidades liberadas" description="O menu da empresa é atualizado automaticamente. As restrições valem também no servidor.">
          <CompanyFeatures companyId={company.id} features={features} />
        </Panel>
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Dados da empresa"><CompanyEditForm company={company} plans={plans} /></Panel>
          <Panel title="Limites de utilização"><CompanyLimitsForm companyId={company.id} override={company.limits_override} effective={limits} usage={usage} /></Panel>
        </div>
      </div>}
    </>
  );
}
