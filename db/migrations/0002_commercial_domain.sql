-- =====================================================================
-- 0002_commercial_domain — Modelo comercial integrado:
-- contatos → listas → campanhas → WhatsApp → conversas → CRM → vendas.
-- Todas as tabelas comerciais possuem company_id + RLS.
-- O contato é a entidade central: nenhum módulo cria cadastro paralelo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CONTATOS (base central)
-- ---------------------------------------------------------------------
create table contacts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  name             text,
  phone_e164       text,              -- telefone normalizado (+5591...)
  whatsapp_e164    text,              -- quando diferente do telefone
  email            citext,
  organization     text,              -- empresa do contato
  city             text,
  state            text,
  neighborhood     text,
  address          text,
  website          text,
  category         text,
  rating           numeric(3,2),
  notes            text,
  source           text not null default 'manual'
                   check (source in ('manual','google','import','whatsapp','campaign','api')),
  source_detail    jsonb not null default '{}'::jsonb,
  google_place_id  text,
  owner_user_id    uuid references users(id) on delete set null,   -- vendedor responsável
  commercial_status text not null default 'new'
                   check (commercial_status in ('new','contacted','in_progress','qualified','negotiating','customer','lost','unqualified')),
  consent_status   text not null default 'unknown'
                   check (consent_status in ('unknown','opted_in','opted_out')),
  consent_source   text,
  consent_at       timestamptz,
  opted_out_at     timestamptz,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (name is not null or phone_e164 is not null or email is not null or organization is not null)
);
-- Deduplicação: um telefone / place_id por empresa
create unique index contacts_phone_uq   on contacts (company_id, phone_e164) where phone_e164 is not null;
create unique index contacts_wa_uq      on contacts (company_id, whatsapp_e164) where whatsapp_e164 is not null;
create unique index contacts_place_uq   on contacts (company_id, google_place_id) where google_place_id is not null;
create index contacts_company_created   on contacts (company_id, created_at desc);
create index contacts_owner_idx         on contacts (company_id, owner_user_id);
create index contacts_name_idx          on contacts (company_id, lower(name));
create trigger contacts_updated before update on contacts for each row execute function set_updated_at();

create table contact_lists (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  description  text,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index contact_lists_name_uq on contact_lists (company_id, lower(name));
create trigger contact_lists_updated before update on contact_lists for each row execute function set_updated_at();

create table contact_list_members (
  company_id  uuid not null references companies(id) on delete cascade,
  list_id     uuid not null references contact_lists(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (list_id, contact_id)
);
create index clm_contact_idx on contact_list_members (contact_id);

-- ---------------------------------------------------------------------
-- ETIQUETAS (vinculadas ao contato central)
-- ---------------------------------------------------------------------
create table tags (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  color       text not null default '#008C48' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz not null default now()
);
create unique index tags_name_uq on tags (company_id, lower(name));

create table contact_tags (
  company_id  uuid not null references companies(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  tag_id      uuid not null references tags(id) on delete cascade,
  source      text not null default 'manual' check (source in ('manual','rule','ai')),
  applied_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (contact_id, tag_id)
);
create index contact_tags_tag_idx on contact_tags (tag_id);

create table tag_rules (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  tag_id      uuid not null references tags(id) on delete cascade,
  trigger     text not null check (trigger in ('message_received','keyword','stage_changed','sale_won','sale_lost','ai_intent')),
  condition   jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SCRIPTS / MODELOS
-- ---------------------------------------------------------------------
create table scripts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  name         text not null,
  body         text not null,
  is_template  boolean not null default true,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger scripts_updated before update on scripts for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- WHATSAPP (arquitetura modular por provedor)
-- ---------------------------------------------------------------------
create table whatsapp_connections (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references companies(id) on delete cascade,
  provider               text not null default 'meta_cloud' check (provider in ('meta_cloud')),
  display_name           text not null,
  phone_number           text,
  phone_number_id        text,      -- Meta: ID do número
  business_account_id    text,      -- Meta: WABA ID
  credentials_encrypted  text,      -- token criptografado (AES-256-GCM) — nunca em texto puro
  status                 text not null default 'pending'
                         check (status in ('pending','connected','disconnected','error')),
  connected_at           timestamptz,
  last_sync_at           timestamptz,
  last_error             text,
  created_by             uuid references users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index wa_phone_number_id_uq on whatsapp_connections (provider, phone_number_id) where phone_number_id is not null;
create trigger wa_updated before update on whatsapp_connections for each row execute function set_updated_at();

create table whatsapp_templates (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  connection_id  uuid not null references whatsapp_connections(id) on delete cascade,
  name           text not null,
  language       text not null default 'pt_BR',
  category       text,
  status         text not null,
  components     jsonb not null default '[]'::jsonb,
  synced_at      timestamptz not null default now(),
  unique (connection_id, name, language)
);

-- ---------------------------------------------------------------------
-- CAMPANHAS
-- ---------------------------------------------------------------------
create table campaigns (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references companies(id) on delete cascade,
  number                  int not null,
  name                    text not null check (length(btrim(name)) > 0),
  list_id                 uuid references contact_lists(id) on delete set null,
  script_id               uuid references scripts(id) on delete set null,
  message_body            text,
  whatsapp_connection_id  uuid references whatsapp_connections(id) on delete set null,
  template_id             uuid references whatsapp_templates(id) on delete set null,
  response_mode           text not null default 'human' check (response_mode in ('human','ai','ai_then_human')),
  status                  text not null default 'draft'
                          check (status in ('draft','scheduled','running','paused','completed','cancelled')),
  is_archived             boolean not null default false,
  scheduled_at            timestamptz,
  started_at              timestamptz,
  paused_at               timestamptz,
  completed_at            timestamptz,
  settings                jsonb not null default '{}'::jsonb,   -- ritmo de envio, janela horária etc.
  created_by              uuid references users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (company_id, number)
);
create index campaigns_company_status on campaigns (company_id, status);
create trigger campaigns_updated before update on campaigns for each row execute function set_updated_at();

-- Um contato só entra uma vez por campanha => impossível envio duplicado
create table campaign_contacts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  contact_id      uuid not null references contacts(id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending','queued','sending','sent','delivered','read','replied','failed','skipped')),
  message_id      uuid,
  attempts        int not null default 0,
  error           text,
  queued_at       timestamptz,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  replied_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index cc_campaign_status on campaign_contacts (campaign_id, status);
create index cc_contact_idx on campaign_contacts (contact_id);

-- ---------------------------------------------------------------------
-- CONVERSAS E MENSAGENS
-- ---------------------------------------------------------------------
create table conversations (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references companies(id) on delete cascade,
  contact_id              uuid not null references contacts(id) on delete cascade,
  whatsapp_connection_id  uuid references whatsapp_connections(id) on delete set null,
  assigned_user_id        uuid references users(id) on delete set null,
  origin_campaign_id      uuid references campaigns(id) on delete set null,
  status                  text not null default 'open' check (status in ('open','pending','closed')),
  ai_enabled              boolean not null default false,
  handled_by              text not null default 'none' check (handled_by in ('none','ai','human')),
  unread_count            int not null default 0,
  last_message_at         timestamptz,
  last_message_preview    text,
  last_inbound_at         timestamptz,       -- janela de 24h da Meta
  next_follow_up_at       timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index conversations_contact_conn_uq
  on conversations (company_id, contact_id, coalesce(whatsapp_connection_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index conversations_list_idx on conversations (company_id, last_message_at desc nulls last);
create index conversations_assignee on conversations (company_id, assigned_user_id);
create trigger conversations_updated before update on conversations for each row execute function set_updated_at();

create table messages (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  conversation_id      uuid not null references conversations(id) on delete cascade,
  contact_id           uuid not null references contacts(id) on delete cascade,
  direction            text not null check (direction in ('inbound','outbound')),
  sender_type          text not null check (sender_type in ('contact','user','ai','campaign','system')),
  sender_user_id       uuid references users(id) on delete set null,
  campaign_id          uuid references campaigns(id) on delete set null,
  body                 text,
  media_url            text,
  media_type           text,
  provider_message_id  text,
  status               text not null default 'queued'
                       check (status in ('queued','sent','delivered','read','failed','received')),
  error                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index messages_provider_uq on messages (company_id, provider_message_id) where provider_message_id is not null;
create index messages_conversation_idx on messages (conversation_id, created_at);
create index messages_company_created on messages (company_id, created_at desc);
create trigger messages_updated before update on messages for each row execute function set_updated_at();

alter table campaign_contacts add constraint cc_message_fk
  foreign key (message_id) references messages(id) on delete set null;

create table quick_replies (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  shortcut    text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  unique (company_id, shortcut)
);

-- ---------------------------------------------------------------------
-- CRM: funis, etapas, oportunidades, vendas
-- ---------------------------------------------------------------------
create table pipelines (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index pipelines_default_uq on pipelines (company_id) where is_default;

create table pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  pipeline_id  uuid not null references pipelines(id) on delete cascade,
  name         text not null,
  position     int not null,
  kind         text not null default 'open' check (kind in ('open','won','lost')),
  color        text not null default '#008C48',
  created_at   timestamptz not null default now()
);
create index stages_pipeline_idx on pipeline_stages (pipeline_id, position);

create table opportunities (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  contact_id         uuid not null references contacts(id) on delete cascade,
  pipeline_id        uuid not null references pipelines(id) on delete cascade,
  stage_id           uuid not null references pipeline_stages(id) on delete restrict,
  owner_user_id      uuid references users(id) on delete set null,
  campaign_id        uuid references campaigns(id) on delete set null,
  conversation_id    uuid references conversations(id) on delete set null,
  title              text,
  value              numeric(14,2),
  status             text not null default 'open' check (status in ('open','won','lost')),
  lost_reason        text,
  next_follow_up_at  timestamptz,
  notes              text,
  position           double precision not null default 0,
  won_at             timestamptz,
  lost_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index opp_stage_idx on opportunities (company_id, stage_id, position);
create index opp_owner_idx on opportunities (company_id, owner_user_id);
create index opp_contact_idx on opportunities (contact_id);
create trigger opportunities_updated before update on opportunities for each row execute function set_updated_at();

create table sales (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  opportunity_id   uuid references opportunities(id) on delete set null,
  contact_id       uuid not null references contacts(id) on delete cascade,
  seller_user_id   uuid references users(id) on delete set null,
  campaign_id      uuid references campaigns(id) on delete set null,
  amount           numeric(14,2) not null default 0,
  sold_at          timestamptz not null default now(),
  notes            text,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create unique index sales_opportunity_uq on sales (opportunity_id) where opportunity_id is not null;
create index sales_company_date on sales (company_id, sold_at desc);

create table goals (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  user_id       uuid references users(id) on delete cascade,   -- null = meta coletiva
  metric        text not null check (metric in ('sales_amount','sales_count','leads_attended','opportunities_created')),
  target        numeric(14,2) not null check (target > 0),
  period_start  date not null,
  period_end    date not null,
  created_at    timestamptz not null default now(),
  check (period_end >= period_start)
);
create index goals_company_period on goals (company_id, period_start, period_end);

-- ---------------------------------------------------------------------
-- CONTEXTO DA EMPRESA + IA
-- ---------------------------------------------------------------------
create table knowledge_entries (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  category    text not null check (category in ('company','products','services','prices','promotions','hours',
                                                 'address','differentials','faq','commercial_terms','instructions','negotiation_rules','other')),
  title       text not null,
  content     text not null,
  is_active   boolean not null default true,
  updated_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index knowledge_company_idx on knowledge_entries (company_id, category);
create trigger knowledge_updated before update on knowledge_entries for each row execute function set_updated_at();

create table knowledge_documents (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  filename        text not null,
  mime_type       text,
  size_bytes      bigint,
  storage_path    text not null,
  extracted_text  text,
  uploaded_by     uuid references users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table ai_settings (
  company_id              uuid primary key references companies(id) on delete cascade,
  enabled                 boolean not null default false,
  agent_name              text not null default 'Assistente',
  personality             text,
  tone                    text,
  instructions            text,
  business_hours          jsonb not null default '{}'::jsonb,
  qualification_criteria  text,
  handoff_criteria        text,
  greeting_message        text,
  closing_message         text,
  updated_at              timestamptz not null default now()
);
create trigger ai_settings_updated before update on ai_settings for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- FILAS, EVENTOS E WEBHOOKS
-- ---------------------------------------------------------------------
create table jobs (
  id            bigserial primary key,
  company_id    uuid references companies(id) on delete cascade,
  type          text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'pending' check (status in ('pending','running','done','failed','cancelled')),
  run_at        timestamptz not null default now(),
  attempts      int not null default 0,
  max_attempts  int not null default 5,
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  dedupe_key    text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create unique index jobs_dedupe_uq on jobs (dedupe_key) where dedupe_key is not null and status in ('pending','running');
create index jobs_ready_idx on jobs (status, run_at) where status = 'pending';

create table domain_events (
  id             bigserial primary key,
  company_id     uuid not null references companies(id) on delete cascade,
  type           text not null,
  contact_id     uuid references contacts(id) on delete cascade,
  campaign_id    uuid references campaigns(id) on delete set null,
  actor_user_id  uuid references users(id) on delete set null,
  entity_type    text,
  entity_id      uuid,
  data           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index events_company_type on domain_events (company_id, type, created_at desc);
create index events_contact_idx on domain_events (contact_id, created_at desc);

create table webhook_events (
  id            bigserial primary key,
  provider      text not null,
  company_id    uuid references companies(id) on delete set null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);

create table usage_counters (
  company_id  uuid not null references companies(id) on delete cascade,
  metric      text not null,
  period      date not null,   -- primeiro dia do mês
  value       bigint not null default 0,
  primary key (company_id, metric, period)
);

-- =====================================================================
-- RLS em todas as tabelas comerciais
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','contact_lists','contact_list_members','tags','contact_tags','tag_rules','scripts',
    'whatsapp_connections','whatsapp_templates','campaigns','campaign_contacts','conversations','messages',
    'quick_replies','pipelines','pipeline_stages','opportunities','sales','goals','knowledge_entries',
    'knowledge_documents','ai_settings','domain_events','usage_counters'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (app_bypass() or company_id = app_company_id()) with check (app_bypass() or company_id = app_company_id())', t);
  end loop;
end $$;

alter table jobs enable row level security;
create policy jobs_isolation on jobs
  using (app_bypass() or company_id = app_company_id())
  with check (app_bypass() or company_id = app_company_id());

alter table webhook_events enable row level security;
create policy webhook_system on webhook_events using (app_bypass()) with check (app_bypass());

-- ---------------------------------------------------------------------
-- Funil padrão criado automaticamente para cada nova empresa
-- ---------------------------------------------------------------------
create or replace function create_default_pipeline() returns trigger
language plpgsql as $$
declare p uuid;
begin
  insert into pipelines (company_id, name, is_default) values (new.id, 'Funil comercial', true) returning id into p;
  insert into pipeline_stages (company_id, pipeline_id, name, position, kind, color) values
    (new.id, p, 'Novo lead',          1, 'open', '#7FBF9A'),
    (new.id, p, 'Primeiro contato',   2, 'open', '#5AAE80'),
    (new.id, p, 'Em atendimento',     3, 'open', '#3A9D67'),
    (new.id, p, 'Lead qualificado',   4, 'open', '#1F8E52'),
    (new.id, p, 'Em negociação',      5, 'open', '#008C48'),
    (new.id, p, 'Proposta enviada',   6, 'open', '#007A3F'),
    (new.id, p, 'Aguardando retorno', 7, 'open', '#006B38'),
    (new.id, p, 'Venda realizada',    8, 'won',  '#0B6E2E'),
    (new.id, p, 'Perdido',            9, 'lost', '#B42318');
  insert into ai_settings (company_id) values (new.id);
  return new;
end $$;
create trigger companies_default_pipeline after insert on companies
  for each row execute function create_default_pipeline();
