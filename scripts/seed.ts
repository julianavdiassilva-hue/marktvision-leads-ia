/** Cria o administrador geral inicial (idempotente). Não cria dados fictícios. */
import "dotenv/config";
import { Client } from "pg";
import { hashPassword, normalizeUsername, validatePassword } from "../src/server/auth/password";

export async function seedPlatformAdmin(url = process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL, opts?: { name?: string; username?: string; password?: string }) {
  const name = opts?.name ?? process.env.PLATFORM_ADMIN_NAME ?? "Administrador Marktvision";
  const username = normalizeUsername(opts?.username ?? process.env.PLATFORM_ADMIN_USERNAME ?? "admin");
  const password = opts?.password ?? process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  validatePassword(password, username);
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.system', 'on', true)");
    const r = await c.query(
      `insert into users (name, username, password_hash, is_platform_admin) values ($1,$2,$3,true)
       on conflict (username) do nothing returning id`, [name, username, await hashPassword(password)]);
    await c.query("commit");
    return { created: (r.rowCount ?? 0) > 0, username };
  } finally {
    await c.end();
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  if (!process.env.PLATFORM_ADMIN_PASSWORD) {
    console.warn("PLATFORM_ADMIN_PASSWORD não definida — administrador geral não foi criado.");
    process.exit(0);
  }
  seedPlatformAdmin()
    .then((r) => console.log(r.created ? `✔ Administrador geral "${r.username}" criado.` : `Administrador "${r.username}" já existe.`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
