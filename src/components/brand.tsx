"use client";
import { usePathname } from "next/navigation";
import { cssOf, themeVars, type ThemeColors } from "@/lib/theme";
import { Logo } from "./logo";

/** O painel do administrador geral (/admin) sempre usa a identidade Marktvision. */
export const isPlatformPanel = (path: string | null) => !!path && (path === "/admin" || path.startsWith("/admin/"));

/** Aplica a identidade visual da empresa via variáveis CSS (sem marca = padrão Marktvision, nada é emitido). */
export function BrandStyle({ colors, always }: { colors: ThemeColors | null; always?: boolean }) {
  const path = usePathname();
  if (!colors || (!always && isPlatformPanel(path))) return null;
  return <style data-mv-brand>{`:root{${cssOf(themeVars(colors))}}`}</style>;
}

export type BrandView = { name: string; logoUrl: string | null } | null;

/** Logomarca da empresa (ou a da Marktvision quando não personalizada). */
export function BrandLogo({ brand, size = "md" }: { brand: BrandView; size?: "md" | "lg" }) {
  if (!brand) return <Logo />;
  if (brand.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={brand.logoUrl} alt={brand.name} data-testid="brand-logo"
        className={size === "lg" ? "max-h-20 w-auto max-w-[260px] object-contain" : "max-h-12 w-auto max-w-[200px] object-contain"} />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2.5" data-testid="brand-name">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand text-[17px] font-extrabold text-white">{brand.name.trim()[0]?.toUpperCase()}</span>
      <p className={size === "lg" ? "text-[22px] font-extrabold tracking-tight text-ink" : "truncate text-[17px] font-extrabold tracking-tight text-sidebar-ink"}>{brand.name}</p>
    </div>
  );
}
