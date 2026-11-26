import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/next";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; expirada?: string }> }) {
  if (await getAuth()) redirect("/");
  const sp = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-light lg:flex lg:flex-col lg:justify-between lg:p-14">
        <Logo />
        <div className="max-w-lg">
          <h1 className="text-[40px] font-extrabold leading-[1.1] tracking-tight text-ink">
            Da prospecção à venda, <span className="text-brand">em um único fluxo.</span>
          </h1>
          <p className="mt-5 text-[18px] leading-relaxed text-muted">
            Encontre empresas, organize contatos, dispare campanhas no WhatsApp, atenda com IA e acompanhe cada negociação até o fechamento.
          </p>
          <ol className="mt-9 grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] font-semibold text-ink">
            {["Prospecção", "Campanhas", "WhatsApp + IA", "CRM e vendas"].map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-[13px] text-white">{i + 1}</span>{s}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-[14px] text-muted">© {new Date().getFullYear()} Marktvision</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Logo /></div>
          <h2 className="text-[30px] font-bold tracking-tight">Entrar</h2>
          <p className="mt-1.5 text-[16px] text-muted">Acesse com o login e a senha fornecidos pelo administrador.</p>
          {sp.expirada && <p className="mt-5 rounded-lg bg-warning-light px-4 py-3 text-[15px] font-medium text-warning">Sua sessão terminou. Entre novamente.</p>}
          <LoginForm next={sp.next} />
        </div>
      </section>
    </main>
  );
}
