/**
 * Contrato dos provedores de WhatsApp. A plataforma usa somente esta interface;
 * novos provedores autorizados são adicionados implementando-a (ver INTEGRATIONS.md).
 */
export type ProviderCredentials = { phoneNumberId: string; businessAccountId: string | null; accessToken: string };
export type SendResult = { providerMessageId: string };
export type TemplateInfo = { name: string; language: string; category: string | null; status: string; components: unknown[] };

export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean, public code?: string | number) { super(message); }
}

/** Recursos de onboarding pelo próprio cliente (Embedded Signup / Coexistência). */
export interface OnboardingCapable {
  exchangeCode(code: string): Promise<string>;
  listPhoneNumbers(token: string, wabaId: string): Promise<{ id: string; displayPhone: string; verifiedName: string | null; isOnBizApp: boolean }[]>;
  registerNumber(c: ProviderCredentials, pin: string): Promise<void>;
  requestSync(c: ProviderCredentials, type: "smb_app_state_sync" | "history"): Promise<string | null>;
}

export interface WhatsAppProvider {
  verify(c: ProviderCredentials): Promise<{ displayPhone: string; verifiedName: string | null; qualityRating: string | null }>;
  subscribeApp(c: ProviderCredentials): Promise<void>;
  listTemplates(c: ProviderCredentials): Promise<TemplateInfo[]>;
  sendText(c: ProviderCredentials, toE164: string, body: string): Promise<SendResult>;
  sendTemplate(c: ProviderCredentials, toE164: string, name: string, language: string, params: string[]): Promise<SendResult>;
}
