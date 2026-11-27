/**
 * Evolution API v2 (Baileys) — conexão NÃO OFICIAL por QR Code, autorizada pelo dono da plataforma.
 * Um único servidor Evolution atende todas as empresas: cada número é uma "instância" independente.
 * Endpoints conferidos no código-fonte da v2.3.8 (instance.router, sendMessage.router, webhook.controller).
 */
import { ProviderError, type ProviderCredentials, type WhatsAppProvider } from "./provider";

export function evolutionConfig() {
  const url = process.env.EVOLUTION_API_URL || (process.env.EVOLUTION_API_HOSTPORT ? `http://${process.env.EVOLUTION_API_HOSTPORT}` : "");
  return { url: url.replace(/\/$/, ""), apiKey: process.env.EVOLUTION_API_KEY || "", ready: !!(url && process.env.EVOLUTION_API_KEY) };
}

async function evo<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  const cfg = evolutionConfig();
  if (!cfg.ready) throw new ProviderError("O servidor de conexão por QR Code (Evolution API) ainda não foi configurado: defina EVOLUTION_API_URL e EVOLUTION_API_KEY.", false);
  let res: Response;
  try {
    res = await fetch(`${cfg.url}${path}`, {
      method: init?.method ?? "GET",
      headers: { apikey: cfg.apiKey, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000),
    });
  } catch {
    throw new ProviderError("O servidor de conexão do WhatsApp não respondeu. Ele pode estar reiniciando; tente novamente em instantes.", true);
  }
  const json = (await res.json().catch(() => ({}))) as T & { response?: { message?: unknown } };
  if (!res.ok) {
    const detail = JSON.stringify((json as { response?: unknown }).response ?? json).slice(0, 300);
    if (res.status === 401) throw new ProviderError("Chave do servidor Evolution inválida (EVOLUTION_API_KEY).", false);
    if (res.status === 404) throw new ProviderError("Sessão do WhatsApp não encontrada no servidor. Conecte novamente.", false, 404);
    if (res.status === 400 && /exists|not.*whatsapp|exist/i.test(detail)) throw new ProviderError(/exists/i.test(detail) ? "Sessão já existe." : "Este número não possui WhatsApp.", false, 400);
    throw new ProviderError(`O servidor do WhatsApp recusou a operação (${res.status}).`, res.status >= 500 || res.status === 429, res.status);
  }
  return json;
}

export type QrResult = { base64: string | null; code: string | null; pairingCode: string | null };
const qrOf = (r: { base64?: string; code?: string; pairingCode?: string; qrcode?: { base64?: string; code?: string; pairingCode?: string } }): QrResult => ({
  base64: r.qrcode?.base64 ?? r.base64 ?? null, code: r.qrcode?.code ?? r.code ?? null, pairingCode: r.qrcode?.pairingCode ?? r.pairingCode ?? null,
});

export const evolutionApi = {
  /** Cria a sessão da empresa com webhook próprio (segredo individual no cabeçalho). */
  async createInstance(instanceName: string, webhookUrl: string, webhookSecret: string): Promise<QrResult> {
    const r = await evo<Parameters<typeof qrOf>[0]>("/instance/create", { method: "POST", body: {
      instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS",
      rejectCall: false, groupsIgnore: true, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false,
      webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, headers: { "x-mv-webhook-secret": webhookSecret },
        events: ["CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "QRCODE_UPDATED"] },
    } });
    return qrOf(r);
  },
  /** Novo QR (ou código de pareamento quando `number` é informado). */
  async connect(instanceName: string, number?: string): Promise<QrResult> {
    const q = number ? `?number=${encodeURIComponent(number.replace(/\D/g, ""))}` : "";
    return qrOf(await evo(`/instance/connect/${encodeURIComponent(instanceName)}${q}`));
  },
  async state(instanceName: string): Promise<"open" | "close" | "connecting" | string> {
    const r = await evo<{ instance?: { state?: string } }>(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
    return r.instance?.state ?? "close";
  },
  async logout(instanceName: string) { await evo(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" }); },
  async remove(instanceName: string) { await evo(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" }); },
};

/** Mesmo contrato do provedor oficial: campanhas e conversas não mudam. */
export const evolutionProvider: WhatsAppProvider = {
  async verify(c: ProviderCredentials) {
    const st = await evolutionApi.state(c.phoneNumberId);
    if (st !== "open") throw new ProviderError("O WhatsApp não está conectado. Escaneie o QR Code novamente.", false);
    return { displayPhone: "", verifiedName: null, qualityRating: null };
  },
  async subscribeApp() { /* webhook configurado na criação da instância */ },
  async listTemplates() { return []; },
  async sendText(c, to, body) {
    const r = await evo<{ key?: { id?: string } }>(`/message/sendText/${encodeURIComponent(c.phoneNumberId)}`, {
      method: "POST", body: { number: to.replace(/\D/g, ""), text: body }, timeoutMs: 60_000 });
    if (!r.key?.id) throw new ProviderError("O servidor do WhatsApp não confirmou o envio.", true);
    return { providerMessageId: r.key.id };
  },
  async sendMedia(c, to, m) {
    const r = await evo<{ key?: { id?: string } }>(`/message/sendMedia/${encodeURIComponent(c.phoneNumberId)}`, {
      method: "POST", timeoutMs: 120_000,
      body: { number: to.replace(/\D/g, ""), mediatype: m.type, mimetype: m.mimetype, caption: m.caption ?? "", fileName: m.fileName, media: m.base64 } });
    if (!r.key?.id) throw new ProviderError("O servidor do WhatsApp não confirmou o envio do arquivo.", true);
    return { providerMessageId: r.key.id };
  },
  async sendTemplate() {
    throw new ProviderError("Modelos da Meta não se aplicam à conexão por QR Code. Use a mensagem do Script.", false);
  },
};
