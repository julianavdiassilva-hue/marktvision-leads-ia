import { requirePlatformPage } from "@/server/auth/next";
import { listUsers } from "@/server/services/users";
import { listCompanyOptions } from "@/server/services/companies";
import { PageHeader } from "@/components/ui";
import { UserCreateButton, UsersTable } from "@/components/admin/users";

export const metadata = { title: "Usuários" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; empresa?: string }> }) {
  const ctx = await requirePlatformPage();
  const sp = await searchParams;
  const companies = await listCompanyOptions(ctx);
  const companyId = companies.some((c) => c.id === sp.empresa) ? sp.empresa : undefined;
  const users = await listUsers(ctx, { search: sp.q, companyId });
  return (
    <>
      <PageHeader title="Usuários" description="Todos os acessos da plataforma. Criar usuários não altera a sua própria sessão."
        actions={<UserCreateButton companies={companies} allowPlatformAdmin />} />
      <form className="mb-4 flex flex-wrap gap-2.5">
        <input name="q" defaultValue={sp.q} className="input max-w-xs" placeholder="Buscar por nome ou login" />
        <select name="empresa" defaultValue={companyId ?? ""} className="input max-w-xs">
          <option value="">Todas as empresas</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn-secondary">Filtrar</button>
      </form>
      <div className="panel"><UsersTable users={users} basePath="/admin/usuarios" showCompany currentUserId={ctx.user.id} platformView /></div>
    </>
  );
}
