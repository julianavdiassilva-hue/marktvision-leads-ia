"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { ActionButton, ActionForm, Field, Modal, SubmitButton, ToggleSwitch } from "@/components/forms";
import { Badge, Panel } from "@/components/ui";
import { createPlanAction, deletePlanAction, setPlanFeatureAction, updatePlanAction } from "@/app/actions/admin";
import { FEATURES, LIMIT_FIELDS, type Limits } from "@/lib/features";

type Plan = { id: string; name: string; description: string | null; is_active: boolean; limits: Limits; features: string[]; companies: number };

export function PlanCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="h-5 w-5" />Novo plano</button>
      <Modal open={open} onClose={() => setOpen(false)} wide title="Novo plano" description="Escolha as funcionalidades incluídas. Limites em branco = ilimitado.">
        <ActionForm action={createPlanAction} onSuccess={() => setOpen(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do plano" name="name"><input name="name" className="input" autoFocus /></Field>
            <Field label="Descrição" name="description" optional><input name="description" className="input" /></Field>
          </div>
          <p className="label mt-5">Funcionalidades</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <label key={f.key} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-[15px] hover:bg-brand-50">
                <input type="checkbox" name="features" value={f.key} className="h-4 w-4 accent-brand" />{f.name}
              </label>
            ))}
          </div>
          <p className="label mt-5">Limites</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {LIMIT_FIELDS.map((f) => <Field key={f.key} label={f.label} name={f.key}><input name={f.key} inputMode="numeric" className="input" placeholder="Ilimitado" /></Field>)}
          </div>
          <div className="mt-6 flex justify-end gap-2.5">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
            <SubmitButton>Criar plano</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function PlanCard({ plan }: { plan: Plan }) {
  const [editing, setEditing] = useState(false);
  return (
    <Panel
      title={plan.name}
      description={<>{plan.description ?? "Sem descrição"} · {plan.features.length} funcionalidades · {plan.companies} empresa(s){!plan.is_active && <> · <Badge tone="gray">Inativo</Badge></>}</>}
      actions={<div className="flex gap-2">
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(!editing)}>{editing ? "Fechar edição" : "Editar nome e limites"}</button>
        {plan.companies === 0 && <ActionButton variant="danger" action={() => deletePlanAction(plan.id)} confirm={`Excluir o plano "${plan.name}"?`}>Excluir</ActionButton>}
      </div>}>
      {editing && (
        <ActionForm action={updatePlanAction.bind(null, plan.id)} resetOnSuccess={false} className="mb-5 rounded-xl border border-line bg-surface p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" name="name"><input name="name" className="input" defaultValue={plan.name} /></Field>
            <Field label="Descrição" name="description" optional><input name="description" className="input" defaultValue={plan.description ?? ""} /></Field>
            {LIMIT_FIELDS.map((f) => <Field key={f.key} label={f.label} name={f.key}><input name={f.key} inputMode="numeric" className="input" defaultValue={plan.limits[f.key] ?? ""} placeholder="Ilimitado" /></Field>)}
            <label className="flex items-center gap-2.5 text-[15px] font-medium"><input type="checkbox" name="isActive" defaultChecked={plan.is_active} className="h-4 w-4 accent-brand" />Plano disponível para novas empresas</label>
          </div>
          <div className="mt-4 flex justify-end"><SubmitButton>Salvar plano</SubmitButton></div>
        </ActionForm>
      )}
      <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
        {FEATURES.map((f) => (
          <li key={f.key} className="flex items-center justify-between gap-3 border-b border-line py-2.5">
            <span className="text-[15px]">{f.name}</span>
            <ToggleSwitch label={`${f.name} no plano ${plan.name}`} checked={plan.features.includes(f.key)} onToggle={(v) => setPlanFeatureAction(plan.id, f.key, v)} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
