/**
 * Google Places API (New) — Text Search.
 * Documentação: https://developers.google.com/maps/documentation/places/web-service/text-search
 * Chave: GOOGLE_PLACES_API_KEY (somente no servidor). Nunca retorna dados inventados.
 */
import { AppError } from "../errors";

export type PlaceResult = {
  placeId: string; name: string; phone: string | null; address: string | null; website: string | null;
  category: string | null; rating: number | null; ratingCount: number | null;
  city: string | null; state: string | null; neighborhood: string | null; mapsUrl: string | null;
};

const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber", "places.internationalPhoneNumber",
  "places.websiteUri", "places.primaryTypeDisplayName", "places.rating", "places.userRatingCount", "places.addressComponents",
  "places.googleMapsUri", "nextPageToken",
].join(",");

export const isGoogleConfigured = () => !!process.env.GOOGLE_PLACES_API_KEY;

type RawPlace = {
  id: string; displayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string; internationalPhoneNumber?: string;
  websiteUri?: string; primaryTypeDisplayName?: { text?: string }; rating?: number; userRatingCount?: number; googleMapsUri?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
};

export function mapPlace(p: RawPlace): PlaceResult {
  const comp = (type: string, short = false) => {
    const c = p.addressComponents?.find((x) => x.types?.includes(type));
    return (short ? c?.shortText : c?.longText) ?? null;
  };
  return {
    placeId: p.id, name: p.displayName?.text ?? "(sem nome)",
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    address: p.formattedAddress ?? null, website: p.websiteUri ?? null,
    category: p.primaryTypeDisplayName?.text ?? null, rating: p.rating ?? null, ratingCount: p.userRatingCount ?? null,
    city: comp("administrative_area_level_2") ?? comp("locality"), state: comp("administrative_area_level_1", true),
    neighborhood: comp("sublocality_level_1") ?? comp("sublocality"), mapsUrl: p.googleMapsUri ?? null,
  };
}

export async function searchPlaces(textQuery: string, pageToken?: string | null): Promise<{ places: PlaceResult[]; nextPageToken: string | null }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new AppError("INTEGRATION", "A pesquisa no Google ainda não foi configurada. O administrador da plataforma precisa cadastrar a chave GOOGLE_PLACES_API_KEY (veja INTEGRATIONS.md).");
  let res: Response;
  try {
    res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery, languageCode: "pt-BR", regionCode: "BR", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError("INTEGRATION", "Não foi possível conectar ao Google agora. Tente novamente em instantes.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[google-places]", res.status, body.slice(0, 500));
    if (res.status === 400) throw new AppError("INTEGRATION", "O Google recusou a pesquisa. Revise os termos informados.");
    if (res.status === 403) throw new AppError("INTEGRATION", "A chave do Google foi recusada (API não ativada, faturamento desativado ou restrição de chave).");
    if (res.status === 429) throw new AppError("INTEGRATION", "Limite de pesquisas do Google atingido. Tente mais tarde.");
    throw new AppError("INTEGRATION", "O Google retornou um erro inesperado. Tente novamente.");
  }
  const json = (await res.json()) as { places?: RawPlace[]; nextPageToken?: string };
  return { places: (json.places ?? []).map(mapPlace), nextPageToken: json.nextPageToken ?? null };
}
