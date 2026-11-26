"use client";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { changeOwnPasswordAction } from "@/app/actions/auth";
import { updateOwnCompanyAction } from "@/app/actions/admin";

export function ChangePasswordForm() {
  return (
    <ActionForm action={changeOwnPasswordAction}>
      <div className="space-y-4">
        <Field label="Senha atual" name="current"><input name="current" type="password" className="input" autoComplete="current-password" /></Field>
        <Field label="Nova senha" name="password" hint="Mínimo de 8 caracteres"><input name="next" type="password" className="input" autoComplete="new-password" /></Field>
        <Field label="Confirmar nova senha" name="confirm"><input name="confirm" type="password" className="input" autoComplete="new-password" /></Field>
      </div>
      <div className="mt-5 flex justify-end"><SubmitButton>Alterar senha</SubmitButton></div>
    </ActionForm>
  );
}

export function CompanyProfileForm({ c }: { c: Record<string, string | null> }) {
  return (
    <ActionForm action={updateOwnCompanyAction} resetOnSuccess={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da empresa" name="name"><input name="name" className="input" defaultValue={c.name ?? ""} /></Field>
        <Field label="Razão social" name="legalName" optional><input name="legalName" className="input" defaultValue={c.legal_name ?? ""} /></Field>
        <Field label="CNPJ" name="document" optional><input name="document" className="input" defaultValue={c.document ?? ""} /></Field>
        <Field label="Telefone" name="phone" optional><input name="phone" className="input" defaultValue={c.phone ?? ""} /></Field>
        <Field label="E-mail" name="email" optional><input name="email" className="input" defaultValue={c.email ?? ""} /></Field>
        <Field label="Segmento" name="segment" optional><input name="segment" className="input" defaultValue={c.segment ?? ""} /></Field>
        <Field label="Endereço" name="address" optional className="sm:col-span-2"><input name="address" className="input" defaultValue={c.address ?? ""} /></Field>
      </div>
      <div className="mt-5 flex justify-end"><SubmitButton>Salvar dados da empresa</SubmitButton></div>
    </ActionForm>
  );
}
