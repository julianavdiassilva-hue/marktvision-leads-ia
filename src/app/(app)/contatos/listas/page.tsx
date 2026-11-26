import Link from "next/link";
import { requireModulePage } from "@/server/auth/next";
import { isCompanyAdmin } from "@/server/guards";
import { listLists } from "@/server/services/lists";
import { Empty, PageHeader } from "@/components/ui";
import { ContactsTabs } from "@/components/contacts/tabs";
import { ListCreateButton, ListDeleteButton } from "@/components/contacts/lists";
import { fmtDate, fmtInt } from "@/lib/format";

export const metadata = { title: "Listas de contatos" };

export default async function ListsPage() {
  const ctx = await requireModulePage(["contact_lists"]);
  const lists = await listLists(ctx);
  return (
    <>
      <PageHeader title="Contatos e listas" description="Listas organizam contatos da base central e aparecem automaticamente na criação de campanhas." actions={<ListCreateButton />} />
      <ContactsTabs active="listas" ctx={ctx} />
      <div className="panel overflow-x-auto">
        {lists.length === 0 ? <Empty title="Nenhuma lista criada" description="Crie uma lista e adicione contatos pela tela de contatos, por importação de planilha ou pela pesquisa no Google." /> : (
          <table className="table min-w-[720px]">
            <thead><tr><th>Lista</th><th className="text-right">Contatos</th><th className="text-right">Campanhas</th><th>Criada por</th><th>Criação</th><th /></tr></thead>
            <tbody>{lists.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/contatos/listas/${l.id}`} className="font-semibold hover:text-brand">{l.name}</Link>{l.description && <p className="text-[13px] text-muted">{l.description}</p>}</td>
                <td className="text-right tabular-nums font-semibold">{fmtInt(l.contacts)}</td>
                <td className="text-right tabular-nums">{fmtInt(l.campaigns)}</td>
                <td className="text-[14px]">{l.created_by_name ?? "—"}</td>
                <td className="text-[14px] text-muted">{fmtDate(l.created_at)}</td>
                <td className="text-right">{isCompanyAdmin(ctx) && <ListDeleteButton id={l.id} name={l.name} />}</td>
              </tr>))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
