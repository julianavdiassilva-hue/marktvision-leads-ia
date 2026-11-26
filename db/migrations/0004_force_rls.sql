-- RLS forçado também para o DONO das tabelas. Assim o isolamento por empresa
-- vale mesmo em hospedagens que oferecem um único usuário de banco
-- (Render, Railway, Neon, Supabase). Só superusuários ignoram o RLS.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('alter table %I force row level security', t.relname);
  end loop;
end $$;
