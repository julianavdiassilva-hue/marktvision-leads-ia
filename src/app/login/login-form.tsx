"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/forms";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, null);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="mt-8 space-y-5">
      {state && !state.ok && <div role="alert" className="rounded-lg border border-danger/25 bg-danger-light px-4 py-3 text-[15px] font-medium text-danger">{state.error}</div>}
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="username" className="label">Login</label>
        <input id="username" name="username" className="input py-3 text-[16px]" autoComplete="username" autoCapitalize="none" autoFocus required />
      </div>
      <div>
        <label htmlFor="password" className="label">Senha</label>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} className="input py-3 pr-12 text-[16px]" autoComplete="current-password" required />
          <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted hover:text-ink" aria-label={show ? "Ocultar senha" : "Mostrar senha"}>
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>
      <SubmitButton className="w-full py-3 text-[16px]" pendingText="Entrando...">Entrar</SubmitButton>
    </form>
  );
}
