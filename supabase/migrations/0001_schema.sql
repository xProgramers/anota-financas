-- =====================================================================
-- Finanças Chat — schema inicial
-- Tabelas, enums, constraints, índices, RLS, triggers, funções e seed.
-- Execute em um projeto Supabase novo (SQL Editor ou `supabase db push`).
-- =====================================================================

-- ---------- Enums ----------
create type public.transaction_type as enum ('expense', 'income');
create type public.chat_role        as enum ('user', 'assistant');
create type public.transaction_source as enum ('chat', 'manual');
create type public.draft_status     as enum ('pending', 'confirmed', 'discarded');

-- ---------- Função utilitária: updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- profiles
-- =====================================================================
create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  name        text check (name is null or char_length(name) between 1 and 80),
  avatar_url  text check (avatar_url is null or char_length(avatar_url) <= 500),
  currency    char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  timezone    text not null default 'America/Sao_Paulo' check (char_length(timezone) between 1 and 64),
  onboarded   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- =====================================================================
-- categories
-- =====================================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  type        public.transaction_type not null,
  icon        text not null default 'circle' check (char_length(icon) <= 40),
  color       text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  -- necessário para a FK composta em transactions (garante mesmo dono)
  unique (id, user_id)
);

create unique index categories_user_type_name_uidx
  on public.categories (user_id, type, lower(btrim(name)));
create index categories_user_idx on public.categories (user_id);

-- =====================================================================
-- transactions
-- =====================================================================
create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  category_id       uuid,
  type              public.transaction_type not null,
  amount            numeric(14, 2) not null check (amount > 0 and amount < 1000000000),
  currency          char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  description       text not null default '' check (char_length(description) <= 200),
  transaction_date  date not null,
  source            public.transaction_source not null default 'manual',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- a categoria precisa pertencer ao MESMO usuário; ao apagar a categoria
  -- só category_id vira NULL (Postgres 15+)
  constraint transactions_category_owner_fk
    foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete set null (category_id)
);

create index transactions_user_date_idx     on public.transactions (user_id, transaction_date desc, created_at desc);
create index transactions_user_category_idx on public.transactions (user_id, category_id);
create index transactions_user_type_idx     on public.transactions (user_id, type, transaction_date);
create index transactions_category_idx      on public.transactions (category_id);

create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- A categoria deve ter o mesmo tipo (receita/despesa) da transação
create or replace function public.check_transaction_category_type()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type public.transaction_type;
begin
  if new.category_id is not null then
    select c.type into v_type from public.categories c where c.id = new.category_id;
    if v_type is distinct from new.type then
      raise exception 'Categoria incompatível com o tipo da transação'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_category_type
  before insert or update of category_id, type on public.transactions
  for each row execute function public.check_transaction_category_type();

-- =====================================================================
-- chat_messages
-- =====================================================================
create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            public.chat_role not null,
  content         text not null check (char_length(content) between 1 and 2000),
  transaction_id  uuid references public.transactions (id) on delete set null,
  -- rascunho de transação proposto pela IA (aguardando confirmação)
  draft           jsonb,
  draft_status    public.draft_status,
  created_at      timestamptz not null default now(),
  constraint chat_messages_draft_consistency
    check ((draft is null) = (draft_status is null))
);

create index chat_messages_user_created_idx on public.chat_messages (user_id, created_at desc);
create index chat_messages_transaction_idx  on public.chat_messages (transaction_id);
create index chat_messages_pending_idx      on public.chat_messages (user_id, created_at desc)
  where draft_status = 'pending';

-- =====================================================================
-- ai_interpretations (auditoria + base do rate limit)
-- =====================================================================
create table public.ai_interpretations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  message_id    uuid references public.chat_messages (id) on delete cascade,
  provider      text not null default 'gemini' check (char_length(provider) <= 40),
  raw_response  text check (raw_response is null or char_length(raw_response) <= 20000),
  parsed_data   jsonb,
  confidence    numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at    timestamptz not null default now()
);

create index ai_interpretations_user_created_idx on public.ai_interpretations (user_id, created_at desc);
create index ai_interpretations_message_idx      on public.ai_interpretations (message_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.transactions       enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.ai_interpretations enable row level security;

-- profiles: o perfil é criado pelo trigger; usuário lê e edita o próprio
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- categories
create policy "categories_select_own" on public.categories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "categories_insert_own" on public.categories
  for insert to authenticated with check ((select auth.uid()) = user_id and is_default = false);
create policy "categories_update_own" on public.categories
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories_delete_own" on public.categories
  for delete to authenticated using ((select auth.uid()) = user_id and is_default = false);

-- transactions
create policy "transactions_select_own" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- chat_messages
create policy "chat_select_own" on public.chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "chat_insert_own" on public.chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "chat_update_own" on public.chat_messages
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "chat_delete_own" on public.chat_messages
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ai_interpretations: somente leitura e inserção (registro de auditoria)
create policy "ai_select_own" on public.ai_interpretations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_insert_own" on public.ai_interpretations
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Nenhum acesso para anônimos
revoke all on public.profiles, public.categories, public.transactions,
              public.chat_messages, public.ai_interpretations from anon;

-- =====================================================================
-- Categorias padrão + perfil para cada novo usuário
-- =====================================================================
create or replace function public.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (user_id, name, type, icon, color, is_default)
  values
    (p_user_id, 'Alimentação',      'expense', 'utensils',        '#e8590c', true),
    (p_user_id, 'Transporte',       'expense', 'car',             '#1c7ed6', true),
    (p_user_id, 'Moradia',          'expense', 'home',            '#7048e8', true),
    (p_user_id, 'Contas',           'expense', 'receipt',         '#c2255c', true),
    (p_user_id, 'Compras pessoais', 'expense', 'shopping-bag',    '#d6336c', true),
    (p_user_id, 'Saúde',            'expense', 'heart-pulse',     '#e03131', true),
    (p_user_id, 'Lazer',            'expense', 'popcorn',         '#f08c00', true),
    (p_user_id, 'Educação',         'expense', 'graduation-cap',  '#1971c2', true),
    (p_user_id, 'Assinaturas',      'expense', 'repeat',          '#5f3dc4', true),
    (p_user_id, 'Viagens',          'expense', 'plane',           '#0c8599', true),
    (p_user_id, 'Outros',           'expense', 'circle',          '#868e96', true),
    (p_user_id, 'Salário',          'income',  'briefcase',       '#2f9e44', true),
    (p_user_id, 'Freelance',        'income',  'laptop',          '#37b24d', true),
    (p_user_id, 'Investimentos',    'income',  'trending-up',     '#0ca678', true),
    (p_user_id, 'Vendas',           'income',  'tag',             '#66a80f', true),
    (p_user_id, 'Outros',           'income',  'circle',          '#868e96', true)
  on conflict do nothing;
end;
$$;

revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 80), '')
  )
  on conflict (user_id) do nothing;

  perform public.seed_default_categories(new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- RPCs (security invoker → RLS continua valendo)
-- =====================================================================

-- Confirma um rascunho do chat de forma atômica: cria a transação e
-- marca a mensagem como confirmada.
create or replace function public.confirm_draft(
  p_message_id   uuid,
  p_type         public.transaction_type,
  p_amount       numeric,
  p_category_id  uuid,
  p_description  text,
  p_date         date
)
returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.chat_messages;
  v_tx  public.transactions;
  v_currency char(3);
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select * into v_msg from public.chat_messages
   where id = p_message_id and user_id = v_uid
   for update;

  if not found then
    raise exception 'Mensagem não encontrada' using errcode = 'P0002';
  end if;
  if v_msg.draft_status is distinct from 'pending' then
    raise exception 'Este registro já foi processado' using errcode = '23505';
  end if;

  select currency into v_currency from public.profiles where user_id = v_uid;

  insert into public.transactions
    (user_id, category_id, type, amount, currency, description, transaction_date, source)
  values
    (v_uid, p_category_id, p_type, round(p_amount, 2), coalesce(v_currency, 'BRL'),
     left(btrim(coalesce(p_description, '')), 200), p_date, 'chat')
  returning * into v_tx;

  update public.chat_messages
     set draft_status = 'confirmed',
         transaction_id = v_tx.id,
         draft = draft || jsonb_build_object(
           'amount', v_tx.amount, 'category_id', v_tx.category_id,
           'description', v_tx.description, 'date', v_tx.transaction_date,
           'transaction_type', v_tx.type)
   where id = v_msg.id;

  return v_tx;
end;
$$;

-- Resumo de um período: totais, contagem e gastos por categoria
create or replace function public.finance_summary(p_start date, p_end date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with tx as (
    select t.* from public.transactions t
     where t.user_id = (select auth.uid())
       and t.transaction_date between p_start and p_end
  )
  select jsonb_build_object(
    'expense_total', coalesce((select sum(amount) from tx where type = 'expense'), 0),
    'income_total',  coalesce((select sum(amount) from tx where type = 'income'), 0),
    'count',         (select count(*) from tx),
    'by_category', coalesce((
      select jsonb_agg(row_to_json(x) order by x.total desc)
        from (
          select tx.category_id,
                 coalesce(c.name, 'Sem categoria') as name,
                 coalesce(c.color, '#868e96')      as color,
                 coalesce(c.icon, 'circle')        as icon,
                 sum(tx.amount)                    as total,
                 count(*)                          as count
            from tx
            left join public.categories c on c.id = tx.category_id
           where tx.type = 'expense'
           group by tx.category_id, c.name, c.color, c.icon
        ) x
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(row_to_json(d) order by d.day)
        from (
          select transaction_date as day,
                 sum(amount) filter (where type = 'expense') as expense,
                 sum(amount) filter (where type = 'income')  as income
            from tx
           group by transaction_date
        ) d
    ), '[]'::jsonb)
  );
$$;

-- Consulta usada pelo chat ("quanto gastei com Uber esse mês?")
create or replace function public.finance_query(
  p_start        date,
  p_end          date,
  p_type         public.transaction_type default null,
  p_category_id  uuid default null,
  p_search       text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', coalesce(sum(t.amount), 0),
    'count', count(*)
  )
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.transaction_date between p_start and p_end
    and (p_type is null or t.type = p_type)
    and (p_category_id is null or t.category_id = p_category_id)
    and (p_search is null or p_search = ''
         or t.description ilike '%' || replace(replace(replace(left(p_search, 60), '\', '\\'), '%', '\%'), '_', '\_') || '%');
$$;

-- Contagem de chamadas de IA recentes (rate limit)
create or replace function public.ai_usage_counts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'last_minute', count(*) filter (where created_at > now() - interval '1 minute'),
    'last_day',    count(*)
  )
  from public.ai_interpretations
  where user_id = (select auth.uid())
    and created_at > now() - interval '1 day';
$$;

revoke all on function public.confirm_draft(uuid, public.transaction_type, numeric, uuid, text, date) from public, anon;
revoke all on function public.finance_summary(date, date) from public, anon;
revoke all on function public.finance_query(date, date, public.transaction_type, uuid, text) from public, anon;
revoke all on function public.ai_usage_counts() from public, anon;

grant execute on function public.confirm_draft(uuid, public.transaction_type, numeric, uuid, text, date) to authenticated;
grant execute on function public.finance_summary(date, date) to authenticated;
grant execute on function public.finance_query(date, date, public.transaction_type, uuid, text) to authenticated;
grant execute on function public.ai_usage_counts() to authenticated;
