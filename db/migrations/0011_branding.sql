-- Identidade visual (White Label) por empresa + armazenamento de arquivos isolado por empresa.

-- Funcionalidade: desligada por padrão (o administrador geral libera para o admin da empresa).
insert into features (key, name, description, sort_order) values
  ('branding', 'Identidade visual', 'Logomarca, cores e nome exibido no ambiente da empresa', 190)
on conflict (key) do nothing;

-- Endereço de login próprio da empresa: /entrar/<slug>
alter table companies add column if not exists slug text;

create or replace function company_slug_base(n text) returns text language sql immutable as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(translate(n,
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^a-z0-9]+', '-', 'g')), ''), 'empresa')
$$;

create or replace function companies_set_slug() returns trigger language plpgsql as $$
declare base text; candidate text; i int := 1;
begin
  if new.slug is not null and new.slug <> '' then return new; end if;
  base := left(company_slug_base(new.name), 48);
  candidate := base;
  while exists (select 1 from companies where slug = candidate and id <> new.id) loop
    i := i + 1; candidate := base || '-' || i;
  end loop;
  new.slug := candidate;
  return new;
end $$;

create trigger companies_slug before insert or update of name, slug on companies
  for each row when (new.slug is null) execute function companies_set_slug();
update companies set slug = null where slug is null;  -- preenche as empresas existentes
alter table companies alter column slug set not null;
alter table companies add constraint companies_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60);
create unique index companies_slug_uq on companies (slug);

-- Personalização visual (uma linha por empresa; sem linha = padrão Marktvision)
create table company_branding (
  company_id        uuid primary key references companies(id) on delete cascade,
  display_name      text check (display_name is null or length(btrim(display_name)) between 1 and 60),
  primary_color     text check (primary_color ~ '^#[0-9a-f]{6}$'),
  secondary_color   text check (secondary_color ~ '^#[0-9a-f]{6}$'),
  button_color      text check (button_color ~ '^#[0-9a-f]{6}$'),
  sidebar_color     text check (sidebar_color ~ '^#[0-9a-f]{6}$'),
  background_color  text check (background_color ~ '^#[0-9a-f]{6}$'),
  text_color        text check (text_color ~ '^#[0-9a-f]{6}$'),
  logo_key          text,            -- chave em company_files
  logo_version      int not null default 0,
  updated_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger company_branding_updated before update on company_branding for each row execute function set_updated_at();

-- Armazenamento de arquivos por empresa (driver "database": entra nos backups e respeita o RLS)
create table company_files (
  company_id   uuid not null references companies(id) on delete cascade,
  key          text not null check (key ~ '^[a-z0-9/_.-]{1,120}$'),
  mime_type    text not null,
  size_bytes   int not null check (size_bytes > 0),
  sha256       text not null,
  content      bytea not null,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (company_id, key)
);

do $$
declare t text;
begin
  foreach t in array array['company_branding', 'company_files'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I using (app_bypass() or company_id = app_company_id()) with check (app_bypass() or company_id = app_company_id())', t);
    if exists (select 1 from pg_roles where rolname = 'mv_app') then
      execute format('grant select, insert, update, delete on %I to mv_app', t);
    end if;
  end loop;
end $$;
