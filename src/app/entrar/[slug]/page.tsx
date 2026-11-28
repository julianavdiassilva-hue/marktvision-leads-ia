import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuth } from "@/server/auth/next";
import { publicBrandBySlug } from "@/server/services/branding";
import { BrandLogo, BrandStyle } from "@/components/brand";
import { LoginForm } from "@/app/login/login-form";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string; expirada?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await publicBrandBySlug((await params).slug).catch(() => null);
  const name = b ? b.displayName ?? b.companyName : "Entrar";
  return { title: { absolute: `Entrar · ${name}` } };
}

/** Tela de login com a identidade visual da empresa (endereço próprio: /entrar/<empresa>). */
export default async function CompanyLogin({ params, searchParams }: Props) {
  if (await getAuth()) redirect("/");
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const b = await publicBrandBySlug(slug).catch(() => null);
  if (!b || !b.active) notFound();
  const name = b.displayName ?? b.companyName;
  const view = b.customized ? { name, logoUrl: b.logoUrl } : null; // sem personalização: identidade Marktvision
  return (
    <main className="grid min-h-screen bg-page lg:grid-cols-[1.05fr_1fr]">
      <BrandStyle colors={b.customized ? b.colors : null} always />
      <section className="relative hidden overflow-hidden bg-brand-light lg:flex lg:flex-col lg:justify-between lg:p-14">
        <BrandLogo brand={view} size="lg" />
        <div className="max-w-lg">
          <h1 className="text-[40px] font-extrabold leading-[1.1] tracking-tight text-ink">
            Bem-vindo ao ambiente comercial <span className="text-brand-dark">{name}</span>.
          </h1>
          <p className="mt-5 text-[18px] leading-relaxed text-muted">Campanhas, contatos, conversas do WhatsApp e negociações da equipe em um só lugar.</p>
        </div>
        <p className="text-[14px] text-muted">© {new Date().getFullYear()} {name}</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><BrandLogo brand={view} size="lg" /></div>
          <h2 className="text-[30px] font-bold tracking-tight">Entrar</h2>
          <p className="mt-1.5 text-[16px] text-muted">Acesse com o login e a senha fornecidos pelo administrador de {name}.</p>
          {sp.expirada && <p className="mt-5 rounded-lg bg-warning-light px-4 py-3 text-[15px] font-medium text-warning">Sua sessão terminou. Entre novamente.</p>}
          <LoginForm next={sp.next} />
        </div>
      </section>
    </main>
  );
}
