export const fmtInt = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("pt-BR").format(Number(n ?? 0));
export const fmtMoney = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n ?? 0));
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Belem" }).format(new Date(d)) : "—";
export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Belem" }).format(new Date(d)) : "—";
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
