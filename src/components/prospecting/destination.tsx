"use client";
/** Seletor de destino comum (nova lista / lista existente / só a base) + responsável. */
export type Destination = { mode: "new" | "existing" | "none"; newListName: string; listId: string; ownerUserId: string };

export function DestinationPicker({ value, onChange, lists, team, canLists, canAssign }: {
  value: Destination; onChange: (d: Destination) => void; lists: { id: string; name: string }[]; team: { id: string; name: string }[];
  canLists: boolean; canAssign: boolean;
}) {
  const set = (p: Partial<Destination>) => onChange({ ...value, ...p });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {canLists && (
        <div>
          <p className="label">Salvar contatos em</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-[15px]"><input type="radio" className="h-4 w-4 accent-brand" checked={value.mode === "new"} onChange={() => set({ mode: "new" })} />Nova lista</label>
            {value.mode === "new" && <input className="input" aria-label="Nome da nova lista" placeholder="Nome da nova lista" value={value.newListName} onChange={(e) => set({ newListName: e.target.value })} />}
            <label className="flex items-center gap-2.5 text-[15px]"><input type="radio" className="h-4 w-4 accent-brand" checked={value.mode === "existing"} disabled={!lists.length} onChange={() => set({ mode: "existing", listId: value.listId || lists[0]?.id || "" })} />Lista existente</label>
            {value.mode === "existing" && (
              <select className="input" aria-label="Lista existente" value={value.listId} onChange={(e) => set({ listId: e.target.value })}>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <label className="flex items-center gap-2.5 text-[15px]"><input type="radio" className="h-4 w-4 accent-brand" checked={value.mode === "none"} onChange={() => set({ mode: "none" })} />Somente na base de contatos</label>
          </div>
        </div>
      )}
      {canAssign && (
        <div>
          <label className="label" htmlFor="dest-owner">Vendedor responsável <span className="font-normal text-muted">(opcional)</span></label>
          <select id="dest-owner" className="input" value={value.ownerUserId} onChange={(e) => set({ ownerUserId: e.target.value })}>
            <option value="">Sem responsável</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

export function destinationOpts(d: Destination) {
  return {
    newListName: d.mode === "new" ? d.newListName.trim() || undefined : undefined,
    listId: d.mode === "existing" ? d.listId || undefined : undefined,
    ownerUserId: d.ownerUserId || undefined,
  };
}
