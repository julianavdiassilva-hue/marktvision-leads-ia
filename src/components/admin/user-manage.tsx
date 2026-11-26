"use client";
import { ActionForm, Field, SubmitButton, ToggleSwitch } from "@/components/forms";
import { Badge, Panel } from "@/components/ui";
import { resetPasswordAction, setUserFeatureAction, updateUserAction } from "@/app/actions/users";
import type { Role } from "@/lib/features";

type Perm = { key: string; name: string; companyHas: boolean; roleDefault: boolean; override: boolean | null; effective: boolean };

export function UserManage({ user, isSelf }: {
  user: { id: string; name: string; username: string; role: Role; is_platform_admin: boolean; permissions: Perm[] }; isSelf: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Dados de acesso">
          <ActionForm action={updateUserAction.bind(null, user.id)} resetOnSuccess={false}>
            <div className="space-y-4">
              <Field label="Nome" name="name"><input name="name" className="input" defaultValue={user.name} /></Field>
              <Field label="Login" name="username"><input name="username" className="input" defaultValue={user.username} autoCapitalize="none" /></Field>
              {!user.is_platform_admin && (
                <Field label="Tipo de acesso" name="role" hint={isSelf ? "Você não pode alterar o seu próprio perfil." : undefined}>
                  <select name="role" className="input" defaultValue={user.role} disabled={isSelf}>
                    <option value="seller">Vendedor</option><option value="company_admin">Administrador da empresa</option>
                  </select>
                </Field>
              )}
            </div>
            <div className="mt-5 flex justify-end"><SubmitButton>Salvar</SubmitButton></div>
          </ActionForm>
        </Panel>
        <Panel title="Redefinir senha" description="Encerra as sessões abertas deste usuário.">
          <ActionForm action={resetPasswordAction.bind(null, user.id)}>
            <Field label="Nova senha" name="password" hint="Mínimo de 8 caracteres"><input name="password" type="text" className="input" autoComplete="new-password" /></Field>
            <div className="mt-5 flex justify-end"><SubmitButton>Redefinir senha</SubmitButton></div>
          </ActionForm>
        </Panel>
      </div>
      {!user.is_platform_admin && (
        <Panel title="Permissões individuais" description="Ajuste o que este usuário pode acessar. Nunca ultrapassa o que a empresa contratou." padded={false}>
          <ul className="grid gap-x-8 px-5 sm:grid-cols-2">
            {user.permissions.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <div>
                  <p className="text-[15px] font-semibold">{p.name}</p>
                  <p className="text-[13px] text-muted">
                    {!p.companyHas ? "Não contratada pela empresa" : p.override === null ? (p.roleDefault ? "Padrão do perfil" : "Fora do padrão do perfil")
                      : <Badge tone="amber">{p.override ? "Concedida individualmente" : "Retirada individualmente"}</Badge>}
                  </p>
                </div>
                <ToggleSwitch label={p.name} checked={p.effective} disabled={!p.companyHas || (isSelf && p.effective)} onToggle={(v) => setUserFeatureAction(user.id, p.key, v)} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
