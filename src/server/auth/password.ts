import bcrypt from "bcryptjs";
import { invalid } from "../errors";

const COST = 12;
export const MIN_PASSWORD = 8;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Hash fixo usado quando o usuário não existe, para não revelar isso pelo tempo de resposta.
const DUMMY_HASH = bcrypt.hashSync("marktvision-dummy-password", 10);
export const dummyVerify = (plain: string) => bcrypt.compare(plain, DUMMY_HASH);

/** Requisito mínimo seguro, sem exigir combinações complexas. */
export function validatePassword(password: string, username?: string) {
  if (!password || password.length < MIN_PASSWORD)
    throw invalid(`A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`, { password: `Mínimo de ${MIN_PASSWORD} caracteres.` });
  if (password.length > 128) throw invalid("A senha é muito longa.", { password: "Máximo de 128 caracteres." });
  if (username && password.toLowerCase() === username.toLowerCase())
    throw invalid("A senha não pode ser igual ao login.", { password: "Não use o login como senha." });
  if (/^(.)\1+$/.test(password) || ["12345678", "123456789", "1234567890", "senha123", "password"].includes(password.toLowerCase()))
    throw invalid("Esta senha é fácil de adivinhar. Escolha outra.", { password: "Senha muito comum." });
}

/** Normaliza o login: minúsculas, sem acentos e espaços. */
export function normalizeUsername(raw: string) {
  const u = (raw ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(u))
    throw invalid("Login inválido. Use de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.", {
      username: "Use letras, números, ponto, hífen ou sublinhado (3 a 40).",
    });
  return u;
}
