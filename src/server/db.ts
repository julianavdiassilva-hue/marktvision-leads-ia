import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { toAppError } from "./errors";

/**
 * Acesso ao banco. A aplicação conecta com um papel NÃO superusuário
 * (DATABASE_URL), portanto as políticas RLS sempre se aplicam.
 * Toda operação roda em `withScope`, que define o contexto da transação.
 */
const g = globalThis as unknown as { __mvPool?: Pool; __mvPoolUrl?: string };

export function getPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  if (!g.__mvPool || g.__mvPoolUrl !== url) {
    g.__mvPool = new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
    g.__mvPoolUrl = url;
  }
  return g.__mvPool;
}

export async function closePool() {
  if (g.__mvPool) await g.__mvPool.end();
  g.__mvPool = undefined;
}

export type Scope = {
  userId?: string | null;
  companyId?: string | null;
  platformAdmin?: boolean;
  /** Rotinas internas (login, filas, webhooks). Nunca derivar de entrada do usuário. */
  system?: boolean;
};

export class Db {
  constructor(private client: PoolClient) {}
  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.client.query<T>(sql, params);
    return r.rows;
  }
  async maybeOne<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }
  async one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T> {
    const row = await this.maybeOne<T>(sql, params);
    if (!row) throw new Error("Consulta não retornou registros.");
    return row;
  }
  async exec(sql: string, params: unknown[] = []): Promise<number> {
    const r = await this.client.query(sql, params);
    return r.rowCount ?? 0;
  }
}

export async function withScope<T>(scope: Scope, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query(
      `select set_config('app.user_id', $1, true), set_config('app.company_id', $2, true),
              set_config('app.platform_admin', $3, true), set_config('app.system', $4, true)`,
      [scope.userId ?? "", scope.companyId ?? "", scope.platformAdmin ? "on" : "", scope.system ? "on" : ""],
    );
    const result = await fn(new Db(client));
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw toAppError(e); // erros do banco viram mensagens em português
  } finally {
    client.release();
  }
}

export const SYSTEM: Scope = { system: true };
