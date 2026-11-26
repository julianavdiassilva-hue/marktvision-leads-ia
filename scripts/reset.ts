/** Apaga e recria o schema (SOMENTE desenvolvimento/testes). */
import "dotenv/config";
import { Client } from "pg";
import { migrate } from "./migrate";

export async function resetDatabase(url = process.env.DATABASE_OWNER_URL, log = true) {
  if (process.env.NODE_ENV === "production") throw new Error("Reset bloqueado em produção.");
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("drop schema public cascade; create schema public; grant usage on schema public to public;");
  await c.end();
  await migrate(url, log);
}

if (process.argv[1]?.endsWith("reset.ts")) {
  resetDatabase().catch((e) => { console.error(e.message); process.exit(1); });
}
