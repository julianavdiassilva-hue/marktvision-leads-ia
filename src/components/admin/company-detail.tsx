"use client";
import { useTransition, useState } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { ActionButton, ActionForm, Field, SubmitButton, ToggleSwitch } from "@/components/forms";
import { Badge } from "@/components/ui";
import {
  resetCompanyFeaturesAction, setCompanyActiveAction, setCompanyFeatureAction, setCompanyLimitsAction, updateCompanyAction,
} from "@/app/actions/admin";
import { switchCompanyAction } from "@/app/actions/auth";
import { LIMIT_FIELDS, type Limits } from "@/lib/features";

type Company = {
  id: string; name: string; legal_name: string | null; document: string | null; phone: string | null; email: string | null;
  segment: string | null; address: string | null; notes: string | null; plan_id: string | null; is_active: boolean; limits_override: Limits;
};

export function EnterCompanyButton({ companyId }: { companyId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await switchCompanyAction(companyId);
        if (!r.ok) setError(r.error); else window.location.assign("/dashboard");
      })}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}Entrar no ambiente</button>
      {error && <span className="mt-1 text-[13px] text-danger">{error}</span>}
    </span>
  );
}

export function CompanyActiveButton({ id, active }: { id: string; active: boolean }) {
  return active
    ? <ActionButton size="md" variant="danger" action={() => setCompanyActiveAction(id, false)} confirm="Desativar esta empresa? Todos os usuários dela perderão o acesso imediatamente.">Desativar empresa</ActionButton>
    : <ActionButton size="md" variant="secondary" action={() => setCompanyActiveAction(id, true)}>Reativar empresa</ActionButton>;
}

export function CompanyEditForm({ company, plans }: { company: Company; plans: { id: string; name: string }[] }) {
  return (
    <ActionForm action={updateCompanyAction.bind(null, company.id)} resetOnSuccess={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da empresa" name="name"><input id="name" name="name" className="input" defaultValue={company.name} /></Field>
        <Field label="Plano" name="planId">
          <select name="planId" className="input" defaultValue={company.plan_id ?? ""}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="">Sem plano</option>
          </select>
        </Field>
        <Field label="Razão social" name="legalName" optional><input name="legalName" className="input" defaultValue={company.legal_name ?? ""} /></Field>
        <Field label="CNPJ" name="document" optional><input name="document" className="input" defaultValue={company.document ?? ""} /></Field>
        <Field label="Telefone" name="phone" optional><input name="phone" className="input" defaultValue={company.phone ?? ""} /></Field>
        <Field label="E-mail" name="email" optional><input name="email" className="input" defaultValue={company.email ?? ""} /></Field>
        <Field label="Segmento" name="segment" optional><input name="segment" className="input" defaultValue={company.segment ?? ""} /></Field>
        <Field label="Endereço" name="address" optional><input name="address" className="input" defaultValue={company.address ?? ""} /></Field>
        <Field label="Observações internas" name="notes" optional className="sm:col-span-2"><textarea name="notes" rows={2} className="input" defaultValue={company.notes ?? ""} /></Field>
      </div>
      <div className="mt-5 flex justify-end"><SubmitButton>Salvar dados</SubmitButton></div>
    </ActionForm>
  );
}

export function CompanyFeatures({ companyId, features }: {
  companyId: string; features: { key: string; name: string; inPlan: boolean; override: boolean | null; enabled: boolean }[];
}) {
  const hasOverrides = features.some((f) => f.override !== null);
  return (
    <div>
      <ul className="grid gap-x-8 sm:grid-cols-2">
        {features.map((f) => (
          <li key={f.key} className="flex items-center justify-between gap-3 border-b border-line py-3">
            <div>
              <p className="text-[15px] font-semibold">{f.name}</p>
              <p className="text-[13px] text-muted">
                {f.override === null ? (f.inPlan ? "Incluída no plano" : "Fora do plano") : <Badge tone="amber">{f.override ? "Liberada individualmente" : "Bloqueada individualmente"}</Badge>}
              </p>
            </div>
            <ToggleSwitch label={f.name} checked={f.enabled} onToggle={(v) => setCompanyFeatureAction(companyId, f.key, v)} />
          </li>
        ))}
      </ul>
      {hasOverrides && (
        <div className="mt-4 flex justify-end">
          <ActionButton action={() => resetCompanyFeaturesAction(companyId)} confirm="Remover todas as exceções e voltar a seguir somente o plano?">Restaurar padrão do plano</ActionButton>
        </div>
      )}
    </div>
  );
}

export function CompanyLimitsForm({ companyId, override, effective, usage }: {
  companyId: string; override: Limits; effective: Limits; usage: Record<string, number>;
}) {
  return (
    <ActionForm action={setCompanyLimitsAction.bind(null, companyId)} resetOnSuccess={false}>
      <p className="mb-4 text-[14px] text-muted">Deixe em branco para seguir o limite do plano. Sem limite no plano = ilimitado.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LIMIT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} name={f.key}
            hint={`Em uso: ${usage[f.key] ?? 0} · Vigente: ${effective[f.key] ?? "ilimitado"}`}>
            <input name={f.key} inputMode="numeric" className="input" defaultValue={override[f.key] ?? ""} placeholder="Plano" />
          </Field>
        ))}
      </div>
      <div className="mt-5 flex justify-end"><SubmitButton>Salvar limites</SubmitButton></div>
    </ActionForm>
  );
}
