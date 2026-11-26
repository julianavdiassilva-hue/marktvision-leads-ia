-- Fase 05 — WhatsApp: configurações por conexão e rastreio de modelos nas mensagens
alter table whatsapp_connections add column if not exists settings jsonb not null default '{}'::jsonb;  -- ex.: {"per_minute": 20}
alter table whatsapp_connections add column if not exists quality_rating text;
alter table messages add column if not exists template_name text;
create index if not exists messages_conv_inbound on messages (conversation_id, direction, created_at desc);
create index if not exists cc_message_idx on campaign_contacts (message_id);
