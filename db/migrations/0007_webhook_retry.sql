alter table webhook_events add column if not exists attempts int not null default 0;
create index if not exists webhook_events_pending on webhook_events (received_at) where processed_at is null;
