import { cookies } from "next/headers";
import { resolveSession, SESSION_COOKIE } from "@/server/auth/core";
import { exportContactsCsv } from "@/server/services/contacts";
import { toAppError } from "@/server/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!ctx) return new Response("Sessão expirada. Entre novamente.", { status: 401 });
  const sp = new URL(req.url).searchParams;
  try {
    const csv = await exportContactsCsv(ctx, {
      q: sp.get("q") ?? undefined, listId: sp.get("lista") ?? undefined, tagId: sp.get("etiqueta") ?? undefined,
      ownerId: sp.get("responsavel") ?? undefined, source: sp.get("origem") ?? undefined, status: sp.get("situacao") ?? undefined,
      consent: sp.get("consentimento") ?? undefined,
    });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contatos-${date}.csv"`,
      "Cache-Control": "no-store",
    } });
  } catch (e) {
    const err = toAppError(e);
    return new Response(err.message, { status: err.code === "FORBIDDEN" ? 403 : 400 });
  }
}
