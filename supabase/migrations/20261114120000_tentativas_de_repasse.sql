create table public.repasse_tentativas (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  origem text not null default 'ATUAL' check (origem in ('ATUAL', 'LEGADO')),
  estado text not null default 'SOLICITANDO'
    check (estado in ('SOLICITANDO', 'PENDENTE', 'INCONCLUSIVA', 'EM_VERIFICACAO', 'CONCLUIDA', 'FALHOU', 'AUSENCIA_CONFIRMADA')),
  referencia_externa text not null,
  asaas_transfer_id text,
  valor numeric(10, 2),
  solicitada_em timestamptz not null default now(),
  verificacao_iniciada_em timestamptz,
  encerrada_em timestamptz,
  created_at timestamptz not null default now(),
  constraint repasse_tentativas_referencia_atual check (origem = 'LEGADO' or referencia_externa = id::text),
  constraint repasse_tentativas_transferencia_obrigatoria check (estado not in ('PENDENTE', 'CONCLUIDA') or asaas_transfer_id is not null),
  constraint repasse_tentativas_ausencia_sem_transferencia check (estado not in ('EM_VERIFICACAO', 'AUSENCIA_CONFIRMADA') or asaas_transfer_id is null),
  constraint repasse_tentativas_verificacao_registrada check (estado not in ('EM_VERIFICACAO', 'AUSENCIA_CONFIRMADA') or verificacao_iniciada_em is not null),
  constraint repasse_tentativas_encerramento check ((estado in ('CONCLUIDA', 'FALHOU', 'AUSENCIA_CONFIRMADA')) = (encerrada_em is not null))
);

create unique index repasse_tentativas_uma_aberta on public.repasse_tentativas (payment_id)
  where estado in ('SOLICITANDO', 'PENDENTE', 'INCONCLUSIVA', 'EM_VERIFICACAO');
create unique index repasse_tentativas_transferencia on public.repasse_tentativas (asaas_transfer_id)
  where asaas_transfer_id is not null;
create index repasse_tentativas_payment_idx on public.repasse_tentativas (payment_id);
create index repasse_tentativas_solicitando_idx on public.repasse_tentativas (solicitada_em) where estado = 'SOLICITANDO';

create table public.repasse_decisoes (
  id uuid primary key default gen_random_uuid(),
  tentativa_id uuid not null references public.repasse_tentativas (id) on delete restrict,
  etapa text not null check (etapa in ('VERIFICACAO', 'CONFIRMACAO')),
  operador_nome_informado text not null check (char_length(btrim(operador_nome_informado)) between 3 and 120),
  identidade_autenticada boolean not null default false check (identidade_autenticada = false),
  declaracao text,
  referencia_buscada text not null,
  busca_desde date not null,
  busca_iniciada_em timestamptz not null,
  paginas_consultadas integer not null check (paginas_consultadas >= 1),
  transferencias_listadas integer not null check (transferencias_listadas >= 0),
  registrada_em timestamptz not null default now(),
  constraint repasse_decisoes_declaracao check ((etapa = 'CONFIRMACAO') = (declaracao is not null)),
  constraint repasse_decisoes_uma_por_etapa unique (tentativa_id, etapa)
);

create table public.repasse_alertas (
  id uuid primary key default gen_random_uuid(),
  tentativa_id uuid not null references public.repasse_tentativas (id) on delete restrict,
  tipo text not null check (tipo in ('POSSIVEL_DUPLICIDADE', 'RESPOSTA_TARDIA')),
  asaas_transfer_id text not null,
  status_transferencia text,
  created_at timestamptz not null default now(),
  constraint repasse_alertas_unico unique (tentativa_id, tipo, asaas_transfer_id)
);

alter table public.repasse_tentativas enable row level security;
alter table public.repasse_decisoes enable row level security;
alter table public.repasse_alertas enable row level security;
revoke all on public.repasse_tentativas, public.repasse_decisoes, public.repasse_alertas from anon, authenticated, service_role;
grant select on public.repasse_tentativas, public.repasse_decisoes, public.repasse_alertas to service_role;

create function public.importar_repasses_legados()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repetidas text;
  v_inseridas integer;
  v_total integer := 0;
begin
  select string_agg(transferencia, ', ' order by transferencia) into v_repetidas
  from (
    select transferencia
    from (
      select repasse_asaas_id as transferencia, id from public.payments where repasse_asaas_id is not null
      union
      select repasse_asaas_id_anterior, id from public.payments where repasse_asaas_id_anterior is not null
    ) registros
    group by transferencia
    having count(distinct id) > 1
  ) repetidas;
  if v_repetidas is not null then
    raise exception 'Transferências registradas em mais de um pagamento: %. Concilie manualmente antes de importar.', v_repetidas;
  end if;

  insert into public.repasse_tentativas (payment_id, origem, estado, referencia_externa, asaas_transfer_id, valor, solicitada_em, encerrada_em)
  select
    p.id,
    'LEGADO',
    case p.repasse_status when 'REPASSADO' then 'CONCLUIDA' when 'PROCESSANDO' then 'PENDENTE' else 'INCONCLUSIVA' end,
    p.id::text,
    p.repasse_asaas_id,
    p.valor_cache - p.multa_descontada,
    coalesce(p.pago_em, p.created_at),
    case when p.repasse_status = 'REPASSADO' then coalesce(p.repassado_em, now()) end
  from public.payments p
  where p.repasse_asaas_id is not null
    and not exists (select 1 from public.repasse_tentativas t where t.asaas_transfer_id = p.repasse_asaas_id)
    and not exists (
      select 1 from public.repasse_tentativas t
      where t.payment_id = p.id and t.estado in ('SOLICITANDO', 'PENDENTE', 'INCONCLUSIVA', 'EM_VERIFICACAO')
    );
  get diagnostics v_inseridas = row_count;
  v_total := v_total + v_inseridas;

  insert into public.repasse_tentativas (payment_id, origem, estado, referencia_externa, valor, solicitada_em)
  select p.id, 'LEGADO', 'INCONCLUSIVA', p.id::text, p.valor_cache - p.multa_descontada, coalesce(p.pago_em, p.created_at)
  from public.payments p
  where p.repasse_status = 'PROCESSANDO'
    and p.repasse_asaas_id is null
    and not exists (
      select 1 from public.repasse_tentativas t
      where t.payment_id = p.id and t.estado in ('SOLICITANDO', 'PENDENTE', 'INCONCLUSIVA', 'EM_VERIFICACAO')
    );
  get diagnostics v_inseridas = row_count;
  v_total := v_total + v_inseridas;

  insert into public.repasse_tentativas (payment_id, origem, estado, referencia_externa, asaas_transfer_id, solicitada_em, encerrada_em)
  select p.id, 'LEGADO', 'FALHOU', p.id::text, p.repasse_asaas_id_anterior, coalesce(p.pago_em, p.created_at), now()
  from public.payments p
  where p.repasse_asaas_id_anterior is not null
    and p.repasse_asaas_id_anterior is distinct from p.repasse_asaas_id
    and not exists (select 1 from public.repasse_tentativas t where t.asaas_transfer_id = p.repasse_asaas_id_anterior);
  get diagnostics v_inseridas = row_count;
  return v_total + v_inseridas;
end;
$$;

revoke execute on function public.importar_repasses_legados() from public, anon, authenticated, service_role;

select public.importar_repasses_legados();

drop function public.claim_payout(uuid);
drop function public.vincular_transferencia(uuid, text);
drop function public.concluir_repasse(uuid, text);
drop function public.falhar_repasse(uuid, text);

create function public.declaracao_ausencia_repasse()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Declaro que conferi no painel da Asaas que esta tentativa de repasse não gerou transferência. Entendo que as buscas automáticas e os prazos de espera reduzem o risco de Pix duplicado, mas não comprovam a ausência.'::text;
$$;

create function public.registrar_alerta_repasse(p_tentativa_id uuid, p_tipo text, p_transfer_id text, p_status text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.repasse_alertas (tentativa_id, tipo, asaas_transfer_id, status_transferencia)
  values (p_tentativa_id, p_tipo, p_transfer_id, p_status)
  on conflict on constraint repasse_alertas_unico do nothing;
$$;

create function public.claim_payout(p_payment_id uuid)
returns table (tentativa_id uuid, desconto numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_musician_id uuid;
  v_restante numeric(10, 2);
  v_total numeric(10, 2) := 0;
  v_fine record;
  v_tentativa uuid := gen_random_uuid();
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found
    or v_payment.status <> 'PAGO'
    or coalesce(v_payment.refund_status, '') = 'PROCESSANDO'
    or coalesce(v_payment.repasse_status::text, '') not in ('RETIDO', 'FALHOU')
    or v_payment.repasse_asaas_id is not null
    or exists (
      select 1 from public.repasse_tentativas t
      where t.payment_id = p_payment_id and t.estado in ('SOLICITANDO', 'PENDENTE', 'INCONCLUSIVA', 'EM_VERIFICACAO')
    ) then
    return query select null::uuid, coalesce(v_payment.multa_descontada, 0::numeric);
    return;
  end if;

  select e.musico_contratado_id into v_musician_id from public.events e where e.id = v_payment.event_id;

  if v_musician_id is not null then
    perform 1 from public.musician_profiles where user_id = v_musician_id for update;

    select coalesce(sum(p.multa), 0) into v_total
    from public.penalties p
    where p.reserva_payment_id = p_payment_id and p.quitada_em is null;

    if v_total = 0 then
      v_restante := v_payment.valor_cache;
      for v_fine in
        select p.id, p.multa
        from public.penalties p
        where p.musician_id = v_musician_id
          and p.quitada_em is null
          and p.reserva_payment_id is null
          and p.multa > 0
        order by p.created_at, p.id
        for update
      loop
        if v_fine.multa < v_restante then
          update public.penalties set reserva_payment_id = p_payment_id where id = v_fine.id;
          v_restante := v_restante - v_fine.multa;
          v_total := v_total + v_fine.multa;
        end if;
      end loop;
    end if;
  end if;

  insert into public.repasse_tentativas (id, payment_id, origem, estado, referencia_externa, valor)
  values (v_tentativa, p_payment_id, 'ATUAL', 'SOLICITANDO', v_tentativa::text, v_payment.valor_cache - v_total);

  update public.payments set repasse_status = 'PROCESSANDO', multa_descontada = v_total where id = p_payment_id;
  return query select v_tentativa, v_total;
end;
$$;

create function public.registrar_transferencia(p_tentativa_id uuid, p_transfer_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_tentativa public.repasse_tentativas;
  v_outra uuid;
begin
  if p_transfer_id is null or btrim(p_transfer_id) = '' then return 'RECUSADA'; end if;
  select payment_id into v_payment_id from public.repasse_tentativas where id = p_tentativa_id;
  if not found then return 'RECUSADA'; end if;
  perform 1 from public.payments where id = v_payment_id for update;
  select * into v_tentativa from public.repasse_tentativas where id = p_tentativa_id for update;

  if v_tentativa.asaas_transfer_id = p_transfer_id then return 'JA_REGISTRADA'; end if;

  select id into v_outra from public.repasse_tentativas where asaas_transfer_id = p_transfer_id;
  if v_outra is not null then return 'RECUSADA'; end if;

  if v_tentativa.estado in ('FALHOU', 'AUSENCIA_CONFIRMADA') then
    perform public.registrar_alerta_repasse(p_tentativa_id, 'RESPOSTA_TARDIA', p_transfer_id);
    return 'TARDIA';
  end if;

  if v_tentativa.asaas_transfer_id is not null then
    perform public.registrar_alerta_repasse(p_tentativa_id, 'POSSIVEL_DUPLICIDADE', p_transfer_id);
    return 'RECUSADA';
  end if;

  update public.repasse_tentativas
  set estado = 'PENDENTE', asaas_transfer_id = p_transfer_id
  where id = p_tentativa_id;
  update public.payments set repasse_asaas_id = p_transfer_id where id = v_payment_id;
  return 'REGISTRADA';
end;
$$;

create function public.marcar_tentativa_inconclusiva(p_tentativa_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
begin
  select payment_id into v_payment_id from public.repasse_tentativas where id = p_tentativa_id;
  if not found then return false; end if;
  perform 1 from public.payments where id = v_payment_id for update;
  update public.repasse_tentativas set estado = 'INCONCLUSIVA'
  where id = p_tentativa_id and estado = 'SOLICITANDO';
  return found;
end;
$$;

create function public.marcar_solicitacoes_paradas()
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
    if public.marcar_tentativa_inconclusiva(v_tentativa.id) then v_total := v_total + 1; end if;
  end loop;
  return v_total;
end;
$$;

create function public.concluir_tentativa(p_tentativa_id uuid, p_transfer_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_tentativa public.repasse_tentativas;
begin
  if p_transfer_id is null then return 'RECUSADA'; end if;
  select payment_id into v_payment_id from public.repasse_tentativas where id = p_tentativa_id;
  if not found then return 'RECUSADA'; end if;
  perform 1 from public.payments where id = v_payment_id for update;
  select * into v_tentativa from public.repasse_tentativas where id = p_tentativa_id for update;

  if v_tentativa.estado in ('FALHOU', 'AUSENCIA_CONFIRMADA') then
    perform public.registrar_alerta_repasse(p_tentativa_id, 'POSSIVEL_DUPLICIDADE', p_transfer_id, 'DONE');
    return 'ALERTA';
  end if;
  if v_tentativa.asaas_transfer_id is distinct from p_transfer_id then return 'RECUSADA'; end if;

  update public.penalties
  set quitada_em = now(), payment_id = v_payment_id
  where reserva_payment_id = v_payment_id and quitada_em is null;

  if v_tentativa.estado = 'CONCLUIDA' then return 'JA_CONCLUIDA'; end if;

  update public.repasse_tentativas set estado = 'CONCLUIDA', encerrada_em = now() where id = p_tentativa_id;
  update public.payments set repasse_status = 'REPASSADO', repassado_em = now() where id = v_payment_id;
  return 'CONCLUIDA';
end;
$$;

create function public.encerrar_tentativa_sem_repasse(p_tentativa_id uuid, p_payment_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.repasse_tentativas set estado = p_estado, encerrada_em = now() where id = p_tentativa_id;
  update public.payments
  set repasse_status = 'FALHOU', multa_descontada = 0, repasse_asaas_id = null
  where id = p_payment_id;
  update public.penalties
  set reserva_payment_id = null
  where reserva_payment_id = p_payment_id and quitada_em is null;
end;
$$;

create function public.falhar_tentativa(p_tentativa_id uuid, p_transfer_id text default null)
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

  if p_transfer_id is null then
    if v_tentativa.estado <> 'SOLICITANDO' or v_tentativa.asaas_transfer_id is not null then return false; end if;
  elsif v_tentativa.estado not in ('PENDENTE', 'INCONCLUSIVA') or v_tentativa.asaas_transfer_id is distinct from p_transfer_id then
    return false;
  end if;

  perform public.encerrar_tentativa_sem_repasse(p_tentativa_id, v_payment_id, 'FALHOU');
  return true;
end;
$$;

create function public.validar_busca_de_ausencia(
  p_tentativa public.repasse_tentativas,
  p_inicio_minimo timestamptz,
  p_referencia text,
  p_busca_desde date,
  p_busca_iniciada_em timestamptz,
  p_busca_completa boolean,
  p_paginas integer,
  p_listadas integer,
  p_encontradas integer
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if now() < p_inicio_minimo then return 'PRAZO_NAO_ATINGIDO'; end if;
  if p_busca_iniciada_em is null or p_busca_iniciada_em < p_inicio_minimo then return 'BUSCA_ANTES_DO_PRAZO'; end if;
  if p_busca_iniciada_em > now() or p_busca_iniciada_em < now() - interval '10 minutes' then return 'BUSCA_DESATUALIZADA'; end if;
  if p_busca_completa is not true or p_paginas is null or p_paginas < 1 or p_listadas is null or p_listadas < 0 then return 'BUSCA_INCOMPLETA'; end if;
  if p_encontradas is distinct from 0 then return 'TRANSFERENCIA_ENCONTRADA'; end if;
  if p_referencia is distinct from p_tentativa.referencia_externa then return 'REFERENCIA_DIVERGENTE'; end if;
  if p_busca_desde is null or p_busca_desde > (p_tentativa.solicitada_em at time zone 'UTC')::date - 1 then return 'JANELA_INSUFICIENTE'; end if;
  return null;
end;
$$;

create function public.iniciar_verificacao_ausencia(
  p_tentativa_id uuid,
  p_operador text,
  p_referencia text,
  p_busca_desde date,
  p_busca_iniciada_em timestamptz,
  p_busca_completa boolean,
  p_paginas integer,
  p_listadas integer,
  p_encontradas integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_tentativa public.repasse_tentativas;
  v_recusa text;
begin
  if p_operador is null or char_length(btrim(p_operador)) not between 3 and 120 then return 'OPERADOR_INVALIDO'; end if;
  select payment_id into v_payment_id from public.repasse_tentativas where id = p_tentativa_id;
  if not found then return 'TENTATIVA_NAO_ENCONTRADA'; end if;
  perform 1 from public.payments where id = v_payment_id for update;
  select * into v_tentativa from public.repasse_tentativas where id = p_tentativa_id for update;

  if v_tentativa.estado <> 'INCONCLUSIVA' then return 'ESTADO_INVALIDO'; end if;
  if v_tentativa.asaas_transfer_id is not null then return 'TRANSFERENCIA_CONHECIDA'; end if;

  v_recusa := public.validar_busca_de_ausencia(
    v_tentativa, v_tentativa.solicitada_em + interval '24 hours', p_referencia, p_busca_desde,
    p_busca_iniciada_em, p_busca_completa, p_paginas, p_listadas, p_encontradas
  );
  if v_recusa is not null then return v_recusa; end if;

  update public.repasse_tentativas
  set estado = 'EM_VERIFICACAO', verificacao_iniciada_em = now()
  where id = p_tentativa_id;
  insert into public.repasse_decisoes (tentativa_id, etapa, operador_nome_informado, referencia_buscada, busca_desde, busca_iniciada_em, paginas_consultadas, transferencias_listadas)
  values (p_tentativa_id, 'VERIFICACAO', btrim(p_operador), p_referencia, p_busca_desde, p_busca_iniciada_em, p_paginas, p_listadas);
  return 'VERIFICACAO_INICIADA';
end;
$$;

create function public.confirmar_ausencia(
  p_tentativa_id uuid,
  p_operador text,
  p_declaracao text,
  p_referencia text,
  p_busca_desde date,
  p_busca_iniciada_em timestamptz,
  p_busca_completa boolean,
  p_paginas integer,
  p_listadas integer,
  p_encontradas integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_payment public.payments;
  v_tentativa public.repasse_tentativas;
  v_recusa text;
begin
  if p_operador is null or char_length(btrim(p_operador)) not between 3 and 120 then return 'OPERADOR_INVALIDO'; end if;
  if p_declaracao is distinct from public.declaracao_ausencia_repasse() then return 'DECLARACAO_INVALIDA'; end if;
  select payment_id into v_payment_id from public.repasse_tentativas where id = p_tentativa_id;
  if not found then return 'TENTATIVA_NAO_ENCONTRADA'; end if;
  select * into v_payment from public.payments where id = v_payment_id for update;
  select * into v_tentativa from public.repasse_tentativas where id = p_tentativa_id for update;

  if v_tentativa.estado <> 'EM_VERIFICACAO' or v_payment.repasse_status is distinct from 'PROCESSANDO' then return 'ESTADO_INVALIDO'; end if;
  if v_tentativa.asaas_transfer_id is not null then return 'TRANSFERENCIA_CONHECIDA'; end if;
  if not exists (select 1 from public.repasse_decisoes where tentativa_id = p_tentativa_id and etapa = 'VERIFICACAO') then return 'VERIFICACAO_AUSENTE'; end if;

  v_recusa := public.validar_busca_de_ausencia(
    v_tentativa, v_tentativa.verificacao_iniciada_em + interval '1 hour', p_referencia, p_busca_desde,
    p_busca_iniciada_em, p_busca_completa, p_paginas, p_listadas, p_encontradas
  );
  if v_recusa is not null then return v_recusa; end if;

  perform public.encerrar_tentativa_sem_repasse(p_tentativa_id, v_payment.id, 'AUSENCIA_CONFIRMADA');
  insert into public.repasse_decisoes (tentativa_id, etapa, operador_nome_informado, declaracao, referencia_buscada, busca_desde, busca_iniciada_em, paginas_consultadas, transferencias_listadas)
  values (p_tentativa_id, 'CONFIRMACAO', btrim(p_operador), p_declaracao, p_referencia, p_busca_desde, p_busca_iniciada_em, p_paginas, p_listadas);
  return 'AUSENCIA_CONFIRMADA';
end;
$$;

revoke execute on function public.declaracao_ausencia_repasse() from public, anon, authenticated;
revoke execute on function public.registrar_alerta_repasse(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_payout(uuid) from public, anon, authenticated;
revoke execute on function public.registrar_transferencia(uuid, text) from public, anon, authenticated;
revoke execute on function public.marcar_tentativa_inconclusiva(uuid) from public, anon, authenticated;
revoke execute on function public.marcar_solicitacoes_paradas() from public, anon, authenticated;
revoke execute on function public.concluir_tentativa(uuid, text) from public, anon, authenticated;
revoke execute on function public.encerrar_tentativa_sem_repasse(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.falhar_tentativa(uuid, text) from public, anon, authenticated;
revoke execute on function public.validar_busca_de_ausencia(public.repasse_tentativas, timestamptz, text, date, timestamptz, boolean, integer, integer, integer) from public, anon, authenticated, service_role;
revoke execute on function public.iniciar_verificacao_ausencia(uuid, text, text, date, timestamptz, boolean, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.confirmar_ausencia(uuid, text, text, text, date, timestamptz, boolean, integer, integer, integer) from public, anon, authenticated;

grant execute on function public.declaracao_ausencia_repasse() to service_role;
grant execute on function public.registrar_alerta_repasse(uuid, text, text, text) to service_role;
grant execute on function public.claim_payout(uuid) to service_role;
grant execute on function public.registrar_transferencia(uuid, text) to service_role;
grant execute on function public.marcar_tentativa_inconclusiva(uuid) to service_role;
grant execute on function public.marcar_solicitacoes_paradas() to service_role;
grant execute on function public.concluir_tentativa(uuid, text) to service_role;
grant execute on function public.falhar_tentativa(uuid, text) to service_role;
grant execute on function public.iniciar_verificacao_ausencia(uuid, text, text, date, timestamptz, boolean, integer, integer, integer) to service_role;
grant execute on function public.confirmar_ausencia(uuid, text, text, text, date, timestamptz, boolean, integer, integer, integer) to service_role;
