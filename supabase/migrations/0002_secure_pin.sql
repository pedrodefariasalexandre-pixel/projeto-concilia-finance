-- 0002 — Trava de PIN com verifier fora do alcance do cliente.
-- O PIN é trava de INTERFACE sobre uma sessão já autenticada; não é camada de autorização RLS
-- das tabelas financeiras (decisão de produto registrada). Credencial fica em schema não exposto,
-- verificação e lockout só via RPCs SECURITY DEFINER.
--
-- NÃO APLICADA AUTOMATICAMENTE. Requer autorização explícita antes de `supabase db push`
-- ou aplicação remota via MCP/dashboard.

-- 1. pgcrypto no schema já usado pelo projeto; falha cedo se estiver em outro lugar.
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_extension e
      join pg_catalog.pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'pgcrypto'
       and n.nspname = 'extensions'
  ) then
    raise exception 'pgcrypto precisa estar instalado no schema extensions';
  end if;
end;
$$;

-- 2–3. Schema privado: não está na lista de schemas expostos pelo PostgREST e não recebe
-- os default privileges do Supabase (que só valem para public/storage/graphql).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

-- 4–6. Credencial. bcrypt embute o salt no verifier: não há coluna de salt.
create table private.pin_credentials (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  verifier        text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until    timestamptz
);

-- RLS ligada e SEM policies: nega tudo a qualquer papel que não seja o owner.
-- Sem FORCE ROW LEVEL SECURITY de propósito: o owner (postgres) precisa acessar via RPC.
alter table private.pin_credentials enable row level security;
revoke all on table private.pin_credentials from public, anon, authenticated, service_role;

-- 7a. Status: só "tem PIN?" e "quanto falta do bloqueio". Nunca o verifier.
create function public.get_pin_status()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_now          timestamptz;
  v_locked_until timestamptz;
  v_configured   boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select c.locked_until
    into v_locked_until
    from private.pin_credentials as c
   where c.user_id = v_uid;

  v_configured := found;
  v_now := clock_timestamp();

  return jsonb_build_object(
    'configured', v_configured,
    'retry_after_seconds',
      case
        when v_locked_until > v_now
          then ceil(extract(epoch from (v_locked_until - v_now)))::integer
      end
  );
end;
$$;

-- 7b. Cadastro: só CRIA. Nunca sobrescreve um PIN existente — sobrescrever seria bypass
-- trivial da tela de bloqueio por quem está com a sessão aberta.
create function public.set_pin(candidate_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if candidate_pin is null or candidate_pin !~ '^[0-9]{4,6}$' then
    return jsonb_build_object('status', 'invalid_format');
  end if;

  -- Atalho barato: não gasta bcrypt quando já existe credencial.
  perform 1 from private.pin_credentials as c where c.user_id = v_uid;
  if found then
    return jsonb_build_object('status', 'already_configured');
  end if;

  -- A PK resolve a corrida entre duas chamadas simultâneas: só uma insere.
  insert into private.pin_credentials (user_id, verifier)
  values (v_uid, extensions.crypt(candidate_pin, extensions.gen_salt('bf', 10)))
  on conflict (user_id) do nothing;

  if not found then
    return jsonb_build_object('status', 'already_configured');
  end if;

  return jsonb_build_object('status', 'ok');
end;
$$;

-- 7c. Verificação com lockout persistido. Estados normais são RETORNOS, nunca exceções:
-- uma exceção depois do UPDATE faria rollback e desfaria o incremento do contador.
create function public.verify_pin(candidate_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_now          timestamptz;
  v_verifier     text;
  v_failed       integer;
  v_locked_until timestamptz;
  v_attempts     integer;
  v_lock_seconds integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Formato inválido não pode acertar nenhum PIN: não conta tentativa nem toca na linha.
  if candidate_pin is null or candidate_pin !~ '^[0-9]{4,6}$' then
    return jsonb_build_object('status', 'invalid_format');
  end if;

  -- Serializa tentativas concorrentes do mesmo usuário.
  select c.verifier, c.failed_attempts, c.locked_until
    into v_verifier, v_failed, v_locked_until
    from private.pin_credentials as c
   where c.user_id = v_uid
     for update;

  if not found then
    return jsonb_build_object('status', 'not_configured');
  end if;

  -- Relógio lido DEPOIS de obter o lock; now() seria o início da transação.
  v_now := clock_timestamp();

  if v_locked_until > v_now then
    return jsonb_build_object(
      'status', 'locked',
      'retry_after_seconds', ceil(extract(epoch from (v_locked_until - v_now)))::integer
    );
  end if;

  if extensions.crypt(candidate_pin, v_verifier) = v_verifier then
    update private.pin_credentials
       set failed_attempts = 0,
           locked_until    = null
     where user_id = v_uid;
    return jsonb_build_object('status', 'success');
  end if;

  -- Contador limitado a 1000 (sem overflow); expoente limitado a 7 (30s * 2^7 > 1h).
  v_attempts := least(v_failed, 999) + 1;

  if v_attempts >= 5 then
    v_lock_seconds := least(30 * (1 << least(v_attempts - 5, 7)), 3600);
  end if;

  update private.pin_credentials
     set failed_attempts = v_attempts,
         locked_until    = case
                             when v_lock_seconds is not null
                               then v_now + make_interval(secs => v_lock_seconds)
                           end
   where user_id = v_uid;

  if v_lock_seconds is not null then
    return jsonb_build_object('status', 'locked', 'retry_after_seconds', v_lock_seconds);
  end if;

  return jsonb_build_object('status', 'invalid');
end;
$$;

-- Privilégios das RPCs. Os default privileges do Supabase dão EXECUTE DIRETO a anon,
-- authenticated e service_role (verificado em pg_default_acl): revogar só de PUBLIC não basta.
revoke all on function public.get_pin_status() from public, anon, authenticated, service_role;
revoke all on function public.set_pin(text)    from public, anon, authenticated, service_role;
revoke all on function public.verify_pin(text) from public, anon, authenticated, service_role;

grant execute on function public.get_pin_status() to authenticated;
grant execute on function public.set_pin(text)    to authenticated;
grant execute on function public.verify_pin(text) to authenticated;

-- 8–9. Remove o verifier antigo (editável pelo próprio usuário via RLS) e preserva
-- inactivity_minutes. Tabela verificada com 0 linhas antes desta migration: nada é perdido.
alter table public.app_settings
  drop column if exists pin_hash,
  drop column if exists pin_salt;

-- Impede desligar o auto-lock (o frontend trata <= 0 como "desativado") ou deixá-lo
-- aberto indefinidamente. Teto de 60 é proposta ajustável; default 5 é compatível.
alter table public.app_settings
  add constraint app_settings_inactivity_minutes_range
  check (inactivity_minutes between 1 and 60);
