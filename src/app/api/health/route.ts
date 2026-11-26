import { withScope, SYSTEM } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await withScope(SYSTEM, (db) => db.query("select 1"));
    return Response.json({ status: "ok", database: "ok" });
  } catch {
    return Response.json({ status: "error", database: "indisponível" }, { status: 503 });
  }
}
