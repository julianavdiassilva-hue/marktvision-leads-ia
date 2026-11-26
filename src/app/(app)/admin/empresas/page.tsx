import Link from "next/link";
import { requirePlatformPage } from "@/server/auth/next";
import { listCompanies } from "@/server/services/companies";
import { planOptions } from "@/server/services/plans";
import { Alert, Empty, PageHeader, StatusDot } from "@/components/ui";
import { CompanyCreateButton } from "@/components/admin/company-create";
import { fmtDate, fmtInt } from "@/lib/format";

export const metadata = { title: "Empresas" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; selecione?: string }> }) {
  const ctx = await requirePlatformPage();
  const sp = await searchParams;
  const [companies, plans] = await Promise.all([listCompanies(ctx, sp.q), planOptions(ctx)]);
  return (
    <>
      <PageHeader title="Empresas" description="Clientes da plataforma, seus planos, acessos e utilização." actions={<CompanyCreateButton plans={plans} />} />
      {sp.selecione && <div className="mb-5"><Alert tone="amber">Para abrir os módulos comerciais, selecione uma empresa no campo “Ambiente”, no topo da tela.</Alert></div>}
      <form className="mb-4 flex gap-2.5">
        <input name="q" defaultValue={sp.q} className="input max-w-sm" placeholder="Buscar empresa pelo nome" />
        <button className="btn btn-secondary">Buscar</button>
      </form>
      <div className="panel overflow-x-auto">
        {companies.length === 0 ? (
          <Empty title={sp.q ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"} description="Cadastre a primeira empresa informando apenas o nome." />
        ) : (
          <table className="table min-w-[860px]">
            <thead><tr><th>Empresa</th><th>Plano</th><th className="text-right">Usuários</th><th className="text-right">Vendedores</th><th className="text-right">Contatos</th><th className="text-right">Campanhas</th><th>Cadastro</th><th>Situação</th></tr></thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/admin/empresas/${c.id}`} className="font-semibold text-ink hover:text-brand">{c.name}</Link>{c.segment && <p className="text-[13px] text-muted">{c.segment}</p>}</td>
                  <td>{c.plan_name ?? <span className="text-muted">Sem plano</span>}</td>
                  <td className="text-right tabular-nums">{fmtInt(c.users)}</td>
                  <td className="text-right tabular-nums">{fmtInt(c.sellers)}</td>
                  <td className="text-right tabular-nums">{fmtInt(c.contacts)}</td>
                  <td className="text-right tabular-nums">{fmtInt(c.campaigns)}</td>
                  <td>{fmtDate(c.created_at)}</td>
                  <td><StatusDot active={c.is_active} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
