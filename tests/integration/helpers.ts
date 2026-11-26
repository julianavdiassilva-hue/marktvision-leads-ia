import { login, resolveSession, type AuthContext } from "@/server/auth/core";

export async function loginAs(username: string, password: string): Promise<AuthContext> {
  const { token } = await login(username, password);
  const ctx = await resolveSession(token);
  if (!ctx) throw new Error("sessão inválida");
  return Object.assign(ctx, { __token: token });
}
export const tokenOf = (ctx: AuthContext) => (ctx as AuthContext & { __token: string }).__token;
export const ADMIN = { username: "admin", password: "admin-teste-2026" };
