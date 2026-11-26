import clsx from "clsx";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireModulePage } from "@/server/auth/next";
import { listCampaigns } from "@/server/services/campaigns";
import { Empty, PageHeader } from "@/components/ui";
import { CampaignList } from "@/components/campaigns/campaign-list";

export const metadata = { title: "Campanhas" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ arquivadas?: string; q?: string; status?: string }> }) {
  const ctx = await requireModulePage(["campaigns"]);
  const sp = await searchParams;
  const archived = sp.arquivadas === "1";
  const rows = await listCampaigns(ctx, { archived, q: sp.q, status: sp.status });
  return (
    <>
      <PageHeader title="Campanhas" description="Do contato à venda: cada campanha registra envios, respostas, negociações e vendas geradas."
        actions={<Link href="/campanhas/nova" className="btn btn-primary px-5 py-3 text-[16px]"><Plus className="h-5 w-5" />NOVA CAMPANHA</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <nav className="flex gap-1 rounded-lg bg-surface p-1">
          {[["Ativas", ""], ["Arquivadas", "1"]].map(([l, v]) => (
            <Link key={l} href={v ? "?arquivadas=1" : "?"} className={clsx("rounded-md px-3.5 py-1.5 text-[14.5px] font-semibold", (v === "1") === archived ? "bg-white text-brand-dark shadow-sm" : "text-muted")}>{l}</Link>
          ))}
        </nav>
        <form className="flex flex-1 flex-wrap gap-2">
          {archived && <input type="hidden" name="arquivadas" value="1" />}
          <input name="q" defaultValue={sp.q} className="input max-w-xs py-2" placeholder="Buscar campanha" />
          <select name="status" defaultValue={sp.status ?? ""} className="input w-auto py-2" aria-label="Situação">
            <option value="">Todas as situações</option>
            {[["draft", "Rascunho"], ["scheduled", "Programada"], ["running", "Em andamento"], ["paused", "Pausada"], ["completed", "Concluída"], ["cancelled", "Cancelada"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn btn-secondary">Filtrar</button>
        </form>
      </div>
      {rows.length === 0 ? (
        <div className="panel"><Empty title={archived ? "Nenhuma campanha arquivada" : "Nenhuma campanha ainda"} description="Crie uma campanha: encontre empresas no Google, importe uma planilha ou use uma lista existente, escreva o script e escolha o WhatsApp."
          action={!archived && <Link href="/campanhas/nova" className="btn btn-primary"><Plus className="h-5 w-5" />Nova campanha</Link>} /></div>
      ) : <CampaignList rows={rows} />}
    </>
  );
}
