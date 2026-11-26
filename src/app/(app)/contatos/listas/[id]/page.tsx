import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { pageError, requireModulePage } from "@/server/auth/next";
import { hasFeature } from "@/server/guards";
import { getList } from "@/server/services/lists";
import { listContacts } from "@/server/services/contacts";
import { contactPageData, filtersFromSearch } from "@/server/services/contact-page";
import { ContactsManager } from "@/components/contacts/contacts-manager";
import { ListEditButton } from "@/components/contacts/lists";
import { fmtInt } from "@/lib/format";

export const metadata = { title: "Lista" };

export default async function ListDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireModulePage(["contact_lists"]);
  const { id } = await params;
  const list = await getList(ctx, id).catch(pageError);
  const filters = { ...filtersFromSearch(await searchParams), listId: id };
  const [data, aux] = await Promise.all([listContacts(ctx, filters), contactPageData(ctx)]);
  return (
    <>
      <Link href="/contatos/listas" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-dark hover:underline"><ArrowLeft className="h-4 w-4" />Listas</Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">{list.name}</h1>
          <p className="mt-1 text-[16px] text-muted">{fmtInt(list.contacts)} contato(s){list.description ? ` · ${list.description}` : ""}</p>
        </div>
        <ListEditButton list={list} />
      </div>
      {hasFeature(ctx, "contacts")
        ? <ContactsManager {...data} filters={filters} {...aux} fixedListId={id} />
        : <p className="text-muted">Sua permissão não inclui a visualização dos contatos.</p>}
    </>
  );
}
