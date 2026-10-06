-- Muve — transições de estado que precisam ser atômicas
-- (contratação após o pagamento e conclusão após a dupla confirmação).

-- O checkout consulta o status por polling; a publicação em tempo real não é usada.
alter publication supabase_realtime drop table public.payments;

-- Confirma um pagamento recebido e efetiva a contratação em uma única transação:
-- pagamento PAGO, evento CONTRATADO com o músico escolhido, candidatura aprovada
-- e demais candidaturas recusadas. É idempotente: repetir a chamada não altera nada.
--
-- Retornos:
--   CONTRATADO               contratação efetivada agora
--   JA_PROCESSADO            pagamento já estava confirmado
--   PAGAMENTO_NAO_ENCONTRADO cobrança desconhecida
--   EVENTO_INDISPONIVEL      dinheiro recebido, mas o evento não pode mais ser
--                            contratado (exige estorno manual)
create function public.confirm_asaas_payment(p_asaas_payment_id text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_event public.events;
  v_musician_id uuid;
begin
  select * into v_payment from public.payments
  where asaas_payment_id = p_asaas_payment_id
  for update;
  if not found then
    return 'PAGAMENTO_NAO_ENCONTRADO';
  end if;
  if v_payment.status = 'PAGO' then
    return 'JA_PROCESSADO';
  end if;

  select * into v_event from public.events where id = v_payment.event_id for update;
  select musician_id into v_musician_id from public.event_candidates where id = v_payment.candidate_id;

  if v_event.id is null or v_event.status <> 'ABERTO' or v_musician_id is null then
    return 'EVENTO_INDISPONIVEL';
  end if;

  update public.payments
  set status = 'PAGO', pago_em = now()
  where id = v_payment.id;

  update public.events
  set status = 'CONTRATADO', musico_contratado_id = v_musician_id
  where id = v_event.id;

  update public.event_candidates
  set status = case when id = v_payment.candidate_id then 'APROVADO' else 'RECUSADO' end::public.candidate_status
  where event_id = v_event.id;

  return 'CONTRATADO';
end;
$$;

revoke execute on function public.confirm_asaas_payment(text) from public, anon, authenticated;
grant execute on function public.confirm_asaas_payment(text) to service_role;

-- Dupla confirmação: quando músico e contratante confirmam a realização do show,
-- o evento passa a CONCLUIDO. Fica em trigger para valer mesmo se as duas
-- confirmações chegarem ao mesmo tempo.
create function private.conclude_event_when_both_confirm()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'CONTRATADO' and new.confirmacao_musico and new.confirmacao_contratante then
    new.status = 'CONCLUIDO';
  end if;
  return new;
end;
$$;

create trigger events_conclude_when_both_confirm
before update on public.events
for each row execute function private.conclude_event_when_both_confirm();
