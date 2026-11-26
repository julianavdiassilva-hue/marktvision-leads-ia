/**
 * Meta WhatsApp Business Platform — Cloud API (Graph API).
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import { ProviderError, type OnboardingCapable, type ProviderCredentials, type TemplateInfo, type WhatsAppProvider } from "./provider";

const base = () => `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || "v27.0"}`;

/** Traduz erros da Meta para mensagens em português e indica se vale tentar de novo. */
function translate(status: number, err: { code?: number; message?: string; error_subcode?: number } | undefined): ProviderError {
  const code = err?.code;
  const retryable = status === 429 || status >= 500 || code === 4 || code === 80007 || code === 130429 || code === 131048 || code === 131056;
  const map: Record<number, string> = {
    190: "Token de acesso inválido ou expirado. Gere um token permanente e reconecte o número.",
    10: "O token não tem permissão para este número (whatsapp_business_messaging).",
    100: "Parâmetro inválido enviado à Meta (verifique o ID do número e do WABA).",
    131026: "O destinatário não pode receber esta mensagem (número sem WhatsApp ou não aceitou os termos).",
    131047: "Fora da janela de 24h: só é permitido enviar um modelo aprovado.",
    131051: "Tipo de mensagem não suportado.",
    132000: "Quantidade de parâmetros diferente do modelo aprovado.",
    132001: "Modelo não encontrado ou não aprovado neste idioma.",
    131031: "Conta do WhatsApp Business bloqueada pela Meta.",
    368: "Conta temporariamente bloqueada pela Meta por violação de política.",
    130429: "Limite de envio da Meta atingido. Os envios continuarão automaticamente.",
    131048: "Limite de envios por qualidade atingido. Os envios continuarão mais devagar.",
    131056: "Muitas mensagens para o mesmo contato em pouco tempo.",
  };
  const msg = (code && map[code]) || (status === 401 ? map[190] : retryable ? "A Meta está indisponível no momento. Nova tentativa automática." : `A Meta recusou a operação${err?.message ? `: ${err.message}` : "."}`);
  return new ProviderError(msg, retryable, code);
}

async function call<T>(c: ProviderCredentials, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}/${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${c.accessToken}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ProviderError("Não foi possível conectar à Meta agora. Nova tentativa automática.", true);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { code?: number; message?: string } };
  if (!res.ok || json?.error) throw translate(res.status, json?.error);
  return json;
}

const digits = (e164: string) => e164.replace(/\D/g, "");

export const metaProvider: WhatsAppProvider = {
  async verify(c) {
    const r = await call<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
      c, `${encodeURIComponent(c.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`);
    return { displayPhone: r.display_phone_number ?? "", verifiedName: r.verified_name ?? null, qualityRating: r.quality_rating ?? null };
  },
  async subscribeApp(c) {
    if (!c.businessAccountId) return;
    await call(c, `${encodeURIComponent(c.businessAccountId)}/subscribed_apps`, { method: "POST" });
  },
  async listTemplates(c) {
    if (!c.businessAccountId) throw new ProviderError("Informe o ID da conta do WhatsApp Business (WABA) para sincronizar os modelos.", false);
    const r = await call<{ data: { name: string; language: string; category?: string; status: string; components?: unknown[] }[] }>(
      c, `${encodeURIComponent(c.businessAccountId)}/message_templates?fields=name,language,status,category,components&limit=200`);
    return r.data.map((t): TemplateInfo => ({ name: t.name, language: t.language, category: t.category ?? null, status: t.status, components: t.components ?? [] }));
  },
  async sendText(c, to, body) {
    const r = await call<{ messages: { id: string }[] }>(c, `${encodeURIComponent(c.phoneNumberId)}/messages`, {
      method: "POST", body: { messaging_product: "whatsapp", recipient_type: "individual", to: digits(to), type: "text", text: { preview_url: false, body } },
    });
    return { providerMessageId: r.messages[0].id };
  },
  async sendTemplate(c, to, name, language, params) {
    const r = await call<{ messages: { id: string }[] }>(c, `${encodeURIComponent(c.phoneNumberId)}/messages`, {
      method: "POST", body: {
        messaging_product: "whatsapp", to: digits(to), type: "template",
        template: { name, language: { code: language }, ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}) },
      },
    });
    return { providerMessageId: r.messages[0].id };
  },
};

/**
 * Onboarding Tech Provider (documentação: Embedded Signup > Onboarding customers as a Tech Provider):
 * 1) trocar o código (validade 5 min) pelo token da empresa cliente; 2) inscrever o app no WABA;
 * 3) registrar o número (EXCETO coexistência); coexistência: sincronizar contatos e histórico em até 24h.
 */
export const metaOnboarding: OnboardingCapable = {
  async exchangeCode(code) {
    const appId = process.env.META_APP_ID, secret = process.env.META_APP_SECRET;
    if (!appId || !secret) throw new ProviderError("Credenciais da plataforma na Meta (META_APP_ID/META_APP_SECRET) não configuradas.", false);
    const qs = new URLSearchParams({ client_id: appId, client_secret: secret, code });
    let res: Response;
    try { res = await fetch(`${base()}/oauth/access_token?${qs}`, { signal: AbortSignal.timeout(20_000) }); }
    catch { throw new ProviderError("Não foi possível conectar à Meta para concluir a conexão.", true); }
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { code?: number; message?: string } };
    if (!res.ok || !json.access_token) throw new ProviderError("A Meta não aceitou o código de conexão (ele expira em 5 minutos). Clique em Conectar WhatsApp novamente.", false);
    return json.access_token;
  },
  async listPhoneNumbers(token, wabaId) {
    const r = await call<{ data: { id: string; display_phone_number?: string; verified_name?: string; is_on_biz_app?: boolean }[] }>(
      { phoneNumberId: "", businessAccountId: wabaId, accessToken: token },
      `${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type`);
    return r.data.map((p) => ({ id: p.id, displayPhone: p.display_phone_number ?? "", verifiedName: p.verified_name ?? null, isOnBizApp: !!p.is_on_biz_app }));
  },
  async registerNumber(c, pin) {
    await call(c, `${encodeURIComponent(c.phoneNumberId)}/register`, { method: "POST", body: { messaging_product: "whatsapp", pin } });
  },
  async requestSync(c, type) {
    const r = await call<{ request_id?: string }>(c, `${encodeURIComponent(c.phoneNumberId)}/smb_app_data`, { method: "POST", body: { messaging_product: "whatsapp", sync_type: type } });
    return r.request_id ?? null;
  },
};

import { evolutionProvider } from "./evolution";
export const PROVIDERS: Record<string, WhatsAppProvider> = { meta_cloud: metaProvider, evolution: evolutionProvider };
