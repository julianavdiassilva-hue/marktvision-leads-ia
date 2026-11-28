"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Activity, BarChart3, BookOpen, Bot, Building2, KanbanSquare, LayoutDashboard, LogOut, Megaphone, Menu,
  MessageCircle, MessagesSquare, Palette, Settings, ShieldCheck, Tags, UserCog, UserRound, Users, X, Loader2,
} from "lucide-react";
import { BrandLogo, isPlatformPanel, type BrandView } from "./brand";
import { logoutAction, switchCompanyAction } from "@/app/actions/auth";

const ICONS = { Activity, BarChart3, BookOpen, Bot, Building2, KanbanSquare, LayoutDashboard, Megaphone, MessageCircle, MessagesSquare, Palette, Settings, ShieldCheck, Tags, UserCog, UserRound, Users };
type Item = { href: string; label: string; icon: string; phase?: number; badge?: number };

export function Shell({ main, platform, user, company, companies, isPlatformAdmin, brand = null, children }: {
  main: Item[]; platform: Item[]; user: { name: string; username: string; role: string };
  company: { id: string; name: string } | null; companies: { id: string; name: string; is_active: boolean }[];
  isPlatformAdmin: boolean; brand?: BrandView; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  if (isPlatformPanel(pathname)) brand = null; // painel do administrador geral: sempre Marktvision
  const nav = (
    <nav className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-6"><BrandLogo brand={brand} /></div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {main.length > 0 && <NavGroup items={main} pathname={pathname} onNavigate={() => setOpen(false)} />}
        {platform.length > 0 && (
          <div>
            <p className="mb-2 px-3 text-[12px] font-bold uppercase tracking-[0.12em] text-sidebar-muted">Plataforma Marktvision</p>
            <NavGroup items={platform} pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        )}
      </div>
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sidebar-active text-[15px] font-bold text-sidebar-active-ink">
            {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-sidebar-ink">{user.name}</p>
            <p className="truncate text-[13px] text-sidebar-muted">{user.role}</p>
          </div>
          <form action={logoutAction}>
            <button className="rounded-lg p-2 text-sidebar-muted hover:bg-sidebar-hover hover:text-danger" title="Sair" aria-label="Sair"><LogOut className="h-5 w-5" /></button>
          </form>
        </div>
      </div>
    </nav>
  );
  return (
    <div className="min-h-screen bg-page">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-line bg-sidebar lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-sidebar shadow-xl">
            <button className="absolute right-3 top-5 rounded-lg p-1.5 text-sidebar-muted" onClick={() => setOpen(false)} aria-label="Fechar menu"><X className="h-5 w-5" /></button>
            {nav}
          </aside>
        </div>
      )}
      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-page/90 px-4 backdrop-blur sm:px-8">
          <button className="rounded-lg p-2 text-ink lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu className="h-6 w-6" /></button>
          {isPlatformAdmin ? <CompanySwitcher company={company} companies={companies} /> : (
            <p className="text-[15px] text-muted">Empresa: <span className="font-semibold text-ink">{brand?.name ?? company?.name}</span></p>
          )}
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

function NavGroup({ items, pathname, onNavigate }: { items: Item[]; pathname: string; onNavigate: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((it) => {
        const Icon = ICONS[it.icon as keyof typeof ICONS] ?? LayoutDashboard;
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <li key={it.href}>
            <Link href={it.href} onClick={onNavigate}
              className={clsx("group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15.5px] font-medium transition",
                active ? "bg-sidebar-active font-semibold text-sidebar-active-ink" : "text-sidebar-ink/85 hover:bg-sidebar-hover hover:text-sidebar-ink")}>
              <Icon className={clsx("h-[19px] w-[19px] shrink-0", active ? "text-sidebar-icon" : "text-sidebar-muted group-hover:text-sidebar-icon")} strokeWidth={2} />
              <span className="flex-1 truncate">{it.label}</span>
              {it.badge ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[12px] font-bold text-white" aria-label={`${it.badge} não lidas`}>{it.badge > 99 ? "99+" : it.badge}</span> : null}
              {it.phase && <span className="rounded bg-white px-1.5 text-[11px] font-semibold text-muted ring-1 ring-line" title={`Disponível na Fase ${it.phase}`}>F{it.phase}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function CompanySwitcher({ company, companies }: { company: { id: string; name: string } | null; companies: { id: string; name: string; is_active: boolean }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <label htmlFor="company-switch" className="hidden text-[14px] font-medium text-muted sm:block">Ambiente:</label>
      <select id="company-switch" className="input max-w-[320px] py-2" value={company?.id ?? ""} disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            const r = await switchCompanyAction(id || null);
            if (!r.ok) setError(r.error);
            else window.location.assign(id ? "/dashboard" : "/admin/empresas");
          });
        }}>
        <option value="">Plataforma (todas as empresas)</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (inativa)"}</option>)}
      </select>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
      {error && <span className="text-[13px] text-danger">{error}</span>}
    </div>
  );
}
