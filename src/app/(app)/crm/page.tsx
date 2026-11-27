import { requireModulePage } from "@/server/auth/next";
import { isCompanyAdmin } from "@/server/guards";
import { getBoard, LOST_REASONS } from "@/server/services/crm";
import { teamOptions } from "@/server/services/contacts";
import { PageHeader } from "@/components/ui";
import { CrmBoard } from "@/components/crm/board";
import { AutoRefresh } from "@/components/auto-refresh";
import { fmtMoney } from "@/lib/format";

export const metadata = { title: "CRM Comercial" };

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ v?: string; q?: string; vendedor?: string }> }) {
  const ctx = await requireModulePage(["crm"]);
  const sp = await searchParams;
  const view = sp.v === "lista" ? "lista" : "kanban";
  const [board, team] = await Promise.all([getBoard(ctx, { q: sp.q, ownerId: sp.vendedor, status: view === "lista" ? "all" : "open" }), teamOptions(ctx)]);
  const open = board.cards.filter((c) => c.status === "open");
  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader title="CRM Comercial" description={`${open.length} negociação(ões) em aberto · ${fmtMoney(open.reduce((a, c) => a + Number(c.value ?? 0), 0))} em negociação. Arraste os cartões entre as etapas.`} />
      <CrmBoard stages={board.stages} cards={board.cards} team={team} view={view} isAdmin={isCompanyAdmin(ctx)} isSeller={ctx.role === "seller"} lostReasons={LOST_REASONS} />
    </>
  );
}
