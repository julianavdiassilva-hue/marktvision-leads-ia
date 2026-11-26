-- Conexão por QR Code (Evolution API — modalidade NÃO oficial, autorizada pelo cliente da plataforma)
alter table whatsapp_connections drop constraint if exists whatsapp_connections_provider_check;
alter table whatsapp_connections add constraint whatsapp_connections_provider_check check (provider in ('meta_cloud','evolution'));
alter table whatsapp_connections drop constraint if exists whatsapp_connections_connection_mode_check;
alter table whatsapp_connections add constraint whatsapp_connections_connection_mode_check check (connection_mode in ('cloud_api','coexistence','manual','qr'));
alter table whatsapp_connections add column if not exists instance_name text;
alter table whatsapp_connections add column if not exists webhook_secret_hash text;
create unique index if not exists wa_instance_name_uq on whatsapp_connections (instance_name) where instance_name is not null;
