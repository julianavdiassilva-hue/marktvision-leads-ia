import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-[16px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

type Tone = "green" | "gray" | "red" | "amber" | "blue";
const tones: Record<Tone, string> = {
  green: "bg-brand-light text-brand-dark",
  gray: "bg-surface text-muted border border-line",
  red: "bg-danger-light text-danger",
  amber: "bg-warning-light text-warning",
  blue: "bg-sky-50 text-sky-800",
};
export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold", tones[tone])}>{children}</span>;
}

export function StatusDot({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? "green" : "gray"}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", active ? "bg-brand" : "bg-muted/60")} />
      {active ? "Ativo" : "Inativo"}
    </Badge>
  );
}

export function Panel({ title, description, actions, children, className, padded = true }: {
  title?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section className={clsx("panel", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-[17px] font-bold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[14px] text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={clsx(padded && "p-5")}>{children}</div>
    </section>
  );
}

export function Empty({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 h-11 w-11 rounded-full bg-brand-light" />
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-[15px] text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "red", children }: { tone?: "red" | "green" | "amber"; children: ReactNode }) {
  const c = { red: "border-danger/25 bg-danger-light text-danger", green: "border-brand/25 bg-brand-light text-brand-dark", amber: "border-warning/25 bg-warning-light text-warning" }[tone];
  return <div role={tone === "red" ? "alert" : "status"} className={clsx("rounded-lg border px-4 py-3 text-[15px] font-medium", c)}>{children}</div>;
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-[14px] font-medium text-muted">{label}</p>
      <p className="mt-1.5 text-[30px] font-bold leading-none tracking-tight text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-[13px] text-muted">{hint}</p>}
    </>
  );
  return href
    ? <Link href={href} className="block px-5 py-4 transition hover:bg-brand-50">{body}</Link>
    : <div className="px-5 py-4">{body}</div>;
}
