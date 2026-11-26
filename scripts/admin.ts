/**
 * Cria o administrador geral ou redefine a senha dele (uso: CRIAR_ADMIN.bat).
 * A senha chega por variável de ambiente só durante a execução; é gravada apenas como hash bcrypt.
 */
import "dotenv/config";
import { Client } from "pg";
import { hashPassword, normalizeUsername, validatePassword } from "../src/server/auth/password";

async function main() {
  const username = normalizeUsername(process.env.ADMIN_USERNAME || "admin");
  const password = process.env.ADMIN_PASSWORD || "";
  const name = process.env.ADMIN_NAME || "Administrador Marktvision";
  validatePassword(password, username);
  const c = new Client({ connectionString: process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.system', 'on', true)");
    const existing = await c.query(`select id, is_platform_admin from users where username = $1`, [username]);
    const hash = await hashPassword(password);
    if (existing.rowCount) {
      if (!existing.rows[0].is_platform_admin) throw new Error(`O login "${username}" pertence a um usuário de empresa. Escolha outro login.`);
      await c.query(`update users set password_hash = $2, is_active = true where id = $1`, [existing.rows[0].id, hash]);
      await c.query(`delete from sessions where user_id = $1`, [existing.rows[0].id]);
      console.log(`✔ Senha do administrador geral "${username}" redefinida. Sessões antigas encerradas.`);
    } else {
      await c.query(`insert into users (name, username, password_hash, is_platform_admin) values ($1,$2,$3,true)`, [name, username, hash]);
      console.log(`✔ Administrador geral "${username}" criado.`);
    }
    await c.query(`insert into audit_logs (action, data) values ('platform.admin_cli', $1)`, [{ username }]);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error("ERRO: " + (e as Error).message); process.exit(1); });
