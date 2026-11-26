"use server";
import { runAction, type ActionResult } from "@/server/action";
import { analyzeImport, runImport, type MappedRow } from "@/server/services/imports";
import { savePlaces, searchCompanies, type SearchInput } from "@/server/services/prospecting";

export async function analyzeImportAction(rows: MappedRow[]) {
  return runAction(async (ctx) => ({ data: await analyzeImport(ctx, rows) }));
}
export async function runImportAction(rows: MappedRow[], opts: { listId?: string; newListName?: string; ownerUserId?: string; fileName?: string }) {
  return runAction(async (ctx) => {
    const r = await runImport(ctx, rows, opts);
    return { data: r, message: `${r.created} contato(s) novos e ${r.updated} atualizados${r.invalid ? `; ${r.invalid} linha(s) inválidas ignoradas` : ""}.` };
  });
}
export async function searchCompaniesAction(input: SearchInput) {
  return runAction(async (ctx) => ({ data: await searchCompanies(ctx, input) }));
}
export async function savePlacesAction(places: unknown[], opts: { query: string; listId?: string; newListName?: string; ownerUserId?: string }): Promise<ActionResult<{ created: number; updated: number; listId: string | null; contactIds: string[] }>> {
  return runAction(async (ctx) => {
    const r = await savePlaces(ctx, places, opts);
    return { data: r, message: `${r.created} empresa(s) adicionadas à base${r.updated ? ` e ${r.updated} já existentes atualizadas` : ""}.` };
  });
}
