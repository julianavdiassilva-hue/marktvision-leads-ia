/** Erros de domínio com mensagens em português, seguros para exibir ao usuário. */
export type ErrorCode =
  | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION"
  | "CONFLICT" | "LIMIT" | "RATE_LIMIT" | "INTEGRATION" | "INTERNAL";

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "Você não tem permissão para realizar esta ação.") => new AppError("FORBIDDEN", msg);
export const notFound = (msg = "Registro não encontrado.") => new AppError("NOT_FOUND", msg);
export const invalid = (msg: string, fieldErrors?: Record<string, string>) => new AppError("VALIDATION", msg, fieldErrors);

const UNIQUE_MESSAGES: Record<string, string> = {
  users_username_key: "Este login já está em uso. Escolha outro.",
  plans_name_uq: "Já existe um plano com este nome.",
  company_memberships_company_id_user_id_key: "Este usuário já está vinculado a esta empresa.",
  contacts_phone_uq: "Já existe um contato com este telefone.",
  contact_lists_name_uq: "Já existe uma lista com este nome.",
  tags_name_uq: "Já existe uma etiqueta com este nome.",
};

/** Converte qualquer erro em AppError com mensagem amigável em português. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const pg = e as { code?: string; constraint?: string; message?: string };
  if (pg?.code === "23505") {
    return new AppError("CONFLICT", UNIQUE_MESSAGES[pg.constraint ?? ""] ?? "Registro duplicado.");
  }
  if (pg?.code === "23503") return new AppError("CONFLICT", "Registro vinculado a outros dados; operação não permitida.");
  if (pg?.code === "23514") return new AppError("VALIDATION", "Dados inválidos. Verifique os campos informados.");
  if (pg?.code === "42501") return forbidden("Acesso negado pela política de segurança dos dados.");
  if (pg?.code === "22P02") return notFound();
  console.error("[erro interno]", e);
  return new AppError("INTERNAL", "Ocorreu um erro inesperado. Tente novamente em instantes.");
}
