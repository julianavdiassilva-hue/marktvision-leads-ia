import { withScope, SYSTEM } from "@/server/db";
import { processWhatsAppWebhook, validSignature } from "@/server/webhooks/whatsapp";

export const dynamic = "force-dynamic";

/** Verificação do webhook pela Meta (hub.challenge). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (sp.get("hub.mode") === "subscribe" && token && sp.get("hub.verify_token") === token)
    return new Response(sp.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Token de verificação inválido.", { status: 403 });
}

/** Eventos da Meta: assinatura HMAC obrigatória; o payload bruto é registrado antes de processar. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!process.env.META_APP_SECRET) return new Response("Webhook não configurado.", { status: 503 });
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET))
    return new Response("Assinatura inválida.", { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("JSON inválido.", { status: 400 }); }
  const ev = await withScope(SYSTEM, (db) => db.one<{ id: number }>(`insert into webhook_events (provider, payload) values ('meta_whatsapp', $1) returning id`, [payload]));
  try {
    await processWhatsAppWebhook(payload as never);
    await withScope(SYSTEM, (db) => db.exec(`update webhook_events set processed_at = now() where id = $1`, [ev.id]));
  } catch (e) {
    // registrado para reprocessamento; responde 200 para a Meta não reenviar em loop
    console.error("[webhook whatsapp]", e);
    await withScope(SYSTEM, (db) => db.exec(`update webhook_events set error = $2 where id = $1`, [ev.id, String((e as Error)?.message ?? e).slice(0, 1000)]));
  }
  return new Response("ok", { status: 200 });
}
