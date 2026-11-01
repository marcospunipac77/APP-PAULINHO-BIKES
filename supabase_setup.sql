create table if not exists public.vendas (
    user_id uuid not null references auth.users (id) on delete cascade,
    id text not null,
    dados jsonb not null,
    updated_at timestamptz not null default now(),
    constraint vendas_pkey primary key (user_id, id),
    constraint vendas_dados_object check (jsonb_typeof(dados) = 'object')
);

alter table public.vendas enable row level security;

drop policy if exists "Cada conta pode ler suas vendas" on public.vendas;
create policy "Cada conta pode ler suas vendas"
    on public.vendas for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Cada conta pode inserir suas vendas" on public.vendas;
create policy "Cada conta pode inserir suas vendas"
    on public.vendas for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Cada conta pode atualizar suas vendas" on public.vendas;
create policy "Cada conta pode atualizar suas vendas"
    on public.vendas for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Cada conta pode excluir suas vendas" on public.vendas;
create policy "Cada conta pode excluir suas vendas"
    on public.vendas for delete to authenticated
    using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.vendas to authenticated;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'vendas'
    ) then
        alter publication supabase_realtime add table public.vendas;
    end if;
end
$$;
