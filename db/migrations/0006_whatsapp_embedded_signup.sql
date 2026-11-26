-- Fase 05 — Conexão pelo próprio cliente (Embedded Signup) e Coexistência com o WhatsApp Business app
alter table contacts add column if not exists wa_user_id text;           -- BSUID: identificador do usuário no WhatsApp (pode vir sem telefone)
create unique index if not exists contacts_wa_user_uq on contacts (company_id, wa_user_id) where wa_user_id is not null;

alter table whatsapp_connections add column if not exists connection_mode text not null default 'cloud_api'
  check (connection_mode in ('cloud_api','coexistence','manual'));
alter table whatsapp_connections add column if not exists business_id text;
alter table whatsapp_connections add column if not exists register_pin_encrypted text;
alter table whatsapp_connections add column if not exists onboarding jsonb not null default '{}'::jsonb;  -- sincronizações e eventos de onboarding

-- origem da mensagem: API (plataforma), app do celular (coexistência) ou histórico importado
alter table messages add column if not exists channel text not null default 'api' check (channel in ('api','business_app','history'));

-- vendedores responsáveis por cada número
create table if not exists whatsapp_connection_members (
  company_id     uuid not null references companies(id) on delete cascade,
  connection_id  uuid not null references whatsapp_connections(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (connection_id, user_id)
);
alter table whatsapp_connection_members enable row level security;
alter table whatsapp_connection_members force row level security;
create policy tenant_isolation on whatsapp_connection_members
  using (app_bypass() or company_id = app_company_id()) with check (app_bypass() or company_id = app_company_id());
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'mv_app') then
    execute 'grant select, insert, update, delete on whatsapp_connection_members to mv_app';
  end if;
end $$;
