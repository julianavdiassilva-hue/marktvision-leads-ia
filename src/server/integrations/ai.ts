/**
 * Inteligência artificial — Anthropic Claude (SDK oficial).
 * Chave: ANTHROPIC_API_KEY (somente servidor). Modelo: AI_MODEL (padrão claude-opus-5-5).
 * Fallback no servidor habilitado: se o modelo recusar por política, a API reencaminha
 * a mesma solicitação automaticamente (beta server-side-fallback).
 */
import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../errors";

export const isAiConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const MODEL = () => process.env.AI_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new AppError("INTEGRATION", "A inteligência artificial ainda não foi configurada. O administrador da plataforma precisa cadastrar a chave ANTHROPIC_API_KEY (veja INTEGRATIONS.md).");
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return client;
}

/** Gera texto simples (sem ferramentas). Usado por mensagens de campanha e, na Fase 08, pelo chatbot. */
export async function generateText(system: string, prompt: string, opts: { effort?: "low" | "medium" | "high"; maxTokens?: number } = {}): Promise<string> {
  const c = getClient();
  try {
    const response = await c.beta.messages.create({
      model: MODEL(),
      max_tokens: opts.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "low" },
      system,
      messages: [{ role: "user", content: prompt }],
    } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (response.stop_reason === "refusal") throw new AppError("INTEGRATION", "A IA não pôde gerar este conteúdo. Reformule o pedido.");
    const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!text) throw new AppError("INTEGRATION", "A IA não retornou texto. Tente novamente.");
    return text;
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
