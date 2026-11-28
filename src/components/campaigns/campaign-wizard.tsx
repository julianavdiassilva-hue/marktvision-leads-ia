"use client";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Bot, Check, FileSpreadsheet, ListChecks, Loader2, MessageCircle, Save, Search, Sparkles, Trash2, UserPlus, Users, Wand2, ExternalLink } from "lucide-react";
import { Alert, Badge } from "@/components/ui";
import { GoogleSearch } from "@/components/prospecting/google-search";
import { SpreadsheetImporter } from "@/components/prospecting/spreadsheet-importer";
import {
  aiGenerateAction, aiImproveAction, campaignOpAction, loadContactsAction, quickContactAction, saveCampaignAction,
  saveScriptAction, saveSelectionAsListAction,
} from "@/app/actions/campaigns";
import { renderTemplate, TEMPLATE_VARS } from "@/lib/template";
import { formatPhone } from "@/lib/phone";
import { fmtInt } from "@/lib/format";
import type { ContactLite } from "@/server/services/campaigns";

type Opt = { id: string; name: string };
type Conn = { id: string; display_name: string; phone_number: string | null; status: string; provider?: string };
type Script = { id: string; name: string; body: string };
export type WizardInitial = {
  id?: string; status?: string; name: string; listId: string | null; scriptId: string | null; messageBody: string;
  whatsappConnectionId: string | null; responseMode: "human" | "ai" | "ai_then_human"; contacts: ContactLite[]; contactIds: string[];
  templateId: string | null; templateParams: string[];
};
type Template = { id: string; connection_id: string; name: string; language: string; body: string; params: number };
export type WizardPerms = { google: boolean; googleConfigured: boolean; searchProvider?: "google" | "osm"; import: boolean; lists: boolean; aiMessages: boolean; broadcasts: boolean; canAssign: boolean };

const STEPS = ["Nome", "Origem dos contatos", "Seleção", "Script", "WhatsApp", "Atendimento", "Execução"];

export function CampaignWizard({ initial, lists, team, scripts: initialScripts, connections, templates, perms, companyName }: {
  initial: WizardInitial; lists: (Opt & { contacts: number })[]; team: Opt[]; scripts: Script[]; connections: Conn[]; templates: Template[]; perms: WizardPerms; companyName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initial.id ? 2 : 0);
  const [campaignId, setCampaignId] = useState(initial.id);
  const [name, setName] = useState(initial.name);
  const [listId, setListId] = useState<string | null>(initial.listId);
  const [pool, setPool] = useState<Map<string, ContactLite>>(() => new Map(initial.contacts.map((c) => [c.id, c])));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.contactIds));
  const [body, setBody] = useState(initial.messageBody);
  const [scriptId, setScriptId] = useState<string | null>(initial.scriptId);
  const [scripts, setScripts] = useState(initialScripts);
  const [connId, setConnId] = useState<string | null>(initial.whatsappConnectionId ?? connections.find((c) => c.status === "connected")?.id ?? null);
  const [mode, setMode] = useState(initial.responseMode);
  const [templateId, setTemplateId] = useState<string | null>(initial.templateId);
  const [tplParams, setTplParams] = useState<string[]>(initial.templateParams);
  const connTemplates = templates.filter((t) => t.connection_id === connId);
  const tpl = connTemplates.find((t) => t.id === templateId) ?? null;
  const [origin, setOrigin] = useState<"google" | "import" | "list" | "manual">(perms.google ? "google" : perms.import ? "import" : "list");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const addContacts = (cs: ContactLite[], fromListId?: string) => {
    const p = new Map(pool); const s = new Set(selected); let added = 0;
    for (const c of cs) {
      if (!p.has(c.id)) added++;
      p.set(c.id, c);
      if (c.consent_status !== "opted_out") s.add(c.id);
    }
    setPool(p); setSelected(s);
    if (fromListId && !listId) setListId(fromListId);
    setMsg({ ok: true, text: `${fmtInt(added)} contato(s) adicionados à campanha${cs.length - added ? ` (${fmtInt(cs.length - added)} já estavam na seleção)` : ""}.` });
  };
  const loadAndAdd = (sel: { ids?: string[]; listId?: string }) => start(async () => {
    const r = await loadContactsAction(sel);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    addContacts(r.data as ContactLite[], sel.listId);
    setStep(2);
  });

  const payload = () => ({ name, listId, scriptId, messageBody: body, whatsappConnectionId: connId, responseMode: mode, contactIds: [...selected],
    templateId: tpl?.id ?? null, templateParams: tpl ? Array.from({ length: tpl.params }, (_, i) => tplParams[i] || "primeiro_nome") : [] });
  const save = async (silent = false) => {
    if (!name.trim()) { setStep(0); setMsg({ ok: false, text: "Informe o nome da campanha." }); return null; }
    const r = await saveCampaignAction(payload(), campaignId);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return null; }
    const id = (r.data as { id: string }).id;
    if (!campaignId) { setCampaignId(id); window.history.replaceState(null, "", `/campanhas/${id}/editar`); }
    if (!silent) setMsg({ ok: true, text: "Rascunho salvo." });
    return id;
  };
  const execute = (op: "start" | "schedule" | "resume", arg?: string) => start(async () => {
    const id = await save(true); if (!id) return;
    const r = await campaignOpAction(id, op, arg);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    router.push(`/campanhas/${id}`); router.refresh();
  });

  const selectedContacts = useMemo(() => [...selected].map((id) => pool.get(id)).filter(Boolean) as ContactLite[], [selected, pool]);
  const done = [!!name.trim(), pool.size > 0, selected.size > 0, !!body.trim() || !!tpl, !!connId, true, false];

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <nav aria-label="Etapas" className="lg:sticky lg:top-24 lg:self-start">
        <ol className="flex gap-1 overflow-x-auto lg:flex-col">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => setStep(i)} className={clsx("flex w-full items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold",
                step === i ? "bg-brand-light text-brand-dark" : "text-ink/80 hover:bg-surface")}>
                <span className={clsx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px]", done[i] ? "bg-brand text-white" : step === i ? "bg-white text-brand-dark ring-2 ring-brand" : "bg-surface text-muted ring-1 ring-line")}>
                  {done[i] ? <Check className="h-4 w-4" /> : i + 1}
                </span>{s}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-secondary mt-4 w-full" disabled={pending} onClick={() => start(async () => { await save(); })}><Save className="h-4 w-4" />Salvar rascunho</button>
        <p className="mt-2 text-center text-[13px] text-muted">{fmtInt(selected.size)} contato(s) selecionado(s)</p>
      </nav>

      <section className="min-w-0">
        {msg && <div className="mb-4"><Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert></div>}
        {pending && <p className="mb-3 flex items-center gap-2 text-[14px] text-muted"><Loader2 className="h-4 w-4 animate-spin" />Processando…</p>}

        {step === 0 && (
          <StepBox title="1. Nome da campanha" desc="Um nome simples para identificar a campanha na central e nos relatórios.">
            <input id="campaign-name" className="input max-w-xl py-3 text-[17px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Prospecção de clínicas — Belém" autoFocus />
          </StepBox>
        )}

        {step === 1 && (
          <StepBox title="2. Origem dos contatos" desc="Encontre ou traga contatos sem sair desta tela. Todos entram na base central, sem duplicar.">
            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {([["google", perms.searchProvider === "osm" ? "Pesquisar empresas (mapa)" : "Pesquisar no Google", Search, perms.google], ["import", "Anexar planilha", FileSpreadsheet, perms.import], ["list", "Lista existente", ListChecks, perms.lists], ["manual", "Adicionar manualmente", UserPlus, true]] as const).map(([k, l, Icon, ok]) => (
                <button key={k} type="button" disabled={!ok} onClick={() => setOrigin(k)} className={clsx("flex items-center gap-3 rounded-xl border-2 px-4 py-4 text-left text-[15.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                  origin === k ? "border-brand bg-brand-50 text-brand-dark" : "border-line hover:border-brand/40")} title={ok ? undefined : "Funcionalidade não liberada"}>
                  <Icon className="h-6 w-6 shrink-0 text-brand" />{l}
                </button>
              ))}
            </div>
            {origin === "google" && perms.google && (
              <GoogleSearch configured={perms.googleConfigured} provider={perms.searchProvider} lists={lists} team={team} canLists={perms.lists} canAssign={perms.canAssign}
                onSaved={(r) => { if (r.listId) setListId(r.listId); loadAndAdd({ ids: r.contactIds }); }} />
            )}
            {origin === "import" && perms.import && (
              <SpreadsheetImporter lists={lists} team={team} canLists={perms.lists} canAssign={perms.canAssign}
                onDone={(r) => { if (r.listId) setListId(r.listId); loadAndAdd({ ids: r.contactIds }); }} />
            )}
            {origin === "list" && (
              lists.length === 0 ? <Alert tone="amber">Nenhuma lista criada ainda. Use o Google, uma planilha ou o cadastro manual.</Alert> : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {lists.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div><p className="font-semibold">{l.name}</p><p className="text-[14px] text-muted">{fmtInt(l.contacts)} contato(s)</p></div>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={pending || !l.contacts} onClick={() => loadAndAdd({ listId: l.id })}>Usar esta lista</button>
                    </li>
                  ))}
                </ul>
              )
            )}
            {origin === "manual" && <ManualAdd onAdd={(c) => addContacts([c])} />}
          </StepBox>
        )}

        {step === 2 && (
          <SelectionStep pool={pool} setPool={setPool} selected={selected} setSelected={setSelected} canLists={perms.lists}
            onSavedList={(id) => setListId(id)} setMsg={setMsg} />
        )}

        {step === 3 && (
          <ScriptStep body={body} setBody={(b) => { setBody(b); }} scriptId={scriptId} setScriptId={setScriptId} scripts={scripts} setScripts={setScripts}
            canAi={perms.aiMessages} preview={selectedContacts} companyName={companyName} setMsg={setMsg} />
        )}

        {step === 4 && (
          <StepBox title="5. WhatsApp" desc="Escolha o número conectado que fará os envios desta campanha.">
            {connections.length === 0 ? (
              <Alert tone="amber">Nenhum número de WhatsApp conectado. Conecte em <Link href="/whatsapp" className="underline">WhatsApp Comercial</Link> pelo botão “Conectar WhatsApp”. Você pode salvar o rascunho e iniciar depois.</Alert>
            ) : (
              <div className="space-y-2">
                {connections.map((c) => (
                  <label key={c.id} className={clsx("flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3", connId === c.id ? "border-brand bg-brand-50" : "border-line")}>
                    <input type="radio" className="h-4 w-4 accent-brand" checked={connId === c.id} onChange={() => setConnId(c.id)} />
                    <MessageCircle className="h-5 w-5 text-brand" />
                    <span className="flex-1"><b>{c.display_name}</b> {c.phone_number && <span className="text-muted">· {c.phone_number}</span>}</span>
                    <Badge tone={c.status === "connected" ? "green" : "red"}>{c.status === "connected" ? "Conectado" : "Desconectado"}</Badge>
                  </label>
                ))}
              </div>
            )}
            {connId && connections.find((c) => c.id === connId)?.provider === "evolution" && (
              <p className="mt-4 text-[14px] text-muted">Conexão por QR Code: a mensagem do Script é enviada diretamente, com intervalo automático entre os envios para proteger o número. Envie apenas para contatos que autorizaram.</p>
            )}
            {connId && connections.find((c) => c.id === connId)?.provider !== "evolution" && (
              <div className="mt-6 rounded-xl border border-line bg-surface p-4">
                <p className="text-[16px] font-bold">Modelo aprovado pela Meta</p>
                <p className="mb-3 mt-1 text-[14px] text-muted">Para iniciar conversa com quem não falou com você nas últimas 24h, a Meta exige um modelo aprovado. Sem modelo, a mensagem do Script só é enviada a quem tem conversa aberta (janela de 24h); os demais ficam como “Ignorado”.</p>
                {connTemplates.length === 0 ? <p className="text-[14px] text-warning">Nenhum modelo aprovado neste número. Crie no WhatsApp Manager da Meta e clique em “Sincronizar modelos” em WhatsApp Comercial.</p> : (
                  <>
                    <select className="input" aria-label="Modelo aprovado" value={templateId ?? ""} onChange={(e) => { setTemplateId(e.target.value || null); setTplParams([]); }}>
                      <option value="">Não usar modelo (somente janela de 24h)</option>
                      {connTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
                    </select>
                    {tpl && (
                      <div className="mt-3">
                        <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-[15px]">{tpl.body}</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {Array.from({ length: tpl.params }, (_, i) => (
                            <label key={i} className="flex items-center gap-2 text-[14.5px]"><span className="w-12 font-mono font-semibold">{`{{${i + 1}}}`}</span>
                              <select className="input py-2" aria-label={`Parâmetro ${i + 1}`} value={tplParams[i] ?? "primeiro_nome"} onChange={(e) => { const p = [...tplParams]; p[i] = e.target.value; setTplParams(p); }}>
                                {TEMPLATE_VARS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                              </select></label>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </StepBox>
        )}

        {step === 5 && (
          <StepBox title="6. Atendimento das respostas" desc="Quem responde quando um contato responder à campanha. As respostas aparecem na Central de Conversas.">
            <div className="grid gap-3 md:grid-cols-3">
              {([["human", "Atendimento humano", Users, "A conversa vai direto para o vendedor responsável."],
                 ["ai", "Atendimento com IA", Bot, "O agente da empresa responde usando o contexto cadastrado."],
                 ["ai_then_human", "IA + transferência ao vendedor", Sparkles, "A IA recepciona e qualifica; leads interessados vão para o vendedor."]] as const).map(([k, l, Icon, d]) => (
                <label key={k} className={clsx("cursor-pointer rounded-xl border-2 p-4", mode === k ? "border-brand bg-brand-50" : "border-line")}>
                  <div className="flex items-center gap-2.5"><input type="radio" className="h-4 w-4 accent-brand" checked={mode === k} onChange={() => setMode(k)} /><Icon className="h-5 w-5 text-brand" /><b className="text-[15.5px]">{l}</b></div>
                  <p className="mt-2 text-[14px] text-muted">{d}</p>
                </label>
              ))}
            </div>
            {mode !== "human" && <p className="mt-3 text-[14px] text-muted">O atendimento com IA usa o Chatbot e o Contexto da empresa (Fase 08). Até lá, as respostas ficam com os vendedores.</p>}
          </StepBox>
        )}

        {step === 6 && (
          <ExecutionStep checks={[
            ["Nome", !!name.trim(), name || "—"], ["Contatos selecionados", selected.size > 0, fmtInt(selected.size)],
            ["Mensagem", !!body.trim() || !!tpl, tpl ? `modelo ${tpl.name}` : body ? `${body.length} caracteres` : "não escrita"],
            ["WhatsApp", !!connId && connections.find((c) => c.id === connId)?.status === "connected", connections.find((c) => c.id === connId)?.display_name ?? "não selecionado"],
            ["Disparos liberados no plano", perms.broadcasts, perms.broadcasts ? "sim" : "não"],
          ]} pending={pending} status={initial.status ?? "draft"} onSave={() => start(async () => { await save(); })}
            onStart={() => window.confirm(`Iniciar o envio para ${fmtInt(selected.size)} contato(s)? Contatos descadastrados ou sem telefone são ignorados automaticamente.`) && execute("start")}
            onResume={() => execute("resume")} onSchedule={(at) => execute("schedule", at)} />
        )}

        <div className="mt-6 flex justify-between">
          <button type="button" className="btn btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Voltar</button>
          {step < 6 && <button type="button" className="btn btn-primary" onClick={() => { if (step === 0 && !name.trim()) return setMsg({ ok: false, text: "Informe o nome da campanha." }); setMsg(null); setStep(step + 1); }}>Avançar</button>}
        </div>
      </section>
    </div>
  );
}

function StepBox({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="panel p-6">
      <h2 className="text-[21px] font-bold">{title}</h2>
      {desc && <p className="mb-5 mt-1 text-[15px] text-muted">{desc}</p>}
      {children}
    </div>
  );
}

function ManualAdd({ onAdd }: { onAdd: (c: ContactLite) => void }) {
  const [f, setF] = useState({ name: "", phone: "", organization: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={(e) => {
      e.preventDefault(); setErr(null);
      start(async () => { const r = await quickContactAction(f); if (!r.ok) setErr(r.error); else { onAdd(r.data as ContactLite); setF({ name: "", phone: "", organization: "" }); } });
    }}>
      <div><label className="label" htmlFor="m-name">Nome</label><input id="m-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><label className="label" htmlFor="m-phone">Telefone / WhatsApp</label><input id="m-phone" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(91) 98888-7777" /></div>
      <div><label className="label" htmlFor="m-org">Empresa</label><input id="m-org" className="input" value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} /></div>
      <button className="btn btn-primary" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Adicionar</button>
      {err && <p role="alert" className="text-[14px] font-medium text-danger sm:col-span-4">{err}</p>}
    </form>
  );
}

function SelectionStep({ pool, setPool, selected, setSelected, canLists, onSavedList, setMsg }: {
  pool: Map<string, ContactLite>; setPool: (p: Map<string, ContactLite>) => void; selected: Set<string>; setSelected: (s: Set<string>) => void;
  canLists: boolean; onSavedList: (id: string) => void; setMsg: (m: { ok: boolean; text: string } | null) => void;
}) {
  const [q, setQ] = useState("");
  const [listName, setListName] = useState("");
  const [pending, start] = useTransition();
  const all = [...pool.values()];
  const rows = all.filter((c) => !q || [c.name, c.organization, c.city, c.phone_e164].some((v) => v?.toLowerCase().includes(q.toLowerCase().replace(/\D/g, "") || q.toLowerCase())));
  const eligible = rows.filter((c) => c.consent_status !== "opted_out");
  const blocked = all.filter((c) => c.consent_status === "opted_out").length;
  const noPhone = all.filter((c) => !c.phone_e164).length;
  return (
    <StepBox title="3. Seleção dos contatos" desc="Revise quem receberá a campanha. O mesmo contato nunca entra duas vezes.">
      {pool.size === 0 ? <Alert tone="amber">Nenhum contato ainda. Volte à etapa 2 para pesquisar, importar ou escolher uma lista.</Alert> : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <input className="input max-w-xs py-2" placeholder="Filtrar por nome, empresa, cidade ou telefone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar contatos" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set([...selected, ...eligible.map((c) => c.id)]))}>Selecionar todos{q && " filtrados"}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const s = new Set(selected); rows.forEach((c) => s.delete(c.id)); setSelected(s); }}>Desmarcar{q && " filtrados"}</button>
            <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => { const p = new Map(pool); const s = new Set(selected); [...pool.keys()].filter((id) => !selected.has(id)).forEach((id) => { p.delete(id); s.delete(id); }); setPool(p); setSelected(s); }}>
              <Trash2 className="h-4 w-4" />Excluir desmarcados da campanha</button>
            <span className="ml-auto text-[14px] text-muted">{fmtInt(selected.size)} de {fmtInt(pool.size)} selecionados{blocked ? ` · ${blocked} descadastrado(s)` : ""}{noPhone ? ` · ${noPhone} sem telefone` : ""}</span>
          </div>
          <div className="panel max-h-[460px] overflow-auto">
            <table className="table">
              <thead><tr><th className="w-10" /><th>Contato</th><th>Telefone</th><th>Cidade</th><th>Responsável</th><th /></tr></thead>
              <tbody>{rows.slice(0, 1000).map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" className="h-4 w-4 accent-brand" aria-label={`Selecionar ${c.name ?? c.phone_e164}`} disabled={c.consent_status === "opted_out"} checked={selected.has(c.id)}
                    onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(c.id); else s.delete(c.id); setSelected(s); }} /></td>
                  <td><p className="font-semibold">{c.name || c.organization || "—"}</p>{c.organization && c.name && <p className="text-[13px] text-muted">{c.organization}</p>}
                    {c.consent_status === "opted_out" && <Badge tone="red">Descadastrado — não recebe</Badge>}</td>
                  <td className="whitespace-nowrap">{formatPhone(c.phone_e164) || <Badge tone="amber">Sem telefone</Badge>}</td>
                  <td>{c.city ?? "—"}</td><td className="text-[14px]">{c.owner_name ?? "—"}</td>
                  <td><Link href={`/contatos/${c.id}`} target="_blank" className="text-muted hover:text-brand" aria-label="Editar contato"><ExternalLink className="h-4 w-4" /></Link></td>
                </tr>))}
              </tbody>
            </table>
          </div>
          {rows.length > 1000 && <p className="mt-2 text-[13px] text-muted">Exibindo 1.000 de {fmtInt(rows.length)}. Use o filtro para localizar contatos.</p>}
          {canLists && (
            <div className="mt-4 flex flex-wrap items-end gap-2.5 rounded-xl bg-surface p-4">
              <div className="min-w-[240px] flex-1"><label className="label" htmlFor="sel-list">Salvar seleção como lista</label><input id="sel-list" className="input" value={listName} onChange={(e) => setListName(e.target.value)} placeholder="Nome da lista" /></div>
              <button type="button" className="btn btn-secondary" disabled={pending || !listName.trim() || !selected.size} onClick={() => start(async () => {
                const r = await saveSelectionAsListAction(listName, [...selected]);
                if (!r.ok) setMsg({ ok: false, text: r.error }); else { setMsg({ ok: true, text: r.message! }); onSavedList((r.data as { id: string }).id); setListName(""); }
              })}>Salvar como lista</button>
            </div>
          )}
        </>
      )}
    </StepBox>
  );
}

function ScriptStep({ body, setBody, scriptId, setScriptId, scripts, setScripts, canAi, preview, companyName, setMsg }: {
  body: string; setBody: (b: string) => void; scriptId: string | null; setScriptId: (id: string | null) => void; scripts: Script[]; setScripts: (s: Script[]) => void;
  canAi: boolean; preview: ContactLite[]; companyName: string; setMsg: (m: { ok: boolean; text: string } | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [goal, setGoal] = useState("");
  const [modelName, setModelName] = useState("");
  const [pIdx, setPIdx] = useState(0);
  const [pending, start] = useTransition();
  const insert = (v: string) => {
    const el = ref.current; const tag = `{{${v}}}`;
    if (!el) return setBody(body + tag);
    const [a, b] = [el.selectionStart, el.selectionEnd];
    setBody(body.slice(0, a) + tag + body.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + tag.length, a + tag.length); });
  };
  const ai = (fn: () => Promise<{ ok: boolean; data?: unknown; error?: string }>) => start(async () => {
    const r = await fn();
    if (!r.ok) setMsg({ ok: false, text: r.error! }); else { setBody(String(r.data)); setScriptId(null); setMsg({ ok: true, text: "Mensagem gerada pela IA. Revise antes de enviar." }); }
  });
  const c = preview[pIdx] ?? preview[0];
  return (
    <StepBox title="4. Script da campanha" desc="Escreva a mensagem aqui mesmo. Use variáveis para personalizar com o nome e a empresa do contato.">
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div>
          {scripts.length > 0 && (
            <div className="mb-3">
              <label className="label" htmlFor="script-pick">Usar modelo salvo</label>
              <select id="script-pick" className="input" value={scriptId ?? ""} onChange={(e) => { const s = scripts.find((x) => x.id === e.target.value); setScriptId(s?.id ?? null); if (s) setBody(s.body); }}>
                <option value="">Escrever nova mensagem</option>{scripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <label className="label" htmlFor="campaign-body">Mensagem</label>
          <textarea id="campaign-body" ref={ref} rows={9} className="input text-[16px] leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)}
            placeholder={"Olá {{primeiro_nome}}, tudo bem?\nSou da {{minha_empresa}}..."} maxLength={4000} />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-muted">Inserir:</span>
            {TEMPLATE_VARS.map((v) => <button key={v.key} type="button" onClick={() => insert(v.key)} className="rounded-md border border-brand/30 bg-brand-50 px-2 py-0.5 text-[13px] font-semibold text-brand-dark hover:bg-brand-light">{v.label}</button>)}
            <span className="ml-auto text-[13px] text-muted">{body.length}/4000</span>
          </div>

          {canAi && (
            <div className="mt-5 rounded-xl border border-line bg-surface p-4">
              <p className="mb-2 flex items-center gap-2 text-[15px] font-bold"><Sparkles className="h-5 w-5 text-brand" />Mensagens com IA</p>
              <div className="flex flex-wrap gap-2">
                <input className="input min-w-[240px] flex-1" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Objetivo. Ex.: oferecer manutenção preventiva de ar-condicionado para clínicas" aria-label="Objetivo da mensagem" />
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => ai(() => aiGenerateAction(goal))}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}Gerar com IA</button>
                <button type="button" className="btn btn-secondary" disabled={pending || !body.trim()} onClick={() => ai(() => aiImproveAction(body, goal))}>Melhorar com IA</button>
              </div>
              <p className="mt-2 text-[13px] text-muted">A IA não inventa preços nem ofertas. Revise sempre o texto antes de enviar.</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1"><label className="label" htmlFor="model-name">Salvar como modelo</label><input id="model-name" className="input" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Nome do modelo" /></div>
            <button type="button" className="btn btn-secondary" disabled={pending || !modelName.trim() || !body.trim()} onClick={() => start(async () => {
              const r = await saveScriptAction({ name: modelName, body });
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              const id = (r.data as { id: string }).id; setScripts([...scripts, { id, name: modelName, body }]); setScriptId(id); setModelName("");
              setMsg({ ok: true, text: "Modelo salvo para reutilizar em outras campanhas." });
            })}>Salvar modelo</button>
          </div>
        </div>
        <div>
          <p className="label">Pré-visualização</p>
          {preview.length > 1 && (
            <select className="input mb-2 py-2" aria-label="Contato da pré-visualização" value={pIdx} onChange={(e) => setPIdx(Number(e.target.value))}>
              {preview.slice(0, 50).map((x, i) => <option key={x.id} value={i}>{x.name || x.organization || formatPhone(x.phone_e164)}</option>)}
            </select>
          )}
          <div className="rounded-2xl bg-[#ECE5DD] p-4">
            <div className="ml-auto max-w-[95%] whitespace-pre-wrap rounded-xl rounded-tr-sm bg-[#D9FDD3] px-3.5 py-2.5 text-[15px] leading-relaxed text-ink shadow-sm" data-testid="preview">
              {body.trim() ? renderTemplate(body, { name: c?.name, organization: c?.organization, city: c?.city, owner_name: c?.owner_name, company_name: companyName }) : <span className="text-muted">A mensagem aparecerá aqui.</span>}
            </div>
          </div>
          {!c && <p className="mt-2 text-[13px] text-muted">Selecione contatos para ver a mensagem personalizada.</p>}
        </div>
      </div>
    </StepBox>
  );
}

function ExecutionStep({ checks, pending, status, onSave, onStart, onResume, onSchedule }: {
  checks: [string, boolean, string][]; pending: boolean; status: string; onSave: () => void; onStart: () => void; onResume: () => void; onSchedule: (at: string) => void;
}) {
  const [at, setAt] = useState("");
  const ready = checks.every(([, ok]) => ok);
  return (
    <StepBox title="7. Execução" desc="Revise e escolha: salvar rascunho, iniciar agora ou programar o início.">
      <ul className="mb-6 divide-y divide-line rounded-xl border border-line">
        {checks.map(([l, ok, v]) => (
          <li key={l} className="flex items-center justify-between px-4 py-3 text-[15px]">
            <span className="flex items-center gap-2.5"><span className={clsx("grid h-6 w-6 place-items-center rounded-full", ok ? "bg-brand text-white" : "bg-warning-light text-warning")}>{ok ? <Check className="h-4 w-4" /> : "!"}</span>{l}</span>
            <span className={clsx("font-semibold", !ok && "text-warning")}>{v}</span>
          </li>
        ))}
      </ul>
      {!ready && <div className="mb-4"><Alert tone="amber">Para iniciar ou programar, todos os itens acima precisam estar concluídos. O rascunho pode ser salvo a qualquer momento.</Alert></div>}
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={onSave}><Save className="h-4 w-4" />Salvar rascunho</button>
        {status === "paused"
          ? <button type="button" className="btn btn-primary" disabled={pending || !ready} onClick={onResume}>Retomar campanha</button>
          : <button type="button" className="btn btn-primary" disabled={pending || !ready} onClick={onStart}>Iniciar campanha</button>}
        {status !== "paused" && (
          <div className="flex items-end gap-2 rounded-xl border border-line p-2">
            <div><label className="label text-[13px]" htmlFor="schedule-at">Programar início</label><input id="schedule-at" type="datetime-local" className="input py-2" value={at} onChange={(e) => setAt(e.target.value)} /></div>
            <button type="button" className="btn btn-secondary" disabled={pending || !ready || !at} onClick={() => onSchedule(new Date(at).toISOString())}>Programar</button>
          </div>
        )}
      </div>
      <p className="mt-4 text-[13px] text-muted">Pausar e retomar ficam disponíveis na Central de Campanhas e nos resultados. Ao pausar, nada se perde e ninguém recebe a mensagem duas vezes.</p>
    </StepBox>
  );
}
