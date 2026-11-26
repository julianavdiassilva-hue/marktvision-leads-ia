import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModulePage } from "@/server/auth/next";
import { wizardData } from "@/server/services/campaign-page";
import { PageHeader } from "@/components/ui";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";

export const metadata = { title: "Nova campanha" };

export default async function NewCampaignPage() {
  const ctx = await requireModulePage(["campaigns"]);
  const d = await wizardData(ctx);
  return (
    <>
      <Link href="/campanhas" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-dark hover:underline"><ArrowLeft className="h-4 w-4" />Campanhas</Link>
      <PageHeader title="Nova campanha" description="Configure toda a operação nesta tela: contatos, script, WhatsApp e atendimento." />
      <CampaignWizard {...d} />
    </>
  );
}
