import type { AuthContext } from "../auth/core";
import { hasFeature, isCompanyAdmin } from "../guards";
import { listOptions } from "./lists";
import { listTags } from "./tags";
import { teamOptions, type ContactFilters } from "./contacts";

/** Dados auxiliares das telas de contatos (listas, etiquetas, equipe e permissões). */
export async function contactPageData(ctx: AuthContext) {
  const [lists, tags, team] = await Promise.all([
    hasFeature(ctx, "contact_lists") ? listOptions(ctx) : Promise.resolve([]),
    listTags(ctx), teamOptions(ctx),
  ]);
  const perms = {
    canDelete: isCompanyAdmin(ctx), canAssign: isCompanyAdmin(ctx), isSeller: ctx.role === "seller",
    canExport: hasFeature(ctx, "data_export") && hasFeature(ctx, "contacts"),
    canTag: hasFeature(ctx, "tags"), canLists: hasFeature(ctx, "contact_lists"),
  };
  return { lists, tags, team, perms };
}

export function filtersFromSearch(sp: Record<string, string | undefined>): ContactFilters {
  return { q: sp.q, listId: sp.lista, tagId: sp.etiqueta, ownerId: sp.responsavel, source: sp.origem, status: sp.situacao,
    consent: sp.consentimento, page: sp.pagina ? Number(sp.pagina) || 1 : 1 };
}
