import clsx from "clsx";
import Link from "next/link";
import type { AuthContext } from "@/server/auth/core";

type Key = "contatos" | "listas" | "importar" | "google";

export function ContactsTabs({ active, ctx }: { active: Key; ctx: AuthContext }) {
  const f = (k: string) => ctx.features.includes(k as never);
  const tabs = [
    f("contacts") && { key: "contatos", href: "/contatos", label: "Contatos" },
    f("contact_lists") && { key: "listas", href: "/contatos/listas", label: "Listas" },
    f("spreadsheet_import") && { key: "importar", href: "/contatos/importar", label: "Importar planilha" },
    f("google_search") && { key: "google", href: "/contatos/google", label: "Pesquisar empresas" },
  ].filter(Boolean) as { key: Key; href: string; label: string }[];
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={clsx("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[15.5px] font-semibold",
          active === t.key ? "border-brand text-brand-dark" : "border-transparent text-muted hover:text-ink")}>{t.label}</Link>
      ))}
    </nav>
  );
}
