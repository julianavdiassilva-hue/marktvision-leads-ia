import { requireModulePage } from "@/server/auth/next";
import { contactPageData } from "@/server/services/contact-page";
import { PageHeader } from "@/components/ui";
import { ContactsTabs } from "@/components/contacts/tabs";
import { SpreadsheetImporter } from "@/components/prospecting/spreadsheet-importer";

export const metadata = { title: "Importar planilha" };

export default async function ImportPage() {
  const ctx = await requireModulePage(["spreadsheet_import"]);
  const aux = await contactPageData(ctx);
  return (
    <>
      <PageHeader title="Contatos e listas" description="Importe XLS, XLSX ou CSV. Os contatos entram na base central, sem duplicar, e a lista fica disponível para campanhas." />
      <ContactsTabs active="importar" ctx={ctx} />
      <SpreadsheetImporter lists={aux.lists} team={aux.team} canLists={aux.perms.canLists} canAssign={aux.perms.canAssign} />
    </>
  );
}
