import { authenticateEvolution, processEvolutionWebhook, type EvoPayload } from "@/server/webhooks/evolution";
import { withScope, SYSTEM } from "@/server/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let payload: EvoPayload;
  try { payload = (await req.json()) as EvoPayload; } catch { return new Response("JSON inválido.", { status: 400 }); }
  if (!(await authenticateEvolution(payload.instance, req.headers.get("x-mv-webhook-secret"))))
    return new Response("Não autorizado.", { status: 401 }); // 401 não é reenviado pela Evolution
  const ev = await withScope(SYSTEM, (db) => db.one<{ id: number }>(`insert into webhook_events (provider, payload) values ('evolution', $1) returning id`, [payload]));
  try {
    await processEvolutionWebhook(payload);
    await withScope(SYSTEM, (db) => db.exec(`update webhook_events set processed_at = now() where id = $1`, [ev.id]));
  } catch (e) {
    console.error("[webhook evolution]", e);
    await withScope(SYSTEM, (db) => db.exec(`update webhook_events set error = $2 where id = $1`, [ev.id, String((e as Error)?.message ?? e).slice(0, 1000)]));
  }
  return new Response("ok", { status: 200 });
}
