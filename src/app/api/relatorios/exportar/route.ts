import { cookies } from "next/headers";
import { resolveSession, SESSION_COOKIE } from "@/server/auth/core";
import { buildReport, reportCsv, reportXlsx } from "@/server/services/reports";
import { periodOf } from "@/server/services/team";
import { toAppError } from "@/server/errors";
import { assertFeature } from "@/server/guards";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!ctx) return new Response("Sessão expirada. Entre novamente.", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  try {
    assertFeature(ctx, "data_export");
    const r = await buildReport(ctx, sp.tipo ?? "", { ...periodOf(sp), sellerId: sp.vendedor, campaignId: sp.campanha, source: sp.origem });
    const name = `relatorio-${r.type}-${r.period.from}_a_${r.period.to}`;
    if (sp.formato === "xlsx") {
      return new Response(new Uint8Array(await reportXlsx(r)), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"`, "Cache-Control": "no-store" } });
    }
    return new Response(reportCsv(r), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
  } catch (e) {
    const err = toAppError(e);
    return new Response(err.message, { status: err.code === "FORBIDDEN" ? 403 : 400 });
  }
}
