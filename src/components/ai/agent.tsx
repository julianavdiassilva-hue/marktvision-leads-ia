"use client";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bot, Loader2, RotateCcw, Send } from "lucide-react";
import { Alert, Badge, Panel } from "@/components/ui";
import { ToggleSwitch } from "@/components/forms";
import { saveAiSettingsAction, testAgentAction } from "@/app/actions/ai";
import type { AiSettings, AgentDecision } from "@/server/services/ai-agent";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function AgentSettings({ s, provider, canEdit }: { s: AiSettings; provider: { ready: boolean; label: string | null; model: string }; canEdit: boolean }) {
  const router = useRouter();
  const h = s.business_hours ?? {};
  const [f, setF] = useState({
    enabled: s.enabled, agentName: s.agent_name, personality: s.personality ?? "", tone: s.tone ?? "", instructions: s.instructions ?? "",
    qualificationCriteria: s.qualification_criteria ?? "", handoffCriteria: s.handoff_criteria ?? "", greetingMessage: s.greeting_message ?? "",
    closingMessage: s.closing_message ?? "", outsideHoursMessage: s.outside_hours_message ?? "", autoReplyNew: s.auto_reply_new,
    hoursEnabled: !!h.enabled, days: h.days ?? [1, 2, 3, 4, 5], start: h.start ?? "08:00", end: h.end ?? "18:00",
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const field = (k: keyof typeof f, label: string, rows = 0, ph = "") => (
    <div><label className="label" htmlFor={`a-${k}`}>{label}</label>
      {rows ? <textarea id={`a-${k}`} className="input" rows={rows} disabled={!canEdit} placeholder={ph} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        : <input id={`a-${k}`} className="input" disabled={!canEdit} placeholder={ph} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</div>);
  return (
    <div className="space-y-6">
      {!provider.ready ? <Alert tone="amber">Nenhum provedor de IA configurado nesta instalação. O administrador da plataforma pode ativar uma opção gratuita (Google Gemini, Groq ou Ollama local) — veja o MANUAL. Até lá, o agente não responde e as conversas ficam com os vendedores.</Alert>
        : <Alert tone="green">Provedor de IA ativo: <b>{provider.label}</b>{provider.model ? ` (${provider.model})` : ""}.</Alert>}
      <Panel title="Agente" actions={<div className="flex items-center gap-3"><span className="text-[14.5px] text-muted">{f.enabled ? "Ativo" : "Desativado"}</span>
        <ToggleSwitch label="Agente ativo" checked={f.enabled} disabled={!canEdit} onToggle={async (v) => { setF({ ...f, enabled: v }); return saveAiSettingsAction({ ...f, enabled: v }); }} /></div>}>
        <div className="grid gap-4 lg:grid-cols-2">
          {field("agentName", "Nome do agente", 0, "Ex.: Lia")}
          {field("tone", "Tom de voz", 0, "Ex.: simpático e direto")}
          {field("personality", "Personalidade", 2, "Ex.: atenciosa, paciente, focada em resolver")}
          {field("instructions", "Instruções de atendimento", 4, "Ex.: sempre pergunte o bairro; ofereça a visita técnica gratuita")}
          {field("qualificationCriteria", "Critérios de qualificação", 3, "Ex.: informou o tipo de serviço, quantidade e bairro")}
          {field("handoffCriteria", "Critérios para transferir ao vendedor", 3, "Ex.: pediu orçamento, quer negociar preço, reclamação")}
          {field("greetingMessage", "Mensagem inicial", 2, "Ex.: Olá! Sou a Lia, assistente virtual da Clima Frio.")}
          {field("closingMessage", "Mensagem ao transferir/encerrar", 2, "Ex.: Vou chamar um especialista, um momento!")}
        </div>
        <label className="mt-4 flex items-center gap-2.5 text-[15px]"><input type="checkbox" className="h-4 w-4 accent-brand" disabled={!canEdit} checked={f.autoReplyNew} onChange={(e) => setF({ ...f, autoReplyNew: e.target.checked })} />
          Atender automaticamente novos contatos que chegarem pelo WhatsApp (campanhas seguem o modo escolhido em cada campanha)</label>
      </Panel>
      <Panel title="Horário de atendimento da IA">
        <label className="flex items-center gap-2.5 text-[15px]"><input type="checkbox" className="h-4 w-4 accent-brand" disabled={!canEdit} checked={f.hoursEnabled} onChange={(e) => setF({ ...f, hoursEnabled: e.target.checked })} />Restringir a IA a um horário</label>
        {f.hoursEnabled && (
          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_140px_140px]">
            <div><p className="label">Dias</p><div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => (
              <button key={d} type="button" disabled={!canEdit} onClick={() => setF({ ...f, days: f.days.includes(i) ? f.days.filter((x) => x !== i) : [...f.days, i].sort() })}
                className={clsx("rounded-lg border px-3 py-1.5 text-[14px] font-semibold", f.days.includes(i) ? "border-brand bg-brand-light text-brand-dark" : "border-line text-muted")}>{d}</button>))}</div></div>
            <div><label className="label" htmlFor="a-start">Início</label><input id="a-start" type="time" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
            <div><label className="label" htmlFor="a-end">Fim</label><input id="a-end" type="time" className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div>
            <div className="lg:col-span-3">{field("outsideHoursMessage", "Mensagem fora do horário (enviada no máximo 1 vez a cada 12h por conversa)", 2)}</div>
          </div>
        )}
      </Panel>
      {canEdit && <div className="flex items-center justify-end gap-3">
        {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-brand-dark" : "text-danger"}>{msg.text}</span>}
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await saveAiSettingsAction(f); setMsg(r.ok ? { ok: true, text: r.message! } : { ok: false, text: r.error }); if (r.ok) router.refresh(); })}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}Salvar configurações</button></div>}
    </div>
  );
}

export function AgentTester({ disabled }: { disabled: boolean }) {
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string; meta?: AgentDecision }[]>([]);
  const [text, setText] = useState(""); const [err, setErr] = useState<string | null>(null); const [pending, start] = useTransition();
  const send = () => {
    const t = text.trim(); if (!t) return;
    const next = [...msgs, { role: "user" as const, content: t }]; setMsgs(next); setText(""); setErr(null);
    start(async () => {
      const r = await testAgentAction(next.map(({ role, content }) => ({ role, content })));
      if (!r.ok) return setErr(r.error);
      const d = r.data as AgentDecision; setMsgs([...next, { role: "assistant", content: d.reply, meta: d }]);
    });
  };
  return (
    <Panel title="Testar o agente" description="Converse como se fosse um cliente. Nada é enviado pelo WhatsApp." actions={<button className="btn btn-ghost btn-sm" onClick={() => setMsgs([])}><RotateCcw className="h-4 w-4" />Recomeçar</button>}>
      <div className="h-80 space-y-2 overflow-y-auto rounded-xl bg-[#F4F1EC] p-3" data-testid="agent-chat">
        {msgs.length === 0 && <p className="pt-24 text-center text-[14.5px] text-muted">Ex.: “Quanto custa a instalação?”</p>}
        {msgs.map((m, i) => (
          <div key={i} className={clsx("flex", m.role === "user" ? "justify-start" : "justify-end")}>
            <div className={clsx("max-w-[85%] rounded-xl px-3 py-2 text-[15px] shadow-sm", m.role === "user" ? "bg-white" : "bg-[#D9FDD3]")}>
              {m.role === "assistant" && <p className="mb-0.5 flex items-center gap-1 text-[12px] font-semibold text-brand-dark"><Bot className="h-3 w-3" />Agente</p>}
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.meta && <p className="mt-1 flex flex-wrap gap-1">{m.meta.qualified && <Badge tone="green">Qualificado</Badge>}{m.meta.handoff && <Badge tone="amber">Transferiria: {m.meta.handoff_reason ?? "vendedor"}</Badge>}{m.meta.intent && <Badge tone="gray">{m.meta.intent}</Badge>}</p>}
            </div>
          </div>))}
        {pending && <p className="text-right text-muted"><Loader2 className="inline h-4 w-4 animate-spin" /></p>}
      </div>
      {err && <p role="alert" className="mt-2 text-[14px] font-medium text-danger">{err}</p>}
      <div className="mt-3 flex gap-2"><input className="input" aria-label="Mensagem de teste" value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Digite como cliente" />
        <button className="btn btn-primary" disabled={pending || disabled || !text.trim()} onClick={send} aria-label="Enviar teste"><Send className="h-4 w-4" /></button></div>
    </Panel>
  );
}
