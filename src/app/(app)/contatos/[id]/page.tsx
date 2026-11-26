import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { pageError, requireModulePage } from "@/server/auth/next";
import { getContact } from "@/server/services/contacts";
import { contactPageData } from "@/server/services/contact-page";
import { Badge, Panel } from "@/components/ui";
import { ContactEdit, ContactSide } from "@/components/contacts/contact-detail";
import { EVENT_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { fmtDateTime, fmtMoney } from "@/lib/format";

export const metadata = { title: "Contato" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModulePage(["contacts"]);
  const { id } = await params;
  const [d, aux] = await Promise.all([getContact(ctx, id).catch(pageError), contactPageData(ctx)]);
  const c = d.contact;
  const title = String(c.name || c.organization || formatPhone(c.phone_e164 as string) || c.email);
  return (
    <>
      <Link href="/contatos" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-dark hover:underline"><ArrowLeft className="h-4 w-4" />Contatos</Link>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
          <Badge tone="green">{STATUS_LABEL[String(c.commercial_status)]}</Badge>
        </div>
        <p className="mt-1 text-[16px] text-muted">
          {[formatPhone(c.phone_e164 as string), c.organization, c.city].filter(Boolean).join(" · ")}
          {" · "}Origem: {SOURCE_LABEL[String(c.source)]} · cadastrado em {fmtDateTime(String(c.created_at))}{c.owner_name ? ` · responsável: ${c.owner_name}` : ""}
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <ContactEdit contact={c} />
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Campanhas">
              {d.campaigns.length === 0 ? <p className="text-[14px] text-muted">Ainda não participou de campanhas.</p> :
                <ul className="space-y-1.5 text-[15px]">{d.campaigns.map((x) => <li key={x.id}>#{x.number} {x.name}</li>)}</ul>}
            </Panel>
            <Panel title="Conversas">
              {d.conversations.length === 0 ? <p className="text-[14px] text-muted">Nenhuma conversa registrada.</p> :
                <ul className="space-y-1.5 text-[15px]">{d.conversations.map((x) => <li key={x.id}>{x.status} · {fmtDateTime(x.last_message_at)}</li>)}</ul>}
            </Panel>
            <Panel title="Negociações">
              {d.opportunities.length === 0 ? <p className="text-[14px] text-muted">Nenhuma oportunidade no CRM.</p> :
                <ul className="space-y-1.5 text-[15px]">{d.opportunities.map((x) => <li key={x.id}>{x.stage} · {fmtMoney(x.value)}</li>)}</ul>}
            </Panel>
          </div>
          <Panel title="Histórico" description="Tudo o que aconteceu com este contato em todos os módulos.">
            {d.events.length === 0 ? <p className="text-[14px] text-muted">Sem eventos.</p> : (
              <ol className="space-y-3 border-l-2 border-brand-light pl-5">
                {d.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand" />
                    <p className="text-[15px] font-semibold">{EVENT_LABEL[e.type] ?? e.type}
                      {typeof e.data?.tag === "string" && <span className="font-normal text-muted"> · {e.data.tag}</span>}</p>
                    <p className="text-[13px] text-muted">{fmtDateTime(e.created_at)}{e.actor ? ` · ${e.actor}` : ""}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
        <ContactSide contact={c} tags={d.tags} lists={d.lists} allTags={aux.tags} allLists={aux.lists} team={aux.team} perms={aux.perms} />
      </div>
    </>
  );
}
