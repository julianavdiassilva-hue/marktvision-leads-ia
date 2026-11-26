import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { pageError, requirePlatformPage } from "@/server/auth/next";
import { getUserDetail } from "@/server/services/users";
import { Badge } from "@/components/ui";
import { UserManage } from "@/components/admin/user-manage";
import { ROLE_LABEL } from "@/lib/features";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Usuário" };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
  const user = await getUserDetail(ctx, id).catch(pageError);
  return (
    <>
      <Link href="/admin/usuarios" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-dark hover:underline"><ArrowLeft className="h-4 w-4" />Usuários</Link>
      <div className="mb-7">
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-[28px] font-bold tracking-tight">{user.name}</h1><Badge tone="green">{ROLE_LABEL[user.role]}</Badge>{!user.is_active && <Badge tone="red">Desativado</Badge>}</div>
        <p className="mt-1 text-[16px] text-muted">Login <span className="font-mono">{user.username}</span>{user.company_name && <> · {user.company_name}</>} · último acesso {user.last_login_at ? fmtDateTime(user.last_login_at) : "nunca"}</p>
      </div>
      <UserManage user={user} isSelf={user.id === ctx.user.id} />
    </>
  );
}
