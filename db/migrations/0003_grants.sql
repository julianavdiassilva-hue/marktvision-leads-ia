-- Permissões do papel da aplicação (não-superusuário, sujeito a RLS)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mv_app') then
    execute 'grant usage on schema public to mv_app';
    execute 'grant select, insert, update, delete on all tables in schema public to mv_app';
    execute 'grant usage, select on all sequences in schema public to mv_app';
    execute 'grant execute on all functions in schema public to mv_app';
    execute 'alter default privileges in schema public grant select, insert, update, delete on tables to mv_app';
    execute 'alter default privileges in schema public grant usage, select on sequences to mv_app';
  end if;
end $$;
-- Tabela de migrações e de controle não são acessíveis à aplicação
revoke all on table schema_migrations from mv_app;
