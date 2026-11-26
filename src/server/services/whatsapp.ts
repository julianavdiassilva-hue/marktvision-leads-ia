import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "../auth/core";
import { withScope, type Db } from "../db";
import { AppError, notFound } from "../errors";
import { assertCompany, assertCompanyAdmin, assertFeature, scopeOf } from "../guards";
import { audit } from "../audit";
import { companyLimits } from "../permissions";
import { decrypt, encrypt } from "../crypto";
import { PROVIDERS } from "../integrations/whatsapp/meta";
import { ProviderError, type ProviderCredentials } from "../integrations/whatsapp/provider";
import { parse, requiredText, uuid } from "../validation";

const connectSchema = z.object({
  displayName: requiredText("o nome da conexão", 80),
  phoneNumberId: z.string().trim().regex(/^\d{6,30}$/, "ID do número inválido (somente dígitos, copiado do painel da Meta)."),
  businessAccountId: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().regex(/^\d{6,30}$/, "ID da conta (WABA) inválido.").optional()),
  accessToken: z.string().trim().min(20, "Cole o token de acesso permanente gerado na Meta."),
  perMinute: z.coerce.number().int().min(1).max(200).default(20),
});
export type ConnectInput = z.input<typeof connectSchema>;

export type ConnectionRow = {
  id: string; display_name: string; phone_number: string | null; phone_number_id: string | null; business_account_id: string | null;
  status: string; connected_at: string | null; last_sync_at: string | null; last_error: string | null; quality_rating: string | null;
  settings: { per_minute?: number }; templates: number; messages_month: number; provider: string;
  connection_mode: string; onboarding: Record<string, unknown>;
};

const providerError = (e: unknown) => (e instanceof ProviderError ? new AppError("INTEGRATION", e.message) : e);

export async function listConnections(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "whatsapp");
  return withScope(scopeOf(ctx), (db) => db.query<ConnectionRow>(
    `select w.id, w.display_name, w.phone_number, w.phone_number_id, w.business_account_id, w.status, w.connected_at, w.last_sync_at,
            w.last_error, w.quality_rating, w.settings, w.provider, w.connection_mode, w.onboarding,
            (select count(*)::int from whatsapp_templates t where t.connection_id = w.id) as templates,
            (select count(*)::int from messages m join conversations cv on cv.id = m.conversation_id
              where cv.whatsapp_connection_id = w.id and m.direction = 'outbound' and m.created_at >= date_trunc('month', now())) as messages_month
       from whatsapp_connections w where w.company_id = $1 order by w.created_at`, [companyId]));
}

/** Credenciais descriptografadas — uso exclusivo do servidor (envio e webhooks). */
export async function credentialsOf(db: Db, connectionId: string): Promise<ProviderCredentials & { provider: string }> {
  const w = await db.one<{ provider: string; phone_number_id: string; business_account_id: string | null; credentials_encrypted: string | null }>(
    `select provider, phone_number_id, business_account_id, credentials_encrypted from whatsapp_connections where id = $1`, [connectionId]);
  if (!w.credentials_encrypted) throw new ProviderError("Conexão sem token de acesso. Reconecte o número.", false);
  return { provider: w.provider, phoneNumberId: w.phone_number_id, businessAccountId: w.business_account_id, accessToken: decrypt(w.credentials_encrypted) };
}

/** Conecta um número: valida as credenciais NA META antes de salvar como conectado. */
export async function connectNumber(ctx: AuthContext, raw: ConnectInput, existingId?: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "whatsapp");
  assertCompanyAdmin(ctx);
  const i = parse(connectSchema, raw);
  const creds = { phoneNumberId: i.phoneNumberId, businessAccountId: i.businessAccountId ?? null, accessToken: i.accessToken };
  const provider = PROVIDERS.meta_cloud;
  let info;
  try { info = await provider.verify(creds); } catch (e) { throw providerError(e); }
  let subscribeWarning: string | null = null;
  try { await provider.subscribeApp(creds); } catch (e) { subscribeWarning = e instanceof Error ? e.message : "falha ao inscrever o app"; }
  return withScope(scopeOf(ctx), async (db) => {
    if (!existingId) {
      const limits = await companyLimits(db, companyId);
      const { n } = await db.one<{ n: number }>(`select count(*)::int as n from whatsapp_connections where company_id = $1`, [companyId]);
      if (limits.max_whatsapp_connections != null && n >= limits.max_whatsapp_connections)
        throw new AppError("LIMIT", `Limite de ${limits.max_whatsapp_connections} número(s) de WhatsApp do plano atingido.`);
    }
    // o mesmo número não pode estar ligado a duas empresas
    const other = await withScope({ system: true }, (sys) => sys.maybeOne<{ id: string }>(
      `select id from whatsapp_connections where phone_number_id = $1 and id is distinct from $2`, [i.phoneNumberId, existingId ?? null]));
    if (other) throw new AppError("CONFLICT", "Este número já está conectado na plataforma (nesta ou em outra empresa).");
    const id = existingId ?? randomUUID();
    const values = [id, companyId, i.displayName, info.displayPhone || null, i.phoneNumberId, i.businessAccountId ?? null, encrypt(i.accessToken),
      info.qualityRating, { per_minute: i.perMinute }, ctx.user.id];
    if (existingId) {
      const n = await db.exec(`update whatsapp_connections set display_name=$3, phone_number=$4, phone_number_id=$5, business_account_id=$6,
          credentials_encrypted=$7, quality_rating=$8, settings=$9, status='connected', connected_at=now(), last_sync_at=now(), last_error=null
         where id=$1 and company_id=$2 and $10::uuid is not null`, values);
      if (!n) throw notFound("Conexão não encontrada.");
    } else {
      await db.exec(`insert into whatsapp_connections (id, company_id, display_name, phone_number, phone_number_id, business_account_id,
          credentials_encrypted, quality_rating, settings, created_by, provider, status, connected_at, last_sync_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'meta_cloud','connected',now(),now())`, values);
    }
    await audit(db, ctx, "whatsapp.connect", { type: "whatsapp_connection", id }, { phone: info.displayPhone });
    return { id, displayPhone: info.displayPhone, verifiedName: info.verifiedName, subscribeWarning };
  });
}

async function loadOwn(db: Db, companyId: string, id: string) {
  parse(uuid, id);
  const w = await db.maybeOne<{ id: string; status: string }>(`select id, status from whatsapp_connections where id=$1 and company_id=$2`, [id, companyId]);
  if (!w) throw notFound("Conexão não encontrada.");
  return w;
}

/** Testa a conexão na Meta e atualiza status/última sincronização. */
export async function testConnection(ctx: AuthContext, id: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "whatsapp");
  return withScope(scopeOf(ctx), async (db) => {
    await loadOwn(db, companyId, id);
    try {
      const creds = await credentialsOf(db, id);
      const info = await PROVIDERS[creds.provider].verify(creds);
      await db.exec(`update whatsapp_connections set status='connected', last_sync_at=now(), last_error=null, quality_rating=$2, phone_number=coalesce($3, phone_number) where id=$1`,
        [id, info.qualityRating, info.displayPhone || null]);
      return { ok: true, message: `Conexão ativa: ${info.displayPhone}${info.verifiedName ? ` (${info.verifiedName})` : ""}.` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao testar.";
      await db.exec(`update whatsapp_connections set status='error', last_sync_at=now(), last_error=$2 where id=$1`, [id, msg]);
      return { ok: false, message: msg };
    }
  });
}

export async function syncTemplates(ctx: AuthContext, id: string) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "whatsapp");
  return withScope(scopeOf(ctx), async (db) => {
    await loadOwn(db, companyId, id);
    let list;
    try { const creds = await credentialsOf(db, id); list = await PROVIDERS[creds.provider].listTemplates(creds); } catch (e) { throw providerError(e); }
    await db.exec(`delete from whatsapp_templates where connection_id = $1 and not (name || '|' || language = any($2::text[]))`, [id, list.map((t) => `${t.name}|${t.language}`)]);
    for (const t of list) {
      await db.exec(`insert into whatsapp_templates (company_id, connection_id, name, language, category, status, components, synced_at)
                     values ($1,$2,$3,$4,$5,$6,$7,now())
                     on conflict (connection_id, name, language) do update set category=excluded.category, status=excluded.status, components=excluded.components, synced_at=now()`,
        [companyId, id, t.name, t.language, t.category, t.status, JSON.stringify(t.components)]);
    }
    await db.exec(`update whatsapp_connections set last_sync_at = now() where id = $1`, [id]);
    return { total: list.length, approved: list.filter((t) => t.status === "APPROVED").length };
  });
}

export async function disconnectNumber(ctx: AuthContext, id: string, remove = false) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "whatsapp");
  assertCompanyAdmin(ctx);
  return withScope(scopeOf(ctx), async (db) => {
    await loadOwn(db, companyId, id);
    const running = await db.maybeOne<{ n: number }>(`select count(*)::int as n from campaigns where whatsapp_connection_id = $1 and status in ('running','scheduled')`, [id]);
    if (running && running.n > 0) throw new AppError("CONFLICT", "Há campanhas em andamento ou programadas com este número. Pause-as antes de desconectar.");
    if (remove) await db.exec(`delete from whatsapp_connections where id = $1`, [id]);
    else await db.exec(`update whatsapp_connections set status='disconnected', credentials_encrypted=null, last_error=null where id = $1`, [id]);
    await audit(db, ctx, remove ? "whatsapp.delete" : "whatsapp.disconnect", { type: "whatsapp_connection", id });
  });
}

export async function updateConnectionSettings(ctx: AuthContext, id: string, perMinute: number) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "whatsapp");
  assertCompanyAdmin(ctx);
  const pm = parse(z.coerce.number().int().min(1, "Mínimo 1 por minuto.").max(200, "Máximo 200 por minuto."), perMinute);
  return withScope(scopeOf(ctx), async (db) => {
    await loadOwn(db, companyId, id);
    await db.exec(`update whatsapp_connections set settings = settings || $2 where id = $1`, [id, { per_minute: pm }]);
  });
}

export type TemplateRow = { id: string; connection_id: string; name: string; language: string; category: string | null; status: string; body: string; params: number };

/** Modelos aprovados com o texto do corpo e a quantidade de parâmetros {{n}}. */
export async function listTemplates(ctx: AuthContext, onlyApproved = true) {
  const companyId = assertCompany(ctx);
  return withScope(scopeOf(ctx), async (db) => (await db.query<{ id: string; connection_id: string; name: string; language: string; category: string | null; status: string; components: { type: string; text?: string }[] }>(
    `select id, connection_id, name, language, category, status, components from whatsapp_templates
      where company_id = $1 and ($2 = false or status = 'APPROVED') order by name`, [companyId, onlyApproved])).map((t) => {
    const body = t.components.find((c) => c.type === "BODY")?.text ?? "";
    const params = new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
    return { id: t.id, connection_id: t.connection_id, name: t.name, language: t.language, category: t.category, status: t.status, body, params } satisfies TemplateRow;
  }));
}

export function webhookInfo() {
  const base = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
  return {
    url: base ? `${base}/api/webhooks/whatsapp` : null,
    verifyTokenConfigured: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
    appSecretConfigured: !!process.env.META_APP_SECRET,
    encryptionConfigured: !!process.env.ENCRYPTION_KEY,
  };
}

// ---------------------------------------------------------------------
// Conexão pelo próprio cliente — Embedded Signup (oficial Meta)
// ---------------------------------------------------------------------
/** Dados públicos para abrir o fluxo no navegador (App ID e Config ID não são segredos). */
export function embeddedSignupConfig() {
  const appId = process.env.META_APP_ID || null;
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || null;
  return {
    appId, configId, graphVersion: process.env.META_GRAPH_API_VERSION || "v27.0",
    ready: !!(appId && configId && process.env.META_APP_SECRET && process.env.ENCRYPTION_KEY),
    webhookReady: !!(process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN),
  };
}

const signupSchema = z.object({
  code: z.string().min(10, "Código de conexão ausente. Refaça a conexão."),
  event: z.enum(["FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"]),
  wabaId: z.string().regex(/^\d{1,30}$/, "Conta do WhatsApp (WABA) não informada pela Meta."),
  phoneNumberId: z.string().regex(/^\d{1,30}$/).optional().nullable(),
  businessId: z.string().regex(/^\d{1,30}$/).optional().nullable(),
  displayName: z.string().trim().max(80).optional(),
});
export type SignupInput = z.input<typeof signupSchema>;

/** Conclui o onboarding com o token próprio da empresa cliente (nunca um token compartilhado). */
export async function completeEmbeddedSignup(ctx: AuthContext, raw: SignupInput) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "whatsapp");
  assertCompanyAdmin(ctx);
  const i = parse(signupSchema, raw);
  const { metaOnboarding } = await import("../integrations/whatsapp/meta");
  const coexistence = i.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
  try {
    const token = await metaOnboarding.exchangeCode(i.code);
    let phoneNumberId = i.phoneNumberId ?? null;
    let displayPhone = "";
    let verifiedName: string | null = null;
    if (!phoneNumberId) {
      const nums = await metaOnboarding.listPhoneNumbers(token, i.wabaId);
      const pick = nums.find((n) => n.isOnBizApp) ?? nums[0];
      if (!pick) throw new ProviderError("Nenhum número foi encontrado na conta conectada.", false);
      phoneNumberId = pick.id; displayPhone = pick.displayPhone; verifiedName = pick.verifiedName;
    }
    const creds = { phoneNumberId, businessAccountId: i.wabaId, accessToken: token };
    await PROVIDERS.meta_cloud.subscribeApp(creds);
    let pinEnc: string | null = null;
    if (!coexistence) {
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      await metaOnboarding.registerNumber(creds, pin);
      pinEnc = encrypt(pin);
    }
    const info = await PROVIDERS.meta_cloud.verify(creds);
    displayPhone = info.displayPhone || displayPhone; verifiedName = info.verifiedName ?? verifiedName;

    return await withScope(scopeOf(ctx), async (db) => {
      const existing = await withScope({ system: true }, (sys) => sys.maybeOne<{ id: string; company_id: string }>(
        `select id, company_id from whatsapp_connections where phone_number_id = $1`, [phoneNumberId]));
      if (existing && existing.company_id !== companyId) throw new AppError("CONFLICT", "Este número já está conectado a outra empresa na plataforma.");
      if (!existing) {
        const limits = await companyLimits(db, companyId);
        const { n } = await db.one<{ n: number }>(`select count(*)::int as n from whatsapp_connections where company_id = $1`, [companyId]);
        if (limits.max_whatsapp_connections != null && n >= limits.max_whatsapp_connections)
          throw new AppError("LIMIT", `Limite de ${limits.max_whatsapp_connections} número(s) de WhatsApp do plano atingido.`);
      }
      const id = existing?.id ?? randomUUID();
      const mode = coexistence ? "coexistence" : "cloud_api";
      const name = i.displayName || verifiedName || displayPhone || "WhatsApp";
      const onboarding = coexistence ? { coexistence: true, onboarded_at: new Date().toISOString(), sync_deadline: new Date(Date.now() + 24 * 3600_000).toISOString() } : {};
      await db.exec(
        `insert into whatsapp_connections (id, company_id, provider, connection_mode, display_name, phone_number, phone_number_id, business_account_id, business_id,
            credentials_encrypted, register_pin_encrypted, quality_rating, settings, onboarding, status, connected_at, last_sync_at, created_by)
         values ($1,$2,'meta_cloud',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'connected',now(),now(),$14)
         on conflict (id) do update set connection_mode=excluded.connection_mode, phone_number=excluded.phone_number, business_account_id=excluded.business_account_id,
            business_id=excluded.business_id, credentials_encrypted=excluded.credentials_encrypted, register_pin_encrypted=coalesce(excluded.register_pin_encrypted, whatsapp_connections.register_pin_encrypted),
            quality_rating=excluded.quality_rating, onboarding=whatsapp_connections.onboarding || excluded.onboarding, status='connected', connected_at=now(), last_error=null`,
        [id, companyId, mode, name, displayPhone || null, phoneNumberId, i.wabaId, i.businessId ?? null, encrypt(token), pinEnc, info.qualityRating,
         { per_minute: coexistence ? 60 : 20 }, onboarding, ctx.user.id]);
      if (coexistence) {
        // a Meta exige sincronizar contatos e histórico em até 24h após o onboarding
        await db.exec(`insert into jobs (company_id, type, payload, dedupe_key) values ($1,'whatsapp.coexistence_sync',$2,$3) on conflict do nothing`,
          [companyId, { connectionId: id }, `coexistence_sync:${id}`]);
      }
      await audit(db, ctx, existing ? "whatsapp.reconnect" : "whatsapp.connect", { type: "whatsapp_connection", id }, { mode, phone: displayPhone });
      return { id, mode, displayPhone, verifiedName, reconnected: !!existing };
    });
  } catch (e) { throw providerError(e); }
}

// ---------------------------------------------------------------------
// Vendedores responsáveis por número
// ---------------------------------------------------------------------
export async function connectionMembers(ctx: AuthContext) {
  const companyId = assertCompany(ctx);
  return withScope(scopeOf(ctx), (db) => db.query<{ connection_id: string; user_id: string; name: string }>(
    `select m.connection_id, m.user_id, u.name from whatsapp_connection_members m join users u on u.id = m.user_id where m.company_id = $1 order by u.name`, [companyId]));
}

export async function setConnectionMembers(ctx: AuthContext, connectionId: string, userIds: string[]) {
  const companyId = assertCompany(ctx);
  assertFeature(ctx, "whatsapp");
  assertCompanyAdmin(ctx);
  const ids = parse(z.array(uuid).max(500), userIds);
  return withScope(scopeOf(ctx), async (db) => {
    await loadOwn(db, companyId, connectionId);
    const valid = (await db.query<{ user_id: string }>(`select user_id from company_memberships where company_id = $1 and is_active and user_id = any($2::uuid[])`, [companyId, ids])).map((r) => r.user_id);
    await db.exec(`delete from whatsapp_connection_members where connection_id = $1 and not (user_id = any($2::uuid[]))`, [connectionId, valid]);
    await db.exec(`insert into whatsapp_connection_members (company_id, connection_id, user_id) select $1, $2, unnest($3::uuid[]) on conflict do nothing`, [companyId, connectionId, valid]);
    await audit(db, ctx, "whatsapp.members", { type: "whatsapp_connection", id: connectionId }, { users: valid.length });
    return { count: valid.length };
  });
}
