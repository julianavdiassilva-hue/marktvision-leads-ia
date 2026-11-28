import { createHash } from "node:crypto";
import type { Db } from "./db";

/**
 * Armazenamento de arquivos por empresa.
 * Driver atual: "database" — tabela `company_files` (chave primária company_id + key),
 * protegida por RLS (uma empresa nunca lê arquivos de outra), incluída nos backups
 * e migrada junto com o banco. Para hospedagem profissional, este módulo pode ganhar
 * um driver S3/R2 mantendo a mesma interface (put/get/remove) e o mesmo isolamento por prefixo de empresa.
 */
export type StoredFile = { mime_type: string; size_bytes: number; sha256: string; content: Buffer; created_at: string };

export async function putFile(db: Db, companyId: string, key: string, content: Buffer, mime: string, userId?: string | null) {
  const sha256 = createHash("sha256").update(content).digest("hex");
  await db.exec(
    `insert into company_files (company_id, key, mime_type, size_bytes, sha256, content, created_by) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (company_id, key) do update set mime_type = excluded.mime_type, size_bytes = excluded.size_bytes, sha256 = excluded.sha256,
       content = excluded.content, created_by = excluded.created_by, created_at = now()`,
    [companyId, key, mime, content.length, sha256, content, userId ?? null]);
  return { sha256, size: content.length };
}

export async function getFile(db: Db, companyId: string, key: string): Promise<StoredFile | null> {
  return db.maybeOne<StoredFile>(`select mime_type, size_bytes, sha256, content, created_at from company_files where company_id = $1 and key = $2`, [companyId, key]);
}

export async function removeFiles(db: Db, companyId: string, prefix: string) {
  return db.exec(`delete from company_files where company_id = $1 and left(key, length($2)) = $2`, [companyId, prefix]);
}

/** Identifica o formato pelo conteúdo (não confia na extensão nem no tipo informado pelo navegador). */
export function sniffImage(b: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
