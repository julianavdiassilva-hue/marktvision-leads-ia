import { requireModulePage } from "@/server/auth/next";
import { isCompanyAdmin } from "@/server/guards";
import { listTags, TAG_COLORS } from "@/server/services/tags";
import { PageHeader } from "@/components/ui";
import { TagsManager } from "@/components/contacts/tags";

export const metadata = { title: "Etiquetas" };

export default async function TagsPage() {
  const ctx = await requireModulePage(["tags"]);
  const tags = await listTags(ctx);
  return (
    <>
      <PageHeader title="Etiquetas" description="Etiquetas ficam no contato central: aplicadas em contatos, conversas ou CRM, aparecem em todos os módulos." />
      <TagsManager tags={tags} colors={TAG_COLORS} canEdit={isCompanyAdmin(ctx)} />
    </>
  );
}
