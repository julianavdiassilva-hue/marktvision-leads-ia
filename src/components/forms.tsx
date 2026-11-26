"use client";
import clsx from "clsx";
import { createContext, useActionState, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import type { ActionResult } from "@/server/action";

type FormAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Formulário ligado a uma Server Action, com carregamento, erros por campo e mensagem de sucesso. */
export function ActionForm({ action, children, className, onSuccess, resetOnSuccess = true, successMessage }: {
  action: FormAction; children: ReactNode | ((s: { fieldErrors: Record<string, string> }) => ReactNode);
  className?: string; onSuccess?: (r: ActionResult) => void; resetOnSuccess?: boolean; successMessage?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      router.refresh();
      onSuccess?.(state);
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const fieldErrors = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form ref={ref} action={formAction} className={className} noValidate>
      {state && !state.ok && <div role="alert" className="mb-4 rounded-lg border border-danger/25 bg-danger-light px-4 py-3 text-[15px] font-medium text-danger">{state.error}</div>}
      {state?.ok && successMessage !== false && state.message && <div role="status" className="mb-4 rounded-lg border border-brand/25 bg-brand-light px-4 py-3 text-[15px] font-medium text-brand-dark">{state.message}</div>}
      <FieldErrorsContext value={fieldErrors}>{typeof children === "function" ? children({ fieldErrors }) : children}</FieldErrorsContext>
    </form>
  );
}

const FieldErrorsCtx = createContext<Record<string, string>>({});
function FieldErrorsContext({ value, children }: { value: Record<string, string>; children: ReactNode }) {
  return <FieldErrorsCtx.Provider value={value}>{children}</FieldErrorsCtx.Provider>;
}

export function Field({ label, name, hint, optional, children, className }: {
  label: string; name?: string; hint?: ReactNode; optional?: boolean; children: ReactNode; className?: string;
}) {
  const errors = useContext(FieldErrorsCtx);
  const err = name ? errors[name] : undefined;
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label} {optional && <span className="font-normal text-muted">(opcional)</span>}
      </label>
      {children}
      {err ? <p className="mt-1.5 text-[14px] font-medium text-danger">{err}</p> : hint ? <p className="mt-1.5 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({ children, className, variant = "primary", pendingText = "Salvando..." }: {
  children: ReactNode; className?: string; variant?: "primary" | "secondary" | "danger"; pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clsx("btn", `btn-${variant}`, className)}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? pendingText : children}
    </button>
  );
}

/** Interruptor que chama uma Server Action, com estado otimista e reversão em caso de erro. */
export function ToggleSwitch({ checked, onToggle, disabled, label, describedBy }: {
  checked: boolean; onToggle: (next: boolean) => Promise<ActionResult>; disabled?: boolean; label: string; describedBy?: string;
}) {
  const [value, setValue] = useState(checked);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => setValue(checked), [checked]);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button" role="switch" aria-checked={value} aria-label={label} aria-describedby={describedBy}
        disabled={disabled || pending}
        onClick={() => {
          const next = !value;
          setValue(next); setError(null);
          start(async () => {
            const r = await onToggle(next);
            if (!r.ok) { setValue(!next); setError(r.error); } else router.refresh();
          });
        }}
        className={clsx("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50",
          value ? "bg-brand" : "bg-slate-300")}
      >
        <span className={clsx("inline-block h-5 w-5 rounded-full bg-white shadow transition", value ? "translate-x-6" : "translate-x-1")} />
      </button>
      {error && <span role="alert" className="mt-1 max-w-56 text-right text-[13px] font-medium text-danger">{error}</span>}
    </span>
  );
}

/** Botão que executa uma ação (com confirmação opcional) e atualiza a página. */
export function ActionButton({ action, children, confirm, variant = "secondary", size = "sm", className }: {
  action: () => Promise<ActionResult>; children: ReactNode; confirm?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md"; className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col">
      <button type="button" disabled={pending} className={clsx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => { const r = await action(); if (!r.ok) setError(r.error); else router.refresh(); });
        }}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}{children}
      </button>
      {error && <span role="alert" className="mt-1 text-[13px] font-medium text-danger">{error}</span>}
    </span>
  );
}

export function Modal({ open, onClose, title, description, children, wide }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={clsx("w-full rounded-2xl bg-white shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="text-[20px] font-bold text-ink">{title}</h2>
            {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
