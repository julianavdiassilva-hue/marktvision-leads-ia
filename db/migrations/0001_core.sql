-- =====================================================================
-- 0001_core — Núcleo multiempresa: planos, funcionalidades, empresas,
-- usuários, vínculos, permissões, sessões, auditoria e RLS.
-- =====================================================================

create extension if not exists citext;

-- ---------------------------------------------------------------------
-- Funções de contexto (definidas por transação pelo backend)
--   app.company_id      -> empresa ativa
--   app.user_id         -> usuário autenticado
--   app.platform_admin  -> 'on' quando administrador geral Marktvision
--   app.system          -> 'on' para rotinas internas (login, filas, webhooks)
-- ---------------------------------------------------------------------
create or replace function app_company_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.company_id', true), '')::uuid
$$;

create or replace function app_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app_bypass() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.platform_admin', true), '') = 'on'
      or coalesce(current_setting('app.system', true), '') = 'on'
$$;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Catálogo de funcionalidades e planos (globais)
-- ---------------------------------------------------------------------
create table features (
  key          text primary key,
  name         text not null,
  description  text,
  sort_order   int  not null default 0
);

create table plans (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  is_active    boolean not null default true,
  -- limites: max_users, max_sellers, max_contacts, max_whatsapp_connections,
  --          max_messages_month, max_google_searches_month (null = ilimitado)
  limits       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index plans_name_uq on plans (lower(name));
create trigger plans_updated before update on plans for each row execute function set_updated_at();

create table plan_features (
  plan_id      uuid not null references plans(id) on delete cascade,
  feature_key  text not null references features(key) on delete cascade,
  primary key (plan_id, feature_key)
);

-- ---------------------------------------------------------------------
-- Empresas (tenants). Somente o nome é obrigatório.
-- ---------------------------------------------------------------------
create table companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) > 0),
  legal_name      text,
  document        text,          -- CNPJ (opcional)
  phone           text,
  email           text,
  segment         text,
  address         text,
  notes           text,
  plan_id         uuid references plans(id) on delete set null,
  is_active       boolean not null default true,
  limits_override jsonb not null default '{}'::jsonb,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index companies_name_idx on companies (lower(name));
create trigger companies_updated before update on companies for each row execute function set_updated_at();

-- Liberação/bloqueio individual por empresa (sobrepõe o plano)
create table company_features (
  company_id   uuid not null references companies(id) on delete cascade,
  feature_key  text not null references features(key) on delete cascade,
  enabled      boolean not null,
  updated_at   timestamptz not null default now(),
  primary key (company_id, feature_key)
);

-- ---------------------------------------------------------------------
-- Usuários (login por nome de usuário) e vínculos com empresas
-- ---------------------------------------------------------------------
create table users (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (length(btrim(name)) > 0),
  username             citext not null unique check (username ~ '^[a-z0-9._-]{3,40}$'),
  password_hash        text not null,
  is_platform_admin    boolean not null default false,
  is_active            boolean not null default true,
  must_change_password boolean not null default false,
  last_login_at        timestamptz,
  created_by           uuid references users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger users_updated before update on users for each row execute function set_updated_at();

alter table companies add constraint companies_created_by_fk
  foreign key (created_by) references users(id) on delete set null;

create table company_memberships (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null check (role in ('company_admin', 'seller')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
create index memberships_user_idx on company_memberships (user_id);
create trigger memberships_updated before update on company_memberships for each row execute function set_updated_at();

-- Permissões individuais por usuário (sobrepõe o padrão do perfil)
create table user_feature_overrides (
  company_id   uuid not null references companies(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  feature_key  text not null references features(key) on delete cascade,
  enabled      boolean not null,
  updated_at   timestamptz not null default now(),
  primary key (company_id, user_id, feature_key)
);

-- ---------------------------------------------------------------------
-- Sessões (token opaco; somente o hash SHA-256 é armazenado)
-- ---------------------------------------------------------------------
create table sessions (
  id                 uuid primary key default gen_random_uuid(),
  token_hash         text not null unique,
  user_id            uuid not null references users(id) on delete cascade,
  active_company_id  uuid references companies(id) on delete set null,
  ip                 text,
  user_agent         text,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  expires_at         timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

create table login_attempts (
  id          bigserial primary key,
  username    citext not null,
  ip          text,
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index login_attempts_lookup on login_attempts (username, created_at desc);

-- ---------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------
create table audit_logs (
  id           bigserial primary key,
  company_id   uuid references companies(id) on delete set null,
  user_id      uuid references users(id) on delete set null,
  action       text not null,
  entity_type  text,
  entity_id    text,
  data         jsonb not null default '{}'::jsonb,
  ip           text,
  created_at   timestamptz not null default now()
);
create index audit_company_idx on audit_logs (company_id, created_at desc);
create index audit_created_idx on audit_logs (created_at desc);

-- =====================================================================
-- RLS (Row Level Security) — isolamento no banco de dados
-- =====================================================================
alter table companies enable row level security;
create policy companies_isolation on companies
  using (app_bypass() or id = app_company_id())
  with check (app_bypass());

alter table company_features enable row level security;
create policy company_features_isolation on company_features
  using (app_bypass() or company_id = app_company_id())
  with check (app_bypass());

alter table company_memberships enable row level security;
create policy memberships_isolation on company_memberships
  using (app_bypass() or company_id = app_company_id() or user_id = app_user_id())
  with check (app_bypass() or company_id = app_company_id());

alter table user_feature_overrides enable row level security;
create policy ufo_isolation on user_feature_overrides
  using (app_bypass() or company_id = app_company_id())
  with check (app_bypass() or company_id = app_company_id());

alter table users enable row level security;
create policy users_isolation on users
  using (
    app_bypass()
    or id = app_user_id()
    or exists (select 1 from company_memberships m
               where m.user_id = users.id and m.company_id = app_company_id())
  )
  with check (
    app_bypass()
    or id = app_user_id()
    or app_company_id() is not null
  );

alter table sessions enable row level security;
create policy sessions_isolation on sessions
  using (app_bypass() or user_id = app_user_id())
  with check (app_bypass() or user_id = app_user_id());

alter table login_attempts enable row level security;
create policy login_attempts_system on login_attempts
  using (app_bypass()) with check (app_bypass());

alter table audit_logs enable row level security;
create policy audit_isolation on audit_logs
  using (app_bypass() or company_id = app_company_id())
  with check (app_bypass() or company_id = app_company_id() or company_id is null);

-- Tabelas globais de catálogo: leitura livre, escrita só bypass
alter table plans enable row level security;
create policy plans_read on plans for select using (true);
create policy plans_write on plans for all using (app_bypass()) with check (app_bypass());

alter table plan_features enable row level security;
create policy plan_features_read on plan_features for select using (true);
create policy plan_features_write on plan_features for all using (app_bypass()) with check (app_bypass());

alter table features enable row level security;
create policy features_read on features for select using (true);
create policy features_write on features for all using (app_bypass()) with check (app_bypass());

-- ---------------------------------------------------------------------
-- Catálogo inicial de funcionalidades
-- ---------------------------------------------------------------------
insert into features (key, name, description, sort_order) values
  ('dashboard',          'Dashboard',              'Painel de indicadores',                         10),
  ('google_search',      'Pesquisa no Google',     'Prospecção de empresas via Google Places',       20),
  ('spreadsheet_import', 'Importação de planilhas','Importação de XLS, XLSX e CSV',                  30),
  ('contact_lists',      'Listas de contatos',     'Organização de contatos em listas',              40),
  ('contacts',           'Contatos',               'Base central de contatos',                       50),
  ('campaigns',          'Campanhas',              'Central de campanhas comerciais',                60),
  ('scripts',            'Scripts',                'Scripts e modelos de mensagens',                 70),
  ('tags',               'Etiquetas',              'Etiquetas personalizadas',                       80),
  ('conversations',      'Conversas',              'Central de conversas',                           90),
  ('ai_chatbot',         'Chatbot IA',             'Agente comercial e contexto da empresa',        100),
  ('ai_messages',        'Mensagens com IA',       'Geração e melhoria de mensagens com IA',        110),
  ('whatsapp',           'WhatsApp Comercial',     'Conexão de números de WhatsApp',                120),
  ('crm',                'CRM',                    'Funil de vendas e oportunidades',               130),
  ('sales_team',         'Equipe Comercial',       'Gestão de vendedores',                          140),
  ('broadcasts',         'Disparos de mensagens',  'Envio de mensagens em campanhas',               150),
  ('goals',              'Metas',                  'Metas individuais e coletivas',                 160),
  ('reports',            'Relatórios',             'Relatórios de desempenho',                      170),
  ('data_export',        'Exportação de dados',    'Exportação em PDF, Excel e CSV',                180);

-- Plano completo padrão
insert into plans (name, description, limits) values
  ('Completo', 'Todas as funcionalidades liberadas', '{}'::jsonb);
insert into plan_features (plan_id, feature_key)
  select p.id, f.key from plans p cross join features f where p.name = 'Completo';
