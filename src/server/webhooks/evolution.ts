/**
 * Webhooks da Evolution API (conexão por QR Code). Cada sessão tem segredo próprio
 * (cabeçalho x-mv-webhook-secret, guardado só como hash). Os eventos são convertidos
 * para o mesmo formato tratado pela integração oficial — mesma lógica de negócio.
 */
import { timingSafeEqual } from "node:crypto";
import { withScope, SYSTEM, type Db } from "../db";
import { hashSecret } from "../services/whatsapp";
import { handleEchoes, handleMessages, type Conn } from "./whatsapp";

type EvoKey = { remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean; id?: string; participant?: string };
type EvoMessage = { key?: EvoKey; pushName?: string; message?: Record<string, unknown>; messageType?: string; messageTimestamp?: number };
export type EvoPayload = { event?: string; instance?: string; data?: unknown };

const STATUS: Record<string, string> = { SERVER_ACK: "sent", DELIVERY_ACK: "delivered", READ: "read", PLAYED: "read", ERROR: "failed" };

/** Converte a mensagem do WhatsApp (Baileys) para o formato comum (tipo + conteúdo). */
export function toCommon(m: EvoMessage): { type: string; [k: string]: unknown } {
  const msg = (m.message ?? {}) as Record<string, Record<string, unknown> | string | undefined>;
  if (typeof msg.conversation === "string") return { type: "text", text: { body: msg.conversation } };
  const ext = msg.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return { type: "text", text: { body: ext.text } };
  const media: [string, string][] = [["imageMessage", "image"], ["videoMessage", "video"], ["documentMessage", "document"], ["audioMessage", "audio"], ["stickerMessage", "sticker"]];
  for (const [k, t] of media) if (msg[k]) { const v = msg[k] as { caption?: string; fileName?: string }; return { type: t, [t]: { caption: v.caption, filename: v.fileName } }; }
  const btn = (msg.buttonsResponseMessage as { selectedDisplayText?: string } | undefined) ?? (msg.templateButtonReplyMessage as { selectedDisplayText?: string } | undefined);
  if (btn?.selectedDisplayText) return { type: "button", button: { text: btn.selectedDisplayText } };
  const list = msg.listResponseMessage as { title?: string } | undefined;
  if (list?.title) return { type: "interactive", interactive: { list_reply: { title: list.title } } };
  if (msg.locationMessage) { const l = msg.locationMessage as { name?: string; address?: string }; return { type: "location", location: { name: l.name, address: l.address } }; }
  if (msg.contactMessage || msg.contactsArrayMessage) return { type: "contacts", contacts: {} };
  if (msg.reactionMessage) return { type: "reaction", reaction: { emoji: (msg.reactionMessage as { text?: string }).text } };
  return { type: m.messageType ?? "unsupported", [m.messageType ?? "unsupported"]: {} };
}

/** Telefone (dígitos) e identificador alternativo do contato. Ignora grupos, status e canais. */
export function peerOf(key: EvoKey): { phone: string | null; userId: string | null } | null {
  const jid = key.remoteJid ?? "";
  if (/@g\.us$|@broadcast$|@newsletter$/.test(jid)) return null;
  const alt = key.remoteJidAlt ?? "";
  const pick = (j: string) => (j.endsWith("@s.whatsapp.net") ? j.split("@")[0].split(":")[0] : null);
  const phone = pick(jid) ?? pick(alt);
  const userId = jid.endsWith("@lid") ? jid : alt.endsWith("@lid") ? alt : null;
  if (!phone && !userId) return null;
  return { phone, userId };
}

async function connByInstance(db: Db, instance: string) {
  return db.maybeOne<Conn & { webhook_secret_hash: string | null }>(
    `select id, company_id, phone_number, connection_mode, webhook_secret_hash from whatsapp_connections where provider = 'evolution' and instance_name = $1`, [instance]);
}

export async function authenticateEvolution(instance: string | undefined, secret: string | null) {
  if (!instance || !secret) return false;
  const c = await withScope(SYSTEM, (db) => connByInstance(db, instance));
  if (!c?.webhook_secret_hash) return false;
  const a = Buffer.from(hashSecret(secret), "hex"), b = Buffer.from(c.webhook_secret_hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function processEvolutionWebhook(p: EvoPayload) {
  if (!p.instance) return { handled: 0 };
  return withScope(SYSTEM, async (db) => {
    const conn = await connByInstance(db, p.instance!);
    if (!conn) return { handled: 0 };
    const ev = (p.event ?? "").toLowerCase().replace(/_/g, ".");
    if (ev === "connection.update") {
      const d = (p.data ?? {}) as { state?: string; statusReason?: number; wuid?: string; profileName?: string };
      if (d.state === "open") {
        const phone = d.wuid ? "+" + d.wuid.split("@")[0].split(":")[0] : null;
        await db.exec(`update whatsapp_connections set status = 'connected', connected_at = coalesce(connected_at, now()), last_sync_at = now(), last_error = null,
                          phone_number = coalesce($2, phone_number) where id = $1`, [conn.id, phone]);
      } else if (d.state === "close") {
        const loggedOut = d.statusReason === 401;
        await db.exec(`update whatsapp_connections set status = $2, last_error = $3 where id = $1 and status <> 'pending'`,
          [conn.id, loggedOut ? "disconnected" : "error", loggedOut ? "O WhatsApp foi desconectado no celular (Aparelhos conectados). Gere um novo QR Code para reconectar." : "Conexão com o WhatsApp interrompida. O servidor tenta reconectar automaticamente."]);
      }
      return { handled: 1 };
    }
    if (ev === "messages.upsert") {
      const list = (Array.isArray(p.data) ? p.data : [p.data]) as EvoMessage[];
      let n = 0;
      for (const m of list) {
        if (!m?.key?.id) continue;
        const peer = peerOf(m.key); if (!peer) continue;
        const common = { ...toCommon(m), id: m.key.id, timestamp: m.messageTimestamp ? String(m.messageTimestamp) : undefined };
        if (m.key.fromMe) {
          // enviada pelo próprio celular (ou eco do envio da plataforma — ignorado pelo id repetido)
          await handleEchoes(db, conn, { message_echoes: [{ ...common, from: (conn.phone_number ?? "").replace(/\D/g, ""), to: peer.phone ?? undefined, to_user_id: peer.userId ?? undefined }] });
        } else {
          await handleMessages(db, conn, {
            contacts: [{ wa_id: peer.phone ?? undefined, user_id: peer.userId ?? undefined, profile: { name: m.pushName } }],
            messages: [{ ...common, from: peer.phone ?? undefined, from_user_id: peer.userId ?? undefined }],
          });
        }
        n++;
      }
      await db.exec(`update whatsapp_connections set last_sync_at = now() where id = $1`, [conn.id]);
      return { handled: n };
    }
    if (ev === "messages.update") {
      const list = (Array.isArray(p.data) ? p.data : [p.data]) as { keyId?: string; status?: string; fromMe?: boolean }[];
      const statuses = list.filter((u) => u?.keyId && u.fromMe !== false && STATUS[u.status ?? ""]).map((u) => ({ id: u.keyId!, status: STATUS[u.status!] }));
      if (statuses.length) await handleMessages(db, conn, { statuses });
      return { handled: statuses.length };
    }
    return { handled: 0 }; // qrcode.updated: o QR é obtido pela tela de conexão
  });
}
