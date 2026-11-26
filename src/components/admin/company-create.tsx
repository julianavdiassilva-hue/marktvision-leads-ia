"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { ActionForm, Field, Modal, SubmitButton } from "@/components/forms";
import { createCompanyAction } from "@/app/actions/admin";

type Row = { key: number };

export function CompanyCreateButton({ plans }: { plans: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const router = useRouter();
  const close = () => { setOpen(false); setRows([]); setDetails(false); };
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="h-5 w-5" />Nova empresa</button>
      <Modal open={open} onClose={close} wide title="Nova empresa" description="Apenas o nome é obrigatório. Os demais dados e acessos podem ser adicionados agora ou depois.">
        <ActionForm action={createCompanyAction} onSuccess={(r) => { close(); const id = (r as { data?: { id: string } }).data?.id; if (id) router.push(`/admin/empresas/${id}?criada=1`); }}>
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <Field label="Nome da empresa" name="name">
              <input id="name" name="name" className="input" autoFocus placeholder="Ex.: Clínica Sorriso Belém" />
            </Field>
            <Field label="Plano" name="planId">
              <select id="planId" name="planId" className="input" defaultValue={plans[0]?.id ?? ""}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="">Sem plano (liberar manualmente)</option>
              </select>
            </Field>
          </div>

          <button type="button" onClick={() => setDetails(!details)} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-dark">
            <ChevronDown className={`h-4 w-4 transition ${details ? "rotate-180" : ""}`} /> Dados complementares (opcional)
          </button>
          <div className={details ? "mt-3 grid gap-4 sm:grid-cols-2" : "hidden"}>
            <Field label="Razão social" name="legalName" optional><input name="legalName" className="input" /></Field>
            <Field label="CNPJ" name="document" optional><input name="document" className="input" /></Field>
            <Field label="Telefone" name="phone" optional><input name="phone" className="input" /></Field>
            <Field label="E-mail" name="email" optional><input name="email" className="input" /></Field>
            <Field label="Segmento" name="segment" optional><input name="segment" className="input" /></Field>
            <Field label="Endereço" name="address" optional><input name="address" className="input" /></Field>
          </div>

          <div className="mt-6 rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[16px] font-bold">Acessos da empresa <span className="font-normal text-muted">(opcional)</span></p>
                <p className="text-[14px] text-muted">Administrador e vendedores: nome, login, senha e tipo de acesso.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows([...rows, { key: Date.now() }])}><Plus className="h-4 w-4" />Adicionar acesso</button>
            </div>
            {rows.map((r, i) => (
              <div key={r.key} className="mt-3 grid gap-2.5 rounded-lg border border-line bg-white p-3 sm:grid-cols-[1.2fr_1fr_1fr_1.25fr_auto] sm:items-end">
                <div><label className="label text-[13px]">Nome</label><input name={`users[${i}][name]`} className="input" /></div>
                <div><label className="label text-[13px]">Login</label><input name={`users[${i}][username]`} className="input" autoCapitalize="none" /></div>
                <div><label className="label text-[13px]">Senha</label><input name={`users[${i}][password]`} className="input" type="text" placeholder="mín. 8 caracteres" /></div>
                <div><label className="label text-[13px]">Tipo de acesso</label>
                  <select name={`users[${i}][role]`} className="input" defaultValue={i === 0 ? "company_admin" : "seller"}>
                    <option value="company_admin">Administrador</option><option value="seller">Vendedor</option>
                  </select>
                </div>
                <button type="button" aria-label="Remover acesso" className="btn btn-ghost btn-sm text-danger" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end gap-2.5">
            <button type="button" className="btn btn-secondary" onClick={close}>Cancelar</button>
            <SubmitButton pendingText="Cadastrando...">Cadastrar empresa</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}
