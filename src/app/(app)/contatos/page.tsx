import { redirect } from "next/navigation";
import { requireModulePage } from "@/server/auth/next";
import { hasFeature } from "@/server/guards";
import { listContacts } from "@/server/services/contacts";
import { contactPageData, filtersFromSearch } from "@/server/services/contact-page";
import { PageHeader } from "@/components/ui";
import { ContactsTabs } from "@/components/contacts/tabs";
import { ContactsManager } from "@/components/contacts/contacts-manager";

export const metadata = { title: "Contatos" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireModulePage(["contacts", "contact_lists"]);
  if (!hasFeature(ctx, "contacts")) redirect("/contatos/listas");
  const filters = filtersFromSearch(await searchParams);
  const [data, aux] = await Promise.all([listContacts(ctx, filters), contactPageData(ctx)]);
  return (
    <>
      <PageHeader title="Contatos e listas" description={ctx.role === "seller" ? "Seus contatos. O mesmo cadastro é usado em campanhas, conversas e CRM." : "Base central única: o mesmo contato é usado em campanhas, conversas e CRM, sem cadastros duplicados."} />
      <ContactsTabs active="contatos" showContacts showLists={hasFeature(ctx, "contact_lists")} />
      <ContactsManager {...data} filters={filters} {...aux} />
    </>
  );
}
