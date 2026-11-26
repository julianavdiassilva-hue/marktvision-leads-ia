"use client";
import clsx from "clsx";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Search, Star } from "lucide-react";
import { Alert, Badge } from "@/components/ui";
import { DestinationPicker, destinationOpts, type Destination } from "./destination";
import { savePlacesAction, searchCompaniesAction } from "@/app/actions/prospecting";
import { formatPhone } from "@/lib/phone";
import type { PlaceResult } from "@/server/integrations/google-places";

type Result = PlaceResult & { phoneE164: string | null; alreadyInBase: boolean };
export type SavedPlaces = { created: number; updated: number; listId: string | null; contactIds: string[] };

export function GoogleSearch({ configured, lists, team, canLists, canAssign, onSaved }: {
  configured: boolean; lists: { id: string; name: string }[]; team: { id: string; name: string }[]; canLists: boolean; canAssign: boolean;
  onSaved?: (r: SavedPlaces) => void;
}) {
  const [form, setForm] = useState({ keyword: "", city: "", state: "", neighborhood: "", region: "" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [dest, setDest] = useState<Destination>({ mode: canLists ? "new" : "none", newListName: "", listId: "", ownerUserId: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; listId?: string | null } | null>(null);
  const [pending, start] = useTransition();

  const search = (more = false) => {
    setMsg(null);
    start(async () => {
      const r = await searchCompaniesAction({ ...form, pageToken: more ? next ?? undefined : undefined });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      const d = r.data as { results: Result[]; nextPageToken: string | null; query: string };
      setQuery(d.query); setNext(d.nextPageToken);
      setResults(more ? [...results, ...d.results.filter((x) => !results.some((y) => y.placeId === x.placeId))] : d.results);
      if (!more) { setSel(new Set()); setDest((x) => ({ ...x, newListName: d.query.slice(0, 100) })); }
    });
  };
  const visible = results.filter((r) => !onlyPhone || r.phoneE164);
  const save = () => {
    if (dest.mode === "new" && !dest.newListName.trim()) return setMsg({ ok: false, text: "Informe o nome da nova lista." });
    start(async () => {
      const chosen = results.filter((r) => sel.has(r.placeId)).map(({ phoneE164: _p, alreadyInBase: _a, ...p }) => p);
      const r = await savePlacesAction(chosen, { query, ...destinationOpts(dest) });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Salvo.", listId: r.data?.listId });
      setResults(results.map((x) => (sel.has(x.placeId) ? { ...x, alreadyInBase: true } : x)));
      setSel(new Set());
      onSaved?.(r.data!);
    });
  };

  return (
    <div>
      {!configured && <div className="mb-5"><Alert tone="amber">A pesquisa no Google ainda não foi ativada nesta instalação: falta a chave <b>GOOGLE_PLACES_API_KEY</b>. Ao pesquisar, você verá esta mesma orientação — nenhum resultado é inventado.</Alert></div>}
      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="panel grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_0.6fr_1fr_auto] lg:items-end">
        <div><label className="label" htmlFor="g-keyword">Segmento ou palavra-chave</label><input id="g-keyword" className="input" placeholder="Ex.: clínicas odontológicas" value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} /></div>
        <div><label className="label" htmlFor="g-city">Cidade</label><input id="g-city" className="input" placeholder="Ex.: Belém" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        <div><label className="label" htmlFor="g-state">UF</label><input id="g-state" className="input" maxLength={20} placeholder="PA" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
        <div><label className="label" htmlFor="g-nb">Bairro ou região</label><input id="g-nb" className="input" placeholder="Opcional" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></div>
        <button className="btn btn-primary" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Pesquisar</button>
      </form>
      <p className="mt-2 text-[13px] text-muted">Telefone público não significa autorização para mensagens comerciais. Registre o consentimento antes de incluir contatos em disparos.</p>

      {msg && <div className="mt-4"><Alert tone={msg.ok ? "green" : "red"}>{msg.text}{msg.ok && msg.listId && <> <Link className="underline" href={`/contatos/listas/${msg.listId}`}>Abrir lista</Link></>}</Alert></div>}

      {results.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px]"><b>{results.length}</b> resultado(s) para “{query}”</p>
            <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-4 w-4 accent-[#008C48]" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} />Somente com telefone</label>
          </div>
          <div className="panel overflow-x-auto">
            <table className="table min-w-[900px]">
              <thead><tr>
                <th className="w-10"><input type="checkbox" aria-label="Selecionar todos" className="h-4 w-4 accent-[#008C48]" checked={visible.length > 0 && visible.every((r) => sel.has(r.placeId))}
                  onChange={(e) => setSel(e.target.checked ? new Set(visible.map((r) => r.placeId)) : new Set())} /></th>
                <th>Empresa</th><th>Telefone</th><th>Endereço</th><th>Categoria</th><th>Avaliação</th><th /></tr></thead>
              <tbody>{visible.map((r) => (
                <tr key={r.placeId} className={clsx(sel.has(r.placeId) && "[&>td]:bg-brand-50")}>
                  <td><input type="checkbox" aria-label={`Selecionar ${r.name}`} className="h-4 w-4 accent-[#008C48]" checked={sel.has(r.placeId)}
                    onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(r.placeId); else s.delete(r.placeId); setSel(s); }} /></td>
                  <td><p className="font-semibold">{r.name}</p>{r.website && <a href={r.website} target="_blank" rel="noreferrer" className="text-[13px] text-brand-dark hover:underline">{r.website.replace(/^https?:\/\//, "").slice(0, 40)}</a>}</td>
                  <td className="whitespace-nowrap">{formatPhone(r.phoneE164) || <span className="text-muted">Sem telefone</span>}</td>
                  <td className="max-w-[280px] text-[14px]">{r.address ?? "—"}</td>
                  <td className="text-[14px]">{r.category ?? "—"}</td>
                  <td className="whitespace-nowrap text-[14px]">{r.rating != null ? <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{r.rating.toFixed(1)} <span className="text-muted">({r.ratingCount ?? 0})</span></span> : "—"}</td>
                  <td>{r.alreadyInBase ? <Badge tone="gray">Já na base</Badge> : r.mapsUrl && <a href={r.mapsUrl} target="_blank" rel="noreferrer" aria-label="Abrir no Google Maps" className="text-muted hover:text-brand"><ExternalLink className="h-4 w-4" /></a>}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          {next && <div className="mt-3 flex justify-center"><button className="btn btn-secondary" disabled={pending} onClick={() => search(true)}>Carregar mais resultados</button></div>}
          {sel.size > 0 && (
            <div className="mt-6 rounded-xl border border-brand/30 bg-white p-5 shadow-sm">
              <p className="mb-4 text-[16px] font-bold">{sel.size} empresa(s) selecionada(s)</p>
              <DestinationPicker value={dest} onChange={setDest} lists={lists} team={team} canLists={canLists} canAssign={canAssign} />
              <div className="mt-5 flex justify-end"><button className="btn btn-primary" disabled={pending} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Adicionar à base de contatos</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
