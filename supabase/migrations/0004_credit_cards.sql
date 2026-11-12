-- =====================================================================
-- Cartões de crédito
-- O usuário cadastra seus cartões (dia de fechamento e de vencimento) e
-- liga cada despesa a um cartão. A fatura de cada mês é calculada no app
-- a partir das datas das compras; nada de fatura é guardado aqui.
-- Também adiciona "place" (onde foi a compra) às transações.
-- Só ADICIONA tabela e colunas: nada do que já existe muda.
-- =====================================================================

create table public.credit_cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 30),
  closing_day  smallint not null check (closing_day between 1 and 31),
  due_day      smallint not null check (due_day between 1 and 31),
  color        text not null default '#7048e8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- necessário para a FK composta em transactions (garante mesmo dono)
  unique (id, user_id)
);

create unique index credit_cards_user_name_uidx on public.credit_cards (user_id, lower(btrim(name)));

create trigger credit_cards_updated_at before update on public.credit_cards
  for each row execute function public.set_updated_at();

alter table public.credit_cards enable row level security;

create policy "credit_cards_select_own" on public.credit_cards
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "credit_cards_insert_own" on public.credit_cards
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "credit_cards_update_own" on public.credit_cards
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "credit_cards_delete_own" on public.credit_cards
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.credit_cards from anon;

-- ---------- transações: cartão e local ----------
-- Colunas opcionais: o registro de despesas (confirm_draft) continua igual.
alter table public.transactions
  add column card_id uuid,
  add column place   text check (place is null or char_length(place) <= 120),
  -- o cartão precisa ser do MESMO usuário; ao apagar o cartão as compras
  -- continuam, só card_id vira NULL
  add constraint transactions_card_owner_fk
    foreign key (card_id, user_id)
    references public.credit_cards (id, user_id)
    on delete set null (card_id),
  -- só despesa vai para a fatura
  add constraint transactions_card_expense_only
    check (card_id is null or type = 'expense');

create index transactions_user_card_date_idx
  on public.transactions (user_id, card_id, transaction_date desc)
  where card_id is not null;
