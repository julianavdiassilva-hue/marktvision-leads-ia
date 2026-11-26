import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requirePage } from "@/server/auth/next";
import { ruleFor } from "@/lib/route-guard";
import { MAIN_NAV, PLATFORM_NAV, type NavItem } from "@/lib/navigation";
import { isCompanyAdmin } from "@/server/guards";
import { listCompanyOptions } from "@/server/services/companies";
import { Shell } from "@/components/shell";
import { ROLE_LABEL } from "@/lib/features";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage();
  // Guarda central de rotas (redirecionamento HTTP antes de qualquer conteúdo ser enviado)
  const path = (await headers()).get("x-mv-path") ?? "";
  const rule = ruleFor(path);
  if (rule) {
    if (rule.platformOnly && !ctx.user.isPlatformAdmin) redirect("/acesso-negado");
    if (rule.needsCompany && !ctx.company) redirect(ctx.user.isPlatformAdmin ? "/admin/empresas?selecione=1" : "/login");
    if (rule.anyOf.length && !rule.anyOf.some((f) => ctx.features.includes(f))) redirect("/acesso-negado");
    if (rule.adminOnly && !isCompanyAdmin(ctx)) redirect("/acesso-negado");
  }
  // Menu gerado a partir das permissões efetivas calculadas no servidor
  const visible = (i: NavItem) =>
    (i.anyOf.length === 0 || i.anyOf.some((f) => ctx.features.includes(f))) && (!i.adminOnly || isCompanyAdmin(ctx));
  const main = ctx.company ? MAIN_NAV.filter(visible) : MAIN_NAV.filter((i) => i.href === "/configuracoes");
  const platform = ctx.user.isPlatformAdmin ? PLATFORM_NAV : [];
  const companies = ctx.user.isPlatformAdmin ? await listCompanyOptions(ctx) : [];
  return (
    <Shell
      main={main.map(({ href, label, icon, phase }) => ({ href, label, icon, phase }))}
      platform={platform.map(({ href, label, icon }) => ({ href, label, icon }))}
      user={{ name: ctx.user.name, username: ctx.user.username, role: ROLE_LABEL[ctx.role] }}
      company={ctx.company}
      companies={companies}
      isPlatformAdmin={ctx.user.isPlatformAdmin}
    >
      {children}
    </Shell>
  );
}
