import { requireModulePage } from "@/server/auth/next";
import { getBranding } from "@/server/services/branding";
import { PageHeader } from "@/components/ui";
import { BrandingEditor } from "@/components/branding/branding-editor";

export const metadata = { title: "Identidade visual" };

/** Personalização do próprio ambiente pelo administrador da empresa (quando liberada pelo administrador geral). */
export default async function OwnBrandingPage() {
  const ctx = await requireModulePage(["branding"], { adminOnly: true });
  const { brand, canEditSlug } = await getBranding(ctx, ctx.company!.id);
  return (
    <>
      <PageHeader title="Identidade visual" description="Logomarca, cores e nome exibido para todos os usuários da sua empresa. Não altera outras empresas." />
      <BrandingEditor companyId={brand.companyId} companyName={brand.companyName} slug={brand.slug} canEditSlug={canEditSlug}
        initial={{ colors: brand.colors, displayName: brand.displayName, logoUrl: brand.logoUrl, customized: brand.customized }} />
    </>
  );
}
