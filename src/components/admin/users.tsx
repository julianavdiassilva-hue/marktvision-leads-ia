"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { ActionForm, Field, Modal, SubmitButton, ToggleSwitch } from "@/components/forms";
import { Badge, Empty } from "@/components/ui";
import { createUserAction, setUserActiveAction } from "@/app/actions/users";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/features";

export function UserCreateButton({ companies, fixedCompanyId, allowPlatformAdmin, label = "Novo acesso" }: {
  companies?: { id: string; name: string }[]; fixedCompanyId?: string; allowPlatformAdmin?: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("seller");
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="h-5 w-5" />{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={label} description="Somente nome, login, senha e tipo de acesso.">
        <ActionForm action={createUserAction} onSuccess={() => setOpen(false)}>
          <div className="space-y-4">
            <Field label="Nome" name="name"><input id="name" name="name" className="input" autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Login" name="username" hint="Ex.: maria.vendas"><input id="username" name="username" className="input" autoCapitalize="none" autoComplete="off" /></Field>
              <Field label="Senha" name="password" hint="Mínimo de 8 caracteres"><input id="password" name="password" type="text" className="input" autoComplete="new-password" /></Field>
            </div>
            <Field label="Tipo de acesso" name="role">
              <select id="role" name="role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="seller">Vendedor</option>
                <option value="company_admin">Administrador da empresa</option>
                {allowPlatformAdmin && <option value="platform_admin">Administrador geral (Marktvision)</option>}
              </select>
            </Field>
            {fixedCompanyId ? <input type="hidden" name="companyId" value={fixedCompanyId} /> : companies && role !== "platform_admin" && (
              <Field label="Empresa" name="companyId">
                <select id="companyId" name="companyId" className="input" defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-2.5">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
            <SubmitButton pendingText="Criando...">Criar acesso</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export type UserListRow = {
  id: string; name: string; username: string; role: Role; company_name: string | null;
  is_active: boolean; membership_active: boolean | null; last_login_at: string | null;
};

export function UsersTable({ users, basePath, showCompany, currentUserId, platformView }: {
  users: UserListRow[]; basePath: string; showCompany?: boolean; currentUserId: string; platformView?: boolean;
}) {
  if (users.length === 0) return <Empty title="Nenhum usuário" description="Crie o primeiro acesso informando nome, login e senha." />;
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[760px]">
        <thead><tr><th>Nome</th><th>Login</th><th>Tipo de acesso</th>{showCompany && <th>Empresa</th>}<th>Último acesso</th><th className="text-right">Ativo</th></tr></thead>
        <tbody>
          {users.map((u) => {
            const active = u.is_active && u.membership_active !== false;
            return (
              <tr key={`${u.id}-${u.company_name}`}>
                <td><Link className="font-semibold hover:text-brand" href={`${basePath}/${u.id}`}>{u.name}</Link></td>
                <td className="font-mono text-[14px] text-muted">{u.username}</td>
                <td><Badge tone={u.role === "seller" ? "gray" : u.role === "platform_admin" ? "blue" : "green"}>{ROLE_LABEL[u.role]}</Badge></td>
                {showCompany && <td>{u.company_name ?? <span className="text-muted">—</span>}</td>}
                <td className="text-[14px] text-muted">{u.last_login_at ? fmtDateTime(u.last_login_at) : "Nunca acessou"}</td>
                <td className="text-right">
                  {u.id === currentUserId ? <span className="text-[13px] text-muted">Você</span> :
                    <ToggleSwitch label={`Ativar ${u.name}`} checked={platformView ? u.is_active : active} onToggle={(v) => setUserActiveAction(u.id, v)} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
