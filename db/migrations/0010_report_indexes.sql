-- Fase 10: índices para dashboard e relatórios com grande volume.
create index if not exists messages_contact_dir on messages (contact_id, direction);
create index if not exists messages_campaign_idx on messages (campaign_id) where campaign_id is not null;
create index if not exists opp_campaign_idx on opportunities (campaign_id) where campaign_id is not null;
create index if not exists opp_closed_idx on opportunities (company_id, status, coalesce(won_at, lost_at));
create index if not exists sales_campaign_idx on sales (campaign_id) where campaign_id is not null;
create index if not exists sales_contact_idx on sales (contact_id);
create index if not exists contacts_source_idx on contacts (company_id, source);
