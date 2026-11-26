import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Normaliza telefone para E.164 (+5591999998888). Padrão: Brasil.
 * Retorna null quando não é um número válido (nunca "inventa" dígitos).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let digits = s.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) {
    digits = digits.replace(/^0+/, "");
    // 55 + DDD + número (12 ou 13 dígitos) já com código do país
    if (/^55\d{10,11}$/.test(digits)) digits = "+" + digits;
  }
  const p = parsePhoneNumberFromString(digits, "BR");
  if (!p || !p.isPossible()) return null;
  return p.number;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const p = parsePhoneNumberFromString(e164);
  if (!p) return e164;
  return p.country === "BR" ? p.formatNational() : p.formatInternational();
}
