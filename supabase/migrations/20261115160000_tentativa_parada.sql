alter table public.repasse_tentativas add column pedido_enviado_em timestamptz;

update public.repasse_tentativas set pedido_enviado_em = solicitada_em where pedido_enviado_em is null;

create function public.registrar_pedido_enviado(p_tentativa_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_tentativa public.repasse_tentativas;
begin
  select payment_id into v_payment_id from public.repasse_tentativas where id = p_tentativa_id;
  if not found then return false; end if;
  perform 1 from public.payments where id = v_payment_id for update;
  select * into v_tentativa from public.repasse_tentativas where id = p_tentativa_id for update;

  if v_tentativa.estado <> 'SOLICITANDO' then return false; end if;
  update public.repasse_tentativas
  set pedido_enviado_em = coalesce(pedido_enviado_em, now())
  where id = p_tentativa_id;
  return true;
end;
$$;

create function public.marcar_tentativa_parada(p_tentativa_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_tentativa public.repasse_tentativas;
begin
  select payment_id into v_payment_id from public.repasse_tentativas where id = p_tentativa_id;
  if not found then return 'SEM_MUDANCA'; end if;
  perform 1 from public.payments where id = v_payment_id for update;
  select * into v_tentativa from public.repasse_tentativas where id = p_tentativa_id for update;

  if v_tentativa.estado <> 'SOLICITANDO' or v_tentativa.solicitada_em > now() - interval '10 minutes' then
    return 'SEM_MUDANCA';
  end if;
  if v_tentativa.pedido_enviado_em is null then
    perform public.encerrar_tentativa_sem_repasse(p_tentativa_id, v_payment_id, 'FALHOU');
    return 'FALHOU';
  end if;
  update public.repasse_tentativas set estado = 'INCONCLUSIVA' where id = p_tentativa_id;
  return 'INCONCLUSIVA';
end;
$$;

create or replace function public.marcar_solicitacoes_paradas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tentativa record;
  v_total integer := 0;
begin
  for v_tentativa in
    select id from public.repasse_tentativas
    where estado = 'SOLICITANDO' and solicitada_em <= now() - interval '10 minutes'
    order by solicitada_em
  loop
    if public.marcar_tentativa_parada(v_tentativa.id) <> 'SEM_MUDANCA' then v_total := v_total + 1; end if;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.registrar_pedido_enviado(uuid) from public, anon, authenticated;
revoke execute on function public.marcar_tentativa_parada(uuid) from public, anon, authenticated;
grant execute on function public.registrar_pedido_enviado(uuid) to service_role;
grant execute on function public.marcar_tentativa_parada(uuid) to service_role;
