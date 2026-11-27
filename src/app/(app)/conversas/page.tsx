import { requireModulePage } from "@/server/auth/next";
import { hasFeature, isCompanyAdmin } from "@/server/guards";
import { getConversation, listConversations, listQuickReplies, type ConvFilter } from "@/server/services/conversations";
import { teamOptions } from "@/server/services/contacts";
import { listTags } from "@/server/services/tags";
import { Inbox } from "@/components/conversations/inbox";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata = { title: "Conversas" };

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ c?: string; f?: string; q?: string }> }) {
  const ctx = await requireModulePage(["conversations"]);
  const sp = await searchParams;
  const allowed: ConvFilter[] = ctx.role === "seller" ? ["mine", "unread", "closed"] : ["mine", "all", "unassigned", "unread", "closed"];
  const filter = (allowed.includes(sp.f as ConvFilter) ? sp.f : ctx.role === "seller" ? "mine" : "all") as ConvFilter;
  const [list, team, tags, quickReplies] = await Promise.all([listConversations(ctx, { filter, q: sp.q }), teamOptions(ctx), listTags(ctx), listQuickReplies(ctx)]);
  const detail = sp.c ? await getConversation(ctx, sp.c).catch(() => null) : null;
  return (
    <>
      <AutoRefresh seconds={5} />
      <Inbox list={list} detail={detail} filter={filter} team={team} tags={tags} quickReplies={quickReplies}
        perms={{ isAdmin: isCompanyAdmin(ctx), isSeller: ctx.role === "seller", canAi: hasFeature(ctx, "ai_chatbot"), canAiMessages: hasFeature(ctx, "ai_messages"),
          canCrm: hasFeature(ctx, "crm"), canTags: hasFeature(ctx, "tags") }} />
    </>
  );
}
