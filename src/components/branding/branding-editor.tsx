"use client";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Copy, ImageUp, Loader2, RotateCcw, Save, Trash2, LayoutDashboard, Megaphone, MessagesSquare, Users } from "lucide-react";
import { Panel } from "@/components/ui";
import { BrandLogo } from "@/components/brand";
import { contrast, DEFAULT_THEME, normalizeHex, THEME_FIELDS, themeVars, validateTheme, type ThemeColors, type ThemeKey } from "@/lib/theme";
import { removeLogoAction, resetBrandingAction, saveBrandingAction, uploadLogoAction } from "@/app/actions/branding";

type Props = {
  companyId: string; companyName: string; slug: string; canEditSlug: boolean;
  initial: { colors: ThemeColors; displayName: string | null; logoUrl: string | null; customized: boolean };
};
type Msg = { ok: boolean; text: string } | null;

const toBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1] ?? "");
  r.onerror = () => rej(new Error("Não foi possível ler o arquivo."));
  r.readAsDataURL(f);
});

export function BrandingEditor({ companyId, companyName, slug: initialSlug, canEditSlug, initial }: Props) {
  const router = useRouter();
  const [colors, setColors] = useState<ThemeColors>(initial.colors);
  const [drafts, setDrafts] = useState<Record<ThemeKey, string>>(() => ({ ...initial.colors }));
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [slug, setSlug] = useState(initialSlug);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<null | "save" | "logo" | "remove" | "reset">(null);
  const [, start] = useTransition();
  const [origin, setOrigin] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const problems = useMemo(() => validateTheme(colors), [colors]);
  const vars = useMemo(() => themeVars(colors) as unknown as CSSProperties, [colors]);
  const name = displayName.trim() || companyName;
  const dirty = JSON.stringify(colors) !== JSON.stringify(initial.colors) || (displayName.trim() || null) !== initial.displayName || slug !== initialSlug;

  const setColor = (k: ThemeKey, v: string) => {
    setDrafts((d) => ({ ...d, [k]: v }));
    const h = normalizeHex(v);
    if (h) setColors((c) => ({ ...c, [k]: h }));
  };
  type R = { ok: boolean; message?: string; error?: string };
  const run = (kind: NonNullable<typeof busy>, fn: () => Promise<R>, after?: () => void) => {
    setBusy(kind); setMsg(null);
    start(async () => {
      const r: R = await fn().catch(() => ({ ok: false, error: "Falha de comunicação. Tente novamente." }));
      setBusy(null);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Salvo." } : { ok: false, text: r.error ?? "Não foi possível concluir." });
      if (r.ok) { after?.(); router.refresh(); }
    });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1024 * 1024) { setMsg({ ok: false, text: "A logomarca deve ter no máximo 1 MB." }); return; }
    const base64 = await toBase64(f).catch(() => "");
    run("logo", async () => {
      const r = await uploadLogoAction(companyId, { name: f.name, base64 });
      if (r.ok) setLogoUrl((r.data as { url: string }).url);
      return r;
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const loginPath = `/entrar/${slug}`;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-6">
        <Panel title="Logomarca" description="PNG, JPG ou WEBP de até 1 MB. Prefira PNG com fundo transparente, na horizontal. Ela aparece sobre a cor do menu lateral e na tela de login — confira na pré-visualização.">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-20 min-w-[180px] place-items-center rounded-lg border border-dashed border-line bg-surface px-4">
              {logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={logoUrl} alt={`Logomarca de ${name}`} className="max-h-16 w-auto max-w-[220px] object-contain" />
                : <span className="text-[14px] text-muted">Sem logomarca</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Arquivo da logomarca"
                onChange={(e) => onFile(e.target.files?.[0])} data-testid="logo-input" />
              <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                {busy === "logo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}{logoUrl ? "Substituir logomarca" : "Enviar logomarca"}
              </button>
              {logoUrl && <button type="button" className="btn btn-danger" disabled={!!busy}
                onClick={() => confirm("Remover a logomarca desta empresa?") && run("remove", () => removeLogoAction(companyId), () => setLogoUrl(null))}>
                {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Remover logomarca</button>}
            </div>
          </div>
        </Panel>

        <Panel title="Nome e endereço de acesso">
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="b-name">Nome exibido no sistema</label>
              <input id="b-name" className="input" maxLength={60} value={displayName} placeholder={companyName} onChange={(e) => setDisplayName(e.target.value)} />
              <p className="mt-1 text-[13px] text-muted">Aparece no menu, no cabeçalho, no título das abas e na tela de login. Em branco = nome da empresa.</p>
            </div>
            <div>
              <label className="label" htmlFor="b-slug">Endereço da tela de login da empresa</label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] text-muted">{origin}/entrar/</span>
                <input id="b-slug" className="input max-w-[260px]" value={slug} disabled={!canEditSlug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(origin + loginPath).then(() => setMsg({ ok: true, text: "Endereço copiado." }))}>
                  <Copy className="h-4 w-4" />Copiar</button>
              </div>
              <p className="mt-1 text-[13px] text-muted">{canEditSlug ? "Envie este endereço aos vendedores." : "Envie este endereço aos vendedores. Somente o administrador geral altera o endereço."}</p>
            </div>
          </div>
        </Panel>

        <Panel title="Cores" description="Use o seletor ou digite o código hexadecimal. A pré-visualização muda na hora.">
          <div className="grid gap-4 sm:grid-cols-2">
            {THEME_FIELDS.map((f) => {
              const valid = !!normalizeHex(drafts[f.key]);
              return (
                <div key={f.key}>
                  <label className="label" htmlFor={`c-${f.key}`}>{f.label}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" aria-label={`${f.label} (seletor)`} value={colors[f.key]} onChange={(e) => setColor(f.key, e.target.value)}
                      className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-1" />
                    <input id={`c-${f.key}`} className="input font-mono uppercase" maxLength={7} value={drafts[f.key]} aria-invalid={!valid}
                      onChange={(e) => setColor(f.key, e.target.value)} onBlur={() => setDrafts((d) => ({ ...d, [f.key]: colors[f.key] }))} />
                  </div>
                  <p className={valid ? "mt-1 text-[13px] text-muted" : "mt-1 text-[13px] font-medium text-danger"}>{valid ? f.hint : "Código inválido. Exemplo: #008C48"}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[13.5px] text-muted">
            Contraste do texto com o fundo: <b className="text-ink">{contrast(colors.text, colors.background).toFixed(1).replace(".", ",")}:1</b> (mínimo 4,5:1).
            Textos de botões e do menu são ajustados automaticamente para ficarem legíveis.
          </p>
          {problems.length > 0 && (
            <ul role="alert" className="mt-3 space-y-1 rounded-lg border border-danger/25 bg-danger-light px-4 py-3 text-[14px] font-medium text-danger">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </Panel>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={!!busy || problems.length > 0}
            onClick={() => run("save", () => saveBrandingAction(companyId, {
              displayName: displayName.trim(), ...(canEditSlug && slug !== initialSlug ? { slug } : {}), ...colors,
            }))}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar personalização</button>
          <button type="button" className="btn btn-secondary" disabled={!!busy}
            onClick={() => confirm("Restaurar a identidade visual padrão da Marktvision? As cores, o nome exibido e a logomarca desta empresa serão removidos.")
              && run("reset", () => resetBrandingAction(companyId), () => { setColors({ ...DEFAULT_THEME }); setDrafts({ ...DEFAULT_THEME }); setDisplayName(""); setLogoUrl(null); })}>
            {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Restaurar padrão original</button>
          {dirty && !busy && <span className="text-[14px] text-warning">Alterações ainda não salvas</span>}
          {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-[14.5px] font-medium text-brand-dark" : "text-[14.5px] font-medium text-danger"}>{msg.text}</span>}
        </div>
      </div>

      <div className="xl:sticky xl:top-24 xl:self-start">
        <Panel title="Pré-visualização" description="Como os usuários desta empresa verão o sistema." padded={false}>
          <Preview vars={vars} name={name} logoUrl={logoUrl} />
        </Panel>
      </div>
    </div>
  );
}

/** Miniatura do sistema usando as MESMAS variáveis CSS aplicadas no ambiente real. */
function Preview({ vars, name, logoUrl }: { vars: CSSProperties; name: string; logoUrl: string | null }) {
  const items = [["Dashboard", LayoutDashboard], ["Campanhas", Megaphone], ["Contatos e listas", Users], ["Conversas", MessagesSquare]] as const;
  return (
    <div style={vars} data-testid="branding-preview" className="overflow-hidden rounded-b-xl bg-page text-ink">
      <div className="grid min-h-[420px] grid-cols-[minmax(0,180px)_minmax(0,1fr)] max-sm:grid-cols-1">
        <aside className="border-r border-line bg-sidebar p-3 max-sm:hidden">
          <div className="mb-4 px-1"><BrandLogo brand={{ name, logoUrl }} /></div>
          <ul className="space-y-0.5">
            {items.map(([label, Icon], i) => (
              <li key={label} className={i === 1 ? "flex items-center gap-2 rounded-lg bg-sidebar-active px-2.5 py-2 text-[13.5px] font-semibold text-sidebar-active-ink"
                : "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] text-sidebar-ink/85"}>
                <Icon className={i === 1 ? "h-4 w-4 text-sidebar-icon" : "h-4 w-4 text-sidebar-muted"} />{label}
                {label === "Conversas" && <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">3</span>}
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-w-0">
          <div className="flex h-11 items-center border-b border-line bg-page px-4 text-[13px] text-muted">Empresa:&nbsp;<b className="text-ink">{name}</b></div>
          <div className="space-y-4 p-4">
            <div><p className="text-[18px] font-bold">Campanhas</p><p className="text-[13px] text-muted">Envios, respostas e vendas de cada campanha.</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line bg-white p-3"><p className="text-[12px] text-muted">Leads no mês</p><p className="text-[22px] font-bold">248</p></div>
              <div className="rounded-lg border border-line bg-white p-3"><p className="text-[12px] text-muted">Respostas</p>
                <div className="mt-2 h-2 rounded-full bg-brand-light"><div className="h-2 w-2/3 rounded-full bg-brand" /></div></div>
            </div>
            <div className="rounded-lg border border-line bg-white text-[13px]">
              <div className="border-b border-line bg-surface px-3 py-2 font-semibold uppercase tracking-wide text-muted">Contato</div>
              <div className="flex items-center justify-between px-3 py-2"><span>Clínica Exemplo</span><span className="font-semibold text-brand-dark underline">Abrir conversa</span></div>
            </div>
            <div className="flex flex-wrap gap-2" aria-hidden>
              <span className="btn btn-primary btn-sm">Nova campanha</span>
              <span className="btn btn-secondary btn-sm">Exportar</span>
              <span className="btn btn-ghost btn-sm">Ver detalhes</span>
            </div>
            <p className="text-[12px] text-muted">Exemplo ilustrativo — os números acima não são dados da empresa.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
