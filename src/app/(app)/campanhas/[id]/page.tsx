import clsx from "clsx";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { pageError, requireModulePage } from "@/server/auth/next";
import { getCampaign } from "@/server/services/campaigns";
import { Badge, Empty, Panel } from "@/components/ui";
import { CampaignActions, CampaignStatus, ProgressBar } from "@/components/campaigns/campaign-list";
import { formatPhone } from "@/lib/phone";
import { fmtDateTime, fmtInt, fmtMoney, pct } from "@/lib/format";

export const metadata = { title: "Resultados da campanha" };

const CC_STATUS: Record<string, [string, "green" | "gray" | "red" | "amber" | "blue"]> = {
  pending: ["Pendente", "gray"], queued: ["Na fila", "gray"], sending: ["Enviando", "blue"], sent: ["Enviada", "blue"], delivered: ["Entregue", "green"],
  read: ["Lida", "green"], replied: ["Respondeu", "green"], failed: ["Falhou", "red"], skipped: ["Ignorado", "amber"],
};
const MODE: Record<string, string> = { human: "Atendimento humano", ai: "Atendimento com IA", ai_then_human: "IA + transferência ao vendedor" };

export default async function CampaignResults({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; pagina?: string }> }) {
  const ctx = await requireModulePage(["campaigns"]);
  const { id } = await params;
  const sp = await searchParams;
  const { campaign: c, contacts } = await getCampaign(ctx, id, Number(sp.pagina) || 1, sp.status).catch(pageError);
  const funnel: [string, number][] = [["Contatos", c.total], ["Enviados", c.sent], ["Entregues", c.delivered], ["Respostas", c.replies], ["Convertidos (CRM)", c.converted], ["Vendas", c.sales_count]];
  return (
    <>
      <Link href="/campanhas" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-dark hover:underline"><ArrowLeft className="h-4 w-4" />Campanhas</Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-md bg-brand-light px-2 py-0.5 text-[15px] font-bold text-brand-dark">{String(c.number).padStart(2, "0")}</span>
            <h1 className="text-[28px] font-bold tracking-tight">{c.name}</h1><CampaignStatus status={c.status} />
          </div>
          <p className="mt-1 text-[15.5px] text-muted">Lista: {c.list_name ?? "seleção própria"} · WhatsApp: {c.connection_name ?? "não definido"} · {MODE[c.response_mode]}
            {c.started_at && ` · iniciada em ${fmtDateTime(c.started_at)}`}{c.scheduled_at && ` · programada para ${fmtDateTime(c.scheduled_at)}`}</p>
        </div>
        <CampaignActions c={c} />
      </div>

      <div className="panel mb-6 p-5">
        <div className="mb-2 flex justify-between text-[15px]"><span className="font-semibold">Progresso dos envios</span><span className="font-bold tabular-nums">{c.progress}%</span></div>
        <ProgressBar value={c.progress} />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {funnel.map(([l, v], i) => (
            <div key={l} className="rounded-xl bg-surface px-4 py-3">
              <p className="text-[13.5px] text-muted">{l}</p>
              <p className="text-[26px] font-bold tabular-nums">{fmtInt(v)}</p>
              {i > 0 && <p className="text-[12.5px] text-muted">{pct(v, funnel[i - 1][1])}% da etapa anterior</p>}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[14px] text-muted">Falhas: <b className={clsx(c.failed && "text-danger")}>{fmtInt(c.failed)}</b> · Ignorados (descadastrados/sem telefone): <b>{fmtInt(c.skipped)}</b> · Pendentes: <b>{fmtInt(c.pending)}</b> · Vendas: <b>{fmtMoney(c.sales_amount)}</b></p>
      </div>

      {c.message_body && (
        <Panel title="Mensagem" className="mb-6"><p className="whitespace-pre-wrap text-[15px]">{c.message_body}</p></Panel>
      )}

      <Panel title="Contatos da campanha" padded={false} actions={
        <form className="flex gap-2"><select name="status" defaultValue={sp.status ?? ""} className="input w-auto py-1.5 text-[14px]" aria-label="Situação do envio">
          <option value="">Todas as situações</option>{Object.entries(CC_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select><button className="btn btn-secondary btn-sm">Filtrar</button></form>}>
        {contacts.length === 0 ? <Empty title="Nenhum contato nesta situação" /> : (
          <div className="overflow-x-auto"><table className="table min-w-[760px]">
            <thead><tr><th>Contato</th><th>Telefone</th><th>Situação</th><th>Enviada</th><th>Resposta</th></tr></thead>
            <tbody>{contacts.map((x) => (
              <tr key={x.contact_id}>
                <td><Link href={`/contatos/${x.contact_id}`} className="font-semibold hover:text-brand">{x.name || x.organization || "—"}</Link></td>
                <td className="whitespace-nowrap">{formatPhone(x.phone_e164) || "—"}</td>
                <td><Badge tone={CC_STATUS[x.status]?.[1] ?? "gray"}>{CC_STATUS[x.status]?.[0] ?? x.status}</Badge>{x.error && <p className="mt-0.5 text-[13px] text-muted">{x.error}</p>}</td>
                <td className="text-[14px] text-muted">{fmtDateTime(x.sent_at)}</td><td className="text-[14px] text-muted">{fmtDateTime(x.replied_at)}</td>
              </tr>))}
            </tbody></table></div>
        )}
      </Panel>
    </>
  );
}
