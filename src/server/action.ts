import { unstable_rethrow } from "next/navigation";
import { getAuth } from "./auth/next";
import { AppError, toAppError } from "./errors";
import type { AuthContext } from "./auth/core";

export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Executa uma Server Action autenticada, convertendo erros em mensagens em português. */
export async function runAction<T>(
  fn: (ctx: AuthContext) => Promise<{ message?: string; data?: T } | void>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await getAuth();
    if (!ctx) throw new AppError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
    const r = await fn(ctx);
    return { ok: true, ...(r ?? {}) };
  } catch (e) {
    unstable_rethrow(e);
    const err = toAppError(e);
    return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  }
}

export const formToObject = (fd: FormData) =>
  Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$ACTION")).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
