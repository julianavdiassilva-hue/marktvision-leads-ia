-- Fase 08 — Chatbot IA
alter table ai_settings add column if not exists auto_reply_new boolean not null default false;  -- IA atende novos contatos espontâneos
alter table ai_settings add column if not exists outside_hours_message text;
alter table conversations add column if not exists ai_last_outside_notice_at timestamptz;
alter table knowledge_documents alter column storage_path drop not null;
