/**
 * Executor de migrações versionadas (db/migrations/NNNN_nome.sql).
 * Roda com DATABASE_OWNER_URL (papel dono do schema). Cada arquivo é
 * aplicado uma única vez, dentro de uma transação.
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

export async function migrate(url = process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL, log = true) {
  if (!url) throw new Error("DATABASE_OWNER_URL não configurada.");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`create table if not exists schema_migrations (
      version text primary key, applied_at timestamptz not null default now())`);
    const dir = join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await client.query<{ version: string }>("select version from schema_migrations");
    const applied = new Set(rows.map((r) => r.version));
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      await client.query("begin");
      try {
        // migrações rodam em modo sistema (necessário com RLS forçado)
        await client.query("select set_config('app.system', 'on', true)");
        await client.query(sql);
        await client.query("insert into schema_migrations (version) values ($1)", [file]);
        await client.query("commit");
        if (log) console.log(`✔ migração aplicada: ${file}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Falha na migração ${file}: ${(e as Error).message}`);
      }
    }
    if (log) console.log("Banco de dados atualizado.");
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  migrate().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
