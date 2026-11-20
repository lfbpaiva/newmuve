alter table public.repasse_alertas drop constraint repasse_alertas_tipo_check;
alter table public.repasse_alertas
  add constraint repasse_alertas_tipo_check check (tipo in ('POSSIVEL_DUPLICIDADE', 'RESPOSTA_TARDIA', 'REPASSE_E_ESTORNO'));
alter table public.repasse_alertas add column detalhes jsonb;
alter table public.repasse_alertas
  add constraint repasse_alertas_detalhes check ((tipo = 'REPASSE_E_ESTORNO') = (detalhes is not null));

create unique index repasse_alertas_um_repasse_e_estorno on public.repasse_alertas (tentativa_id)
  where tipo = 'REPASSE_E_ESTORNO';

create function private.impedir_alteracao_de_alerta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'alertas de repasse nao podem ser alterados nem apagados';
end;
$$;

create trigger repasse_alertas_imutaveis
  before update or delete on public.repasse_alertas
  for each row execute function private.impedir_alteracao_de_alerta();
create trigger repasse_alertas_sem_truncate
  before truncate on public.repasse_alertas
  for each statement execute function private.impedir_alteracao_de_alerta();

revoke execute on function private.impedir_alteracao_de_alerta() from public, anon, authenticated, service_role;

create function public.registrar_repasse_e_estorno(p_tentativa_id uuid, p_ordem text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_payment public.payments;
  v_tentativa public.repasse_tentativas;
  v_detalhes jsonb;
  v_alerta uuid;
begin
  if p_ordem not in ('ESTORNO_ANTES_DA_CONCLUSAO', 'ESTORNO_DEPOIS_DA_CONCLUSAO', 'ANTERIOR_A_CONCILIACAO') then
    raise exception 'ordem de acontecimentos invalida';
  end if;
  select payment_id into v_payment_id from public.repasse_tentativas where id = p_tentativa_id;
  if not found then return false; end if;
  select * into v_payment from public.payments where id = v_payment_id for update;
  select * into v_tentativa from public.repasse_tentativas where id = p_tentativa_id for update;

  if v_payment.status <> 'ESTORNADO' or v_tentativa.estado <> 'CONCLUIDA' or v_tentativa.asaas_transfer_id is null then
    return false;
  end if;

  v_detalhes := jsonb_build_object(
    'ordem', p_ordem,
    'registrado_em', now(),
    'payment_id', v_payment.id,
    'event_id', v_payment.event_id,
    'tentativa_origem', v_tentativa.origem,
    'tentativa_encerrada_em', v_tentativa.encerrada_em,
    'asaas_transfer_id', v_tentativa.asaas_transfer_id,
    'refund_status', v_payment.refund_status,
    'refund_action', v_payment.refund_action,
    'valor_pago', v_payment.valor,
    'valor_cache', v_payment.valor_cache,
    'valor_retido', v_payment.multa_descontada,
    'valor_transferido', v_tentativa.valor,
    'valor_pendente', (
      select coalesce(sum(p.multa), 0) from public.penalties p where p.reserva_payment_id = v_payment.id
    ),
    'multas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'multa', p.multa,
        'reserva_payment_id', p.reserva_payment_id,
        'quitada_em', p.quitada_em,
        'payment_id', p.payment_id
      ) order by p.created_at, p.id)
      from public.penalties p
      where p.reserva_payment_id = v_payment.id or p.payment_id = v_payment.id
    ), '[]'::jsonb)
  );

  insert into public.repasse_alertas (tentativa_id, tipo, asaas_transfer_id, status_transferencia, detalhes)
  values (p_tentativa_id, 'REPASSE_E_ESTORNO', v_tentativa.asaas_transfer_id, 'DONE', v_detalhes)
  on conflict do nothing
  returning id into v_alerta;

  if v_alerta is null then return false; end if;

  update public.penalties
  set quitada_em = null, payment_id = null
  where reserva_payment_id = v_payment.id and payment_id = v_payment.id and quitada_em is not null;
  return true;
end;
$$;

create or replace function public.concluir_tentativa(p_tentativa_id uuid, p_transfer_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_payment public.payments;
  v_tentativa public.repasse_tentativas;
begin
  if p_transfer_id is null then return 'RECUSADA'; end if;
  select payment_id into v_payment_id from public.repasse_tentativas where id = p_tentativa_id;
  if not found then return 'RECUSADA'; end if;
  select * into v_payment from public.payments where id = v_payment_id for update;
  select * into v_tentativa from public.repasse_tentativas where id = p_tentativa_id for update;

  if v_tentativa.estado in ('FALHOU', 'AUSENCIA_CONFIRMADA') then
    perform public.registrar_alerta_repasse(p_tentativa_id, 'POSSIVEL_DUPLICIDADE', p_transfer_id, 'DONE');
    return 'ALERTA';
  end if;
  if v_tentativa.asaas_transfer_id is distinct from p_transfer_id then return 'RECUSADA'; end if;

  if v_payment.status = 'ESTORNADO' then
    if v_tentativa.estado <> 'CONCLUIDA' then
      update public.repasse_tentativas set estado = 'CONCLUIDA', encerrada_em = now() where id = p_tentativa_id;
      update public.payments
      set repasse_status = 'REPASSADO', repassado_em = coalesce(repassado_em, now())
      where id = v_payment_id;
    end if;
    perform public.registrar_repasse_e_estorno(p_tentativa_id, 'ESTORNO_ANTES_DA_CONCLUSAO');
    return 'REPASSE_E_ESTORNO';
  end if;

  update public.penalties
  set quitada_em = now(), payment_id = v_payment_id
  where reserva_payment_id = v_payment_id and quitada_em is null;

  if v_tentativa.estado = 'CONCLUIDA' then return 'JA_CONCLUIDA'; end if;

  update public.repasse_tentativas set estado = 'CONCLUIDA', encerrada_em = now() where id = p_tentativa_id;
  update public.payments set repasse_status = 'REPASSADO', repassado_em = now() where id = v_payment_id;
  return 'CONCLUIDA';
end;
$$;

create or replace function public.finalize_asaas_refund(p_payment_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_event public.events;
  v_payout_conflict boolean;
  v_musician_id uuid;
  v_tipo text;
  v_multa numeric(10, 2) := 0;
  v_penalty_id uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'pagamento nao encontrado'; end if;
  if v_payment.status = 'ESTORNADO' then return 'JA_PROCESSADO'; end if;
  if v_payment.status <> 'PAGO' and not (v_payment.refund_action = 'NENHUMA' and v_payment.status in ('PENDENTE', 'EXPIRADO', 'CANCELADO')) then
    raise exception 'pagamento nao esta elegivel para estorno';
  end if;

  v_payout_conflict := v_payment.repasse_status in ('PROCESSANDO', 'REPASSADO')
    or exists (
      select 1 from public.repasse_tentativas t
      where t.payment_id = p_payment_id and t.estado in ('SOLICITANDO', 'PENDENTE', 'INCONCLUSIVA', 'EM_VERIFICACAO')
    );
  select * into v_event from public.events where id = v_payment.event_id for update;
  v_musician_id := v_event.musico_contratado_id;

  if v_event.id is not null and v_event.status = 'CONTRATADO' and coalesce(v_payment.refund_action, 'CANCELAR') <> 'NENHUMA' then
    if v_payment.refund_action = 'REABRIR' and not v_payout_conflict then
      perform public.reopen_event(v_event.id);
    else
      update public.events set status = 'CANCELADO' where id = v_event.id;
    end if;
  end if;

  update public.payments
  set status = 'ESTORNADO',
      refund_status = 'CONFIRMADO',
      repasse_status = case when v_payout_conflict then repasse_status else null end
  where id = p_payment_id;

  update public.disputes
  set status = 'RESOLVIDA', resolvida_em = now()
  where event_id = v_payment.event_id and status = 'AGUARDANDO_ESTORNO';

  if v_payout_conflict then
    perform public.registrar_repasse_e_estorno(t.id, 'ESTORNO_DEPOIS_DA_CONCLUSAO')
    from public.repasse_tentativas t
    where t.payment_id = p_payment_id and t.estado = 'CONCLUIDA'
    order by t.encerrada_em, t.id;
    return 'REPASSE_CONFLITANTE';
  end if;

  if v_event.id is not null and v_musician_id is not null then
    if v_payment.refund_action = 'NAO_COMPARECIMENTO' then
      v_tipo := 'AUSENCIA';
      v_multa := round(v_payment.valor_cache * 20) / 100;
    elsif v_payment.refund_action = 'REABRIR'
      and v_payment.refund_requested_at is not null
      and v_event.inicio - v_payment.refund_requested_at <= interval '24 hours' then
      v_tipo := 'DESISTENCIA_TARDIA';
    end if;
  end if;

  if v_tipo is not null then
    insert into public.penalties (musician_id, event_id, tipo, multa, estorno_payment_id)
    values (v_musician_id, v_event.id, v_tipo, v_multa, p_payment_id)
    on conflict (estorno_payment_id) do nothing
    returning id into v_penalty_id;

    if v_penalty_id is not null then
      update public.musician_profiles
      set visibilidade_reduzida_ate = greatest(coalesce(visibilidade_reduzida_ate, now()), now() + interval '15 days')
      where user_id = v_musician_id;
      if not found then raise exception 'perfil do musico % nao encontrado', v_musician_id; end if;
    end if;
  end if;

  return 'CONFIRMADO';
end;
$$;

revoke execute on function public.registrar_repasse_e_estorno(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_repasse_e_estorno(uuid, text) to service_role;

do $$
begin
  perform public.registrar_repasse_e_estorno(t.id, 'ANTERIOR_A_CONCILIACAO')
  from public.repasse_tentativas t
  join public.payments p on p.id = t.payment_id
  where p.status = 'ESTORNADO' and t.estado = 'CONCLUIDA'
  order by t.encerrada_em, t.id;
end;
$$;
