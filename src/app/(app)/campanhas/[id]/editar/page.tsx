import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { pageError, requireModulePage } from "@/server/auth/next";
import { wizardData } from "@/server/services/campaign-page";
import { PageHeader } from "@/components/ui";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";

export const metadata = { title: "Editar campanha" };

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModulePage(["campaigns"]);
  const { id } = await params;
  const d = await wizardData(ctx, id).catch(pageError);
  if (!["draft", "scheduled", "paused"].includes(d.initial.status ?? "")) redirect(`/campanhas/${id}`);
  return (
    <>
      <Link href="/campanhas" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-dark hover:underline"><ArrowLeft className="h-4 w-4" />Campanhas</Link>
      <PageHeader title={`Editar: ${d.initial.name}`} description={d.initial.status === "paused" ? "Campanha pausada: você pode acrescentar contatos e ajustar a mensagem antes de retomar." : undefined} />
      <CampaignWizard {...d} />
    </>
  );
}
