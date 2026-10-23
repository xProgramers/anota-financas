-- =====================================================================
-- Quadro de meta de economia ("cofre desafio")
-- A meta é dividida em casinhas de R$ 5 a R$ 100. O usuário marca cada
-- casinha quando guarda aquele valor; marked_at registra a data.
-- =====================================================================

create table public.savings_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  target      numeric(12, 2) not null check (target > 0 and target <= 30000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- necessário para a FK composta das casinhas (garante mesmo dono)
  unique (id, user_id)
);

create index savings_goals_user_idx on public.savings_goals (user_id, created_at desc);

create trigger savings_goals_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();

create table public.savings_goal_cells (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  position    smallint not null check (position between 0 and 299),
  amount      numeric(10, 2) not null check (amount >= 5 and amount <= 100),
  marked_at   timestamptz,
  unique (goal_id, position),
  constraint savings_goal_cells_goal_owner_fk
    foreign key (goal_id, user_id)
    references public.savings_goals (id, user_id)
    on delete cascade
);

create index savings_goal_cells_user_idx on public.savings_goal_cells (user_id);

-- ---------- RLS ----------
alter table public.savings_goals      enable row level security;
alter table public.savings_goal_cells enable row level security;

create policy "savings_goals_select_own" on public.savings_goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "savings_goals_insert_own" on public.savings_goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "savings_goals_update_own" on public.savings_goals
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "savings_goals_delete_own" on public.savings_goals
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "savings_goal_cells_select_own" on public.savings_goal_cells
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "savings_goal_cells_insert_own" on public.savings_goal_cells
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "savings_goal_cells_update_own" on public.savings_goal_cells
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.savings_goals, public.savings_goal_cells from anon;

-- Depois de criada, a meta só muda de nome e a casinha só muda a marcação.
revoke update on public.savings_goals, public.savings_goal_cells from authenticated;
grant update (name) on public.savings_goals to authenticated;
grant update (marked_at) on public.savings_goal_cells to authenticated;

-- ---------- RPC ----------
-- Cria a meta e as casinhas de uma vez. A meta é a soma das casinhas.
create or replace function public.create_savings_goal(p_name text, p_amounts numeric[])
returns public.savings_goals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_goal public.savings_goals;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_amounts), 0) = 0 or cardinality(p_amounts) > 300 then
    raise exception 'Quantidade de casinhas inválida' using errcode = '22023';
  end if;

  insert into public.savings_goals (user_id, name, target)
  values (v_uid, btrim(p_name), (select sum(round(a, 2)) from unnest(p_amounts) a))
  returning * into v_goal;

  insert into public.savings_goal_cells (goal_id, user_id, position, amount)
  select v_goal.id, v_uid, (t.ord - 1)::smallint, round(t.a, 2)
    from unnest(p_amounts) with ordinality as t(a, ord);

  return v_goal;
end;
$$;

revoke all on function public.create_savings_goal(text, numeric[]) from public, anon;
grant execute on function public.create_savings_goal(text, numeric[]) to authenticated;
