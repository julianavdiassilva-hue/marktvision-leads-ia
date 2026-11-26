import type { AuthContext } from "../auth/core";
import { hasFeature, isCompanyAdmin } from "../guards";
import { isGoogleConfigured } from "../integrations/google-places";
import { listOptions } from "./lists";
import { teamOptions } from "./contacts";
import { listScripts } from "./scripts";
import { contactsLite, getCampaign, whatsappOptions } from "./campaigns";
import { listTemplates } from "./whatsapp";
import type { WizardInitial, WizardPerms } from "@/components/campaigns/campaign-wizard";

/** Dados do assistente de campanha (nova ou edição). */
export async function wizardData(ctx: AuthContext, campaignId?: string) {
  const [lists, team, scripts, connections, templates] = await Promise.all([
    hasFeature(ctx, "contact_lists") ? listOptions(ctx) : Promise.resolve([]), teamOptions(ctx), listScripts(ctx), whatsappOptions(ctx), listTemplates(ctx),
  ]);
  let initial: WizardInitial = { name: "", listId: null, scriptId: null, messageBody: "", whatsappConnectionId: null, responseMode: "human", contacts: [], contactIds: [], templateId: null, templateParams: [] };
  if (campaignId) {
    const { campaign: c, contactIds } = await getCampaign(ctx, campaignId);
    initial = {
      id: c.id, status: c.status, name: c.name, listId: c.list_id, scriptId: c.script_id, messageBody: c.message_body ?? "",
      whatsappConnectionId: c.whatsapp_connection_id, responseMode: c.response_mode as WizardInitial["responseMode"],
      contacts: contactIds.length ? await contactsLite(ctx, { ids: contactIds }) : [], contactIds,
      templateId: (c as unknown as { template_id: string | null }).template_id ?? null,
      templateParams: ((c as unknown as { settings?: { templateParams?: string[] } }).settings?.templateParams) ?? [],
    };
  }
  const perms: WizardPerms = {
    google: hasFeature(ctx, "google_search"), googleConfigured: isGoogleConfigured(), import: hasFeature(ctx, "spreadsheet_import"),
    lists: hasFeature(ctx, "contact_lists"), aiMessages: hasFeature(ctx, "ai_messages"), broadcasts: hasFeature(ctx, "broadcasts"), canAssign: isCompanyAdmin(ctx),
  };
  return { lists, team, scripts, connections, templates, initial, perms, companyName: ctx.company!.name };
}
