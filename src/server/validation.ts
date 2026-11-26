import { z } from "zod";
import { invalid } from "./errors";

/** Converte campos vazios em undefined (campos opcionais nunca bloqueiam o cadastro). */
export const optionalText = (max = 300) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v),
    z.string().max(max, `Máximo de ${max} caracteres.`).optional());

export const requiredText = (label: string, max = 200) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v),
    z.string({ error: `Informe ${label}.` }).min(1, `Informe ${label}.`).max(max, `Máximo de ${max} caracteres.`));

export const uuid = z.string().uuid("Identificador inválido.");

export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join(".") || "_";
    if (!fieldErrors[k]) fieldErrors[k] = issue.message;
  }
  throw invalid(Object.values(fieldErrors)[0] ?? "Dados inválidos.", fieldErrors);
}
