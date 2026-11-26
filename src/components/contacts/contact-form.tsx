"use client";
import { Field } from "@/components/forms";
import { STATUS_LABEL } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";

type C = Partial<Record<string, unknown>>;
const v = (c: C | undefined, k: string) => (c?.[k] == null ? "" : String(c[k]));

/** Campos do contato — todos opcionais, exceto pelo menos um identificador. */
export function ContactFields({ c }: { c?: C }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome" name="name"><input id="name" name="name" className="input" defaultValue={v(c, "name")} /></Field>
      <Field label="Empresa do contato" name="organization"><input name="organization" className="input" defaultValue={v(c, "organization")} /></Field>
      <Field label="Telefone" name="phone" hint="Com DDD. Ex.: (91) 98888-7777"><input id="phone" name="phone" className="input" inputMode="tel" defaultValue={formatPhone(v(c, "phone_e164"))} /></Field>
      <Field label="WhatsApp" name="whatsapp" hint="Somente se for diferente do telefone"><input name="whatsapp" className="input" inputMode="tel" defaultValue={formatPhone(v(c, "whatsapp_e164"))} /></Field>
      <Field label="E-mail" name="email"><input name="email" type="email" className="input" defaultValue={v(c, "email")} /></Field>
      <Field label="Situação comercial" name="commercialStatus">
        <select name="commercialStatus" className="input" defaultValue={v(c, "commercial_status") || "new"}>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Cidade" name="city"><input name="city" className="input" defaultValue={v(c, "city")} /></Field>
      <div className="grid grid-cols-[90px_1fr] gap-3">
        <Field label="UF" name="state"><input name="state" className="input" maxLength={2} defaultValue={v(c, "state")} /></Field>
        <Field label="Bairro" name="neighborhood"><input name="neighborhood" className="input" defaultValue={v(c, "neighborhood")} /></Field>
      </div>
      <Field label="Endereço" name="address"><input name="address" className="input" defaultValue={v(c, "address")} /></Field>
      <Field label="Site" name="website"><input name="website" className="input" defaultValue={v(c, "website")} /></Field>
      <Field label="Categoria / segmento" name="category"><input name="category" className="input" defaultValue={v(c, "category")} /></Field>
      <Field label="Observações" name="notes" className="sm:col-span-2"><textarea name="notes" rows={3} className="input" defaultValue={v(c, "notes")} /></Field>
    </div>
  );
}
