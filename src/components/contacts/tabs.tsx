import clsx from "clsx";
import Link from "next/link";

export function ContactsTabs({ active, showContacts, showLists }: { active: "contatos" | "listas"; showContacts: boolean; showLists: boolean }) {
  const tabs = [
    showContacts && { key: "contatos", href: "/contatos", label: "Contatos" },
    showLists && { key: "listas", href: "/contatos/listas", label: "Listas" },
  ].filter(Boolean) as { key: string; href: string; label: string }[];
  return (
    <nav className="mb-6 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={clsx("-mb-px border-b-2 px-4 py-2.5 text-[15.5px] font-semibold",
          active === t.key ? "border-brand text-brand-dark" : "border-transparent text-muted hover:text-ink")}>{t.label}</Link>
      ))}
    </nav>
  );
}
