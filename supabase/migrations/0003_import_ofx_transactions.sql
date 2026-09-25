-- 0003 — Persistência atômica da importação de OFX.
-- A confirmação da revisão grava N transações + (opcionalmente) N grupos de transaction_people
-- em uma única chamada. Sem isso, cada insert seria uma requisição PostgREST separada e uma
-- falha no meio deixaria a importação parcialmente gravada — inaceitável pra dado financeiro.
--
-- SECURITY INVOKER (não DEFINER): a função roda com o papel de quem chamou (authenticated),
-- então as RLS policies de public.transactions e public.transaction_people (auth.uid() = user_id)
-- continuam valendo normalmente. A função só reúne os inserts numa única transação de banco —
-- não eleva privilégio nenhum. user_id nunca vem do payload: é sempre auth.uid().
--
-- account_id/category_id/person_id são validados explicitamente contra auth.uid() dentro da
-- função: a FK só garante que o id existe, não que pertence a quem chamou, e RLS de transactions
-- só protege a própria linha inserida (não as tabelas referenciadas por ela).
--
-- NÃO APLICADA AUTOMATICAMENTE. Requer autorização explícita antes de `supabase db push`
-- ou aplicação remota via MCP/dashboard.

create function public.import_ofx_transactions(payload jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_tx        jsonb;
  v_person    jsonb;
  v_people    jsonb;
  v_tx_id     uuid;
  v_amount    bigint;
  v_share_sum bigint;
  v_inserted  integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'payload precisa ser um array json' using errcode = '22023';
  end if;

  for v_tx in select * from jsonb_array_elements(payload)
  loop
    if coalesce(v_tx->>'description', '') = '' then
      raise exception 'description é obrigatória' using errcode = '22023';
    end if;

    v_amount := (v_tx->>'amount_cents')::bigint;
    v_people := coalesce(v_tx->'people', '[]'::jsonb);

    if jsonb_typeof(v_people) <> 'array' then
      raise exception 'people precisa ser um array json' using errcode = '22023';
    end if;

    -- FK só garante EXISTÊNCIA, não posse: sem isto, um account_id/category_id de outro usuário
    -- seria aceito (a RLS de transactions só valida o dono da própria linha inserida, não o dono
    -- das linhas referenciadas). SECURITY INVOKER não faz essa checagem sozinho.
    if nullif(v_tx->>'account_id', '') is not null then
      if not exists (
        select 1 from public.accounts a where a.id = (v_tx->>'account_id')::uuid and a.user_id = v_uid
      ) then
        raise exception 'account_id não pertence ao usuário autenticado' using errcode = '42501';
      end if;
    end if;

    if nullif(v_tx->>'category_id', '') is not null then
      if not exists (
        select 1 from public.categories c where c.id = (v_tx->>'category_id')::uuid and c.user_id = v_uid
      ) then
        raise exception 'category_id não pertence ao usuário autenticado' using errcode = '42501';
      end if;
    end if;

    -- Regra inegociável: soma dos rateios tem que fechar exatamente com o valor do lançamento.
    if jsonb_array_length(v_people) > 0 then
      select coalesce(sum((p->>'share_cents')::bigint), 0)
        into v_share_sum
        from jsonb_array_elements(v_people) as p;

      if v_share_sum <> v_amount then
        raise exception 'rateio inconsistente: soma % difere do valor %', v_share_sum, v_amount
          using errcode = '22023';
      end if;
    end if;

    insert into public.transactions (
      user_id, account_id, source, competency, posted_on, amount_cents,
      description, description_norm, fitid, installment_current, installment_total,
      category_id, ignored, merge_pending, from_memory
    ) values (
      v_uid,
      nullif(v_tx->>'account_id', '')::uuid,
      'ofx',
      nullif(v_tx->>'competency', ''),
      nullif(v_tx->>'posted_on', '')::date,
      v_amount,
      v_tx->>'description',
      coalesce(v_tx->>'description_norm', ''),
      nullif(v_tx->>'fitid', ''),
      nullif(v_tx->>'installment_current', '')::int,
      nullif(v_tx->>'installment_total', '')::int,
      nullif(v_tx->>'category_id', '')::uuid,
      coalesce((v_tx->>'ignored')::boolean, false),
      coalesce((v_tx->>'merge_pending')::boolean, false),
      coalesce((v_tx->>'from_memory')::boolean, false)
    )
    returning id into v_tx_id;

    if jsonb_array_length(v_people) > 0 then
      for v_person in select * from jsonb_array_elements(v_people)
      loop
        if not exists (
          select 1 from public.people p
           where p.id = (v_person->>'person_id')::uuid
             and p.user_id = v_uid
        ) then
          raise exception 'person_id não pertence ao usuário autenticado' using errcode = '42501';
        end if;

        insert into public.transaction_people (user_id, transaction_id, person_id, share_cents)
        values (v_uid, v_tx_id, (v_person->>'person_id')::uuid, (v_person->>'share_cents')::bigint);
      end loop;
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('status', 'ok', 'inserted', v_inserted);
end;
$$;

-- Mesma disciplina do 0002: default privileges do Supabase dão EXECUTE direto a anon/authenticated/
-- service_role, então revogar só de PUBLIC não basta. service_role fica de fora de propósito —
-- o app nunca usa a chave de serviço no frontend, e essa RPC depende de auth.uid() da sessão.
revoke all on function public.import_ofx_transactions(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.import_ofx_transactions(jsonb) to authenticated;
