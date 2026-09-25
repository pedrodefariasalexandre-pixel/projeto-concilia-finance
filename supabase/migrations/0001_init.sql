-- Concilia v3 — schema inicial. Uso single-user: cada linha pertence a auth.uid(), RLS liga tudo.
-- Nada de arquivo OFX bruto é armazenado aqui — só o lançamento já estruturado (decisão do requisito §9.2).

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  phone text,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  kind text not null default 'corrente', -- corrente | dinheiro | cartao_manual
  opening_balance_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  source text not null default 'manual', -- manual | ofx
  competency text, -- 'AAAA-MM'
  posted_on date,
  amount_cents bigint not null,
  description text not null,
  description_norm text not null default '',
  fitid text, -- identidade só dentro do arquivo importado; nunca usado como chave de memória entre meses
  installment_current int,
  installment_total int,
  category_id uuid references public.categories(id) on delete set null,
  ignored boolean not null default false,
  merge_pending boolean not null default false, -- grupo de FITID com 4+ linhas, aguardando revisão manual
  from_memory boolean not null default false,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
create index transactions_user_competency_idx on public.transactions (user_id, competency);

create table public.transaction_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  share_cents bigint not null,
  created_at timestamptz not null default now(),
  unique (transaction_id, person_id)
);

-- R2: chave nome normalizado + valor exato, nunca FITID (FITID não se repete entre meses).
create table public.memory_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  rule_key text not null, -- normalizeDescription(descricao) || '|' || amount_cents
  sample_description text not null default '',
  amount_cents bigint not null,
  category_id uuid references public.categories(id) on delete set null,
  person_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, rule_key)
);

create table public.fixed_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  description text not null,
  amount_cents bigint not null,
  category_id uuid references public.categories(id) on delete set null,
  person_ids uuid[] not null default '{}',
  installment_current int,
  installment_total int,
  active boolean not null default true,
  last_advanced_competency text,
  created_at timestamptz not null default now()
);

-- R3/R4: snapshot imutável do mês fechado + assinatura de dedup (R4) + chaves de item pra correspondência parcial.
create table public.closed_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  competency text not null,
  signature text not null,
  item_keys text[] not null default '{}',
  total_cents bigint not null default 0,
  snapshot jsonb not null,
  closed_at timestamptz not null default now(),
  unique (user_id, competency)
);

-- Trava adicional do PWA (P0): PIN em hash, nunca em texto puro.
create table public.app_settings (
  user_id uuid primary key references auth.users on delete cascade,
  pin_hash text,
  pin_salt text,
  inactivity_minutes int not null default 5,
  updated_at timestamptz not null default now()
);

-- RLS: dono só enxerga a própria linha, em toda tabela.
alter table public.people enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_people enable row level security;
alter table public.memory_rules enable row level security;
alter table public.fixed_charges enable row level security;
alter table public.closed_months enable row level security;
alter table public.app_settings enable row level security;

create policy "own people" on public.people for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own categories" on public.categories for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own accounts" on public.accounts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transactions" on public.transactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transaction_people" on public.transaction_people for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own memory_rules" on public.memory_rules for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own fixed_charges" on public.fixed_charges for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own closed_months" on public.closed_months for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own app_settings" on public.app_settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
