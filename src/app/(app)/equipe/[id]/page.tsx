import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { pageError, requireModulePage } from "@/server/auth/next";
import { getUserDetail } from "@/server/services/users";
import { Badge } from "@/components/ui";
import { UserManage } from "@/components/admin/user-manage";
import { ROLE_LABEL } from "@/lib/features";

export const metadata = { title: "Membro da equipe" };

export default async function TeamMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModulePage(["sales_team"], { adminOnly: true });
  const { id } = await params;
  const user = await getUserDetail(ctx, id).catch(pageError);
  return (
    <>
      <Link href="/equipe" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-dark hover:underline"><ArrowLeft className="h-4 w-4" />Equipe Comercial</Link>
      <div className="mb-7 flex flex-wrap items-center gap-3"><h1 className="text-[28px] font-bold tracking-tight">{user.name}</h1><Badge tone="green">{ROLE_LABEL[user.role]}</Badge></div>
      <UserManage user={user} isSelf={user.id === ctx.user.id} />
    </>
  );
}
