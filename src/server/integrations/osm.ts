/**
 * Pesquisa GRATUITA de empresas — OpenStreetMap (Nominatim público).
 * Política de uso: até 1 requisição por segundo, identificação do aplicativo (User-Agent), uso moderado.
 * Limitação: dados colaborativos — muitas empresas não têm telefone cadastrado.
 */
import { AppError } from "../errors";
import type { PlaceResult } from "./google-places";

/** Segmentos comuns (pt-BR) → categorias do OpenStreetMap (frases especiais em inglês). */
const SEGMENTS: [RegExp, string][] = [
  [/odonto|dentist/i, "dentist"], [/cl[ií]nica|consult[oó]rio m[eé]dico|m[eé]dic/i, "clinic"], [/hospital/i, "hospital"], [/farm[aá]cia|drogaria/i, "pharmacy"],
  [/restaurante|lanchonete|comida/i, "restaurant"], [/padaria|panificadora/i, "bakery"], [/caf[eé]|cafeteria/i, "cafe"], [/bar\b|bares/i, "bar"],
  [/escola|col[eé]gio|creche/i, "school"], [/faculdade|universidade/i, "university"], [/supermercado|mercado/i, "supermarket"],
  [/academia|fitness|muscula/i, "fitness centre"], [/sal[aã]o|cabeleireir|barbearia|beleza/i, "hairdresser"], [/hotel|pousada/i, "hotel"],
  [/oficina|mec[aâ]nic/i, "car repair"], [/pet ?shop|veterin/i, "veterinary"], [/advoca|advogad/i, "lawyer"], [/contabil|contador/i, "accountant"],
  [/imobili/i, "estate agent"], [/[oó]tica/i, "optician"], [/posto|combust/i, "fuel"], [/banco\b/i, "bank"], [/igreja/i, "place of worship"],
  [/refrigera|ar.condicionado|climatiza/i, "hvac"], [/constru|material de constru/i, "hardware"], [/roupa|vestu|moda/i, "clothes"], [/loja/i, "shop"],
];
export function osmTerm(keyword: string) {
  return SEGMENTS.find(([re]) => re.test(keyword))?.[1] ?? keyword;
}

const TYPE_PT: Record<string, string> = {
  dentist: "Dentista", clinic: "Clínica", doctors: "Consultório", hospital: "Hospital", pharmacy: "Farmácia", restaurant: "Restaurante", fast_food: "Lanchonete",
  bakery: "Padaria", cafe: "Café", bar: "Bar", school: "Escola", university: "Universidade", supermarket: "Supermercado", fitness_centre: "Academia",
  hairdresser: "Salão de beleza", hotel: "Hotel", car_repair: "Oficina", veterinary: "Veterinário", lawyer: "Advocacia", accountant: "Contabilidade",
  estate_agent: "Imobiliária", optician: "Ótica", fuel: "Posto", bank: "Banco", hardware: "Material de construção", clothes: "Loja de roupas",
};

let last = 0;
async function politeWait() { const wait = Math.max(0, last + 1100 - Date.now()); last = Date.now() + wait; if (wait) await new Promise((r) => setTimeout(r, wait)); }

type NomRow = { place_id: number; osm_type: string; osm_id: number; name?: string; display_name?: string; category?: string; type?: string;
  address?: Record<string, string>; extratags?: Record<string, string> };

export function mapOsm(r: NomRow): PlaceResult {
  const a = r.address ?? {}; const x = r.extratags ?? {};
  const st = a["ISO3166-2-lvl4"]?.replace(/^BR-/, "") ?? a.state ?? null;
  return {
    placeId: `osm:${r.osm_type}${r.osm_id}`, name: r.name || (r.display_name ?? "").split(",")[0] || "(sem nome)",
    phone: (x.phone ?? x["contact:phone"] ?? x["contact:mobile"] ?? x["contact:whatsapp"] ?? "").split(/[;,/]/)[0].trim() || null,
    address: [a.road && `${a.road}${a.house_number ? `, ${a.house_number}` : ""}`, a.suburb ?? a.neighbourhood, a.city ?? a.town ?? a.village ?? a.municipality, st].filter(Boolean).join(" - ") || r.display_name || null,
    website: x.website ?? x["contact:website"] ?? null, category: TYPE_PT[r.type ?? ""] ?? r.type ?? null, rating: null, ratingCount: null,
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? null, state: st, neighborhood: a.suburb ?? a.neighbourhood ?? null,
    mapsUrl: `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`,
  };
}

export async function searchOsm(keyword: string, location: string, pageToken?: string | null): Promise<{ places: PlaceResult[]; nextPageToken: string | null; query: string }> {
  const query = `${osmTerm(keyword)} in ${location}`.trim();
  const exclude = (pageToken ?? "").split(",").filter((s) => /^\d+$/.test(s)).slice(-500);
  const qs = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", extratags: "1", limit: "50", countrycodes: "br", "accept-language": "pt-BR",
    ...(exclude.length ? { exclude_place_ids: exclude.join(",") } : {}) });
  await politeWait();
  let res: Response;
  try {
    res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
      headers: { "User-Agent": "MarktvisionLeadsIA/1.0 (prospeccao comercial; uso moderado)", "Accept-Language": "pt-BR" }, signal: AbortSignal.timeout(30_000) });
  } catch { throw new AppError("INTEGRATION", "Não foi possível consultar o OpenStreetMap agora. Tente novamente em instantes."); }
  if (res.status === 429) throw new AppError("INTEGRATION", "Muitas pesquisas seguidas no OpenStreetMap. Aguarde um minuto.");
  if (!res.ok) throw new AppError("INTEGRATION", "O OpenStreetMap retornou um erro. Tente novamente.");
  const rows = (await res.json()) as NomRow[];
  const places = rows.filter((r) => r.name).map(mapOsm);
  const ids = [...exclude, ...rows.map((r) => String(r.place_id))];
  return { places, nextPageToken: rows.length >= 50 ? ids.join(",") : null, query };
}
