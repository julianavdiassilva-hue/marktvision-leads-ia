import { requireModulePage } from "@/server/auth/next";
import { contactPageData } from "@/server/services/contact-page";
import { isGoogleConfigured } from "@/server/integrations/google-places";
import { searchProvider } from "@/server/services/prospecting";
import { PageHeader } from "@/components/ui";
import { ContactsTabs } from "@/components/contacts/tabs";
import { GoogleSearch } from "@/components/prospecting/google-search";

export const metadata = { title: "Pesquisa no Google" };

export default async function GooglePage() {
  const ctx = await requireModulePage(["google_search"]);
  const aux = await contactPageData(ctx);
  return (
    <>
      <PageHeader title="Contatos e listas" description="Encontre empresas (Google ou OpenStreetMap gratuito) e adicione-as à base de contatos ou a uma lista para campanhas." />
      <ContactsTabs active="google" ctx={ctx} />
      <GoogleSearch configured={isGoogleConfigured()} provider={searchProvider()} lists={aux.lists} team={aux.team} canLists={aux.perms.canLists} canAssign={aux.perms.canAssign} />
    </>
  );
}
