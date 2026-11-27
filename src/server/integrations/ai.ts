/**
 * Inteligência artificial — provedores intercambiáveis (configuração da plataforma, no servidor):
 *  - anthropic      → Anthropic Claude (SDK oficial). Variáveis: ANTHROPIC_API_KEY, AI_MODEL (padrão claude-opus-5-5).
 *  - openai_compat  → qualquer API no formato "chat completions": Google Gemini (franquia gratuita), Groq (franquia gratuita)
 *                     ou Ollama local (gratuito). Variáveis: AI_BASE_URL, AI_API_KEY (vazio no Ollama), AI_MODEL.
 * AI_PROVIDER escolhe; sem AI_PROVIDER, usa anthropic se houver ANTHROPIC_API_KEY.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../errors";

export type ChatMessage = { role: "user" | "assistant"; content: string };
type Provider = "anthropic" | "openai_compat";

export function aiConfig() {
  const explicit = (process.env.AI_PROVIDER || "").trim() as Provider | "";
  const provider: Provider | null = explicit || (process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.AI_BASE_URL ? "openai_compat" : null);
  const model = process.env.AI_MODEL || (provider === "anthropic" ? "claude-opus-5-5" : "");
  const ready = provider === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : provider === "openai_compat" ? !!(process.env.AI_BASE_URL && model) : false;
  const label = provider === "anthropic" ? "Anthropic Claude"
    : /generativelanguage/.test(process.env.AI_BASE_URL || "") ? "Google Gemini"
    : /groq/.test(process.env.AI_BASE_URL || "") ? "Groq"
    : /ollama|11434/.test(process.env.AI_BASE_URL || "") ? "Ollama (local)" : provider ? "Compatível (OpenAI)" : null;
  return { provider, model, ready, label };
}
export const isAiConfigured = () => aiConfig().ready;

const NOT_CONFIGURED = "A inteligência artificial ainda não foi configurada. O administrador da plataforma precisa escolher um provedor (ANTHROPIC_API_KEY, ou AI_PROVIDER=openai_compat com AI_BASE_URL e AI_MODEL — opções gratuitas no MANUAL).";

let anthropic: Anthropic | null = null;

async function viaAnthropic(system: string, messages: ChatMessage[], effort: "low" | "medium" | "high", maxTokens: number) {
  anthropic ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
  try {
    const response = await anthropic.beta.messages.create({
      model: aiConfig().model, max_tokens: maxTokens, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort }, system, messages,
    } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (response.stop_reason === "refusal") throw new AppError("INTEGRATION", "A IA não pôde gerar este conteúdo. Reformule o pedido.");
    return response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AppError("INTEGRATION", "A chave da IA foi recusada. Verifique ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new AppError("INTEGRATION", "Limite de uso da IA atingido. Tente novamente em instantes.");
    if (e instanceof Anthropic.BadRequestError) { console.error("[ai]", e.message); throw new AppError("INTEGRATION", "A IA recusou a solicitação. Tente outro texto."); }
    if (e instanceof Anthropic.APIConnectionError) throw new AppError("INTEGRATION", "Não foi possível conectar à IA agora.");
    if (e instanceof Anthropic.APIError) { console.error("[ai]", e.status, e.message); throw new AppError("INTEGRATION", "A IA está indisponível no momento. Tente novamente."); }
    throw e;
  }
}

async function viaCompat(system: string, messages: ChatMessage[], maxTokens: number, json: boolean) {
  const base = (process.env.AI_BASE_URL || "").replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}) },
      body: JSON.stringify({ model: aiConfig().model, max_tokens: maxTokens, temperature: 0.3, messages: [{ role: "system", content: system }, ...messages],
        ...(json ? { response_format: { type: "json_object" } } : {}) }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch { throw new AppError("INTEGRATION", "Não foi possível conectar ao provedor de IA. Verifique AI_BASE_URL (no Ollama, confirme que o serviço está ligado)."); }
  const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string };
  if (!res.ok) {
    console.error("[ai compat]", res.status, JSON.stringify(body).slice(0, 400));
    if (res.status === 401 || res.status === 403) throw new AppError("INTEGRATION", "A chave do provedor de IA foi recusada (AI_API_KEY).");
    if (res.status === 429) throw new AppError("INTEGRATION", "Limite da franquia gratuita da IA atingido. Tente mais tarde.");
    if (res.status === 404) throw new AppError("INTEGRATION", "Modelo de IA não encontrado (AI_MODEL). No Ollama, baixe o modelo antes.");
    throw new AppError("INTEGRATION", "O provedor de IA retornou um erro. Tente novamente.");
  }
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AppError("INTEGRATION", "A IA não retornou texto. Tente novamente.");
  return text;
}

/** Conversa com a IA (várias mensagens). */
export async function chat(system: string, messages: ChatMessage[], opts: { effort?: "low" | "medium" | "high"; maxTokens?: number; json?: boolean } = {}) {
  const cfg = aiConfig();
  if (!cfg.ready) throw new AppError("INTEGRATION", NOT_CONFIGURED);
  const text = cfg.provider === "anthropic"
    ? await viaAnthropic(system, messages, opts.effort ?? "low", opts.maxTokens ?? 16000)
    : await viaCompat(system, messages, opts.maxTokens ?? 2000, !!opts.json);
  if (!text) throw new AppError("INTEGRATION", "A IA não retornou texto. Tente novamente.");
  return text;
}

/** Texto simples (mensagens de campanha, sugestões). */
export async function generateText(system: string, prompt: string, opts: { effort?: "low" | "medium" | "high"; maxTokens?: number } = {}) {
  return chat(system, [{ role: "user", content: prompt }], opts);
}

/** Extrai o primeiro objeto JSON da resposta (tolerante a texto ao redor). */
export function parseJsonReply<T>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { return null; }
}
