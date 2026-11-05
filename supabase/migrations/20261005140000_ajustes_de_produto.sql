-- Muve — ajustes de produto decididos pelo grupo
--   * CPF ou CNPJ nos dois perfis; fim do bloqueio permanente de documentos
--   * chave Pix do músico, para o repasse do cachê
--   * endereço do evento, visível apenas às partes
--   * reputação do contratante
--   * comissão da plataforma, repasse e cancelamento de contratação

-- ---------------------------------------------------------------------------
-- Documento: CPF ou CNPJ para músicos e contratantes
-- ---------------------------------------------------------------------------

alter table public.musician_profiles rename column cpf to documento;
alter table public.musician_profiles drop constraint musician_profiles_cpf_check;
alter table public.musician_profiles rename constraint musician_profiles_cpf_key to musician_profiles_documento_key;
alter table public.musician_profiles add constraint musician_profiles_documento_check check (documento ~ '^(\d{11}|\d{14})$');

alter table public.contractor_profiles rename column cnpj to documento;
alter table public.contractor_profiles drop constraint contractor_profiles_cnpj_check;
alter table public.contractor_profiles rename constraint contractor_profiles_cnpj_key to contractor_profiles_documento_key;
alter table public.contractor_profiles add constraint contractor_profiles_documento_check check (documento ~ '^(\d{11}|\d{14})$');

-- Excluir a conta não impede mais um novo cadastro.
drop table public.blocked_documents;

-- ---------------------------------------------------------------------------
-- Chave Pix do músico (destino do repasse). Não é legível pelo cliente:
-- sem grant de coluna, só a API a acessa.
-- ---------------------------------------------------------------------------

alter table public.musician_profiles
  add column chave_pix_tipo text check (chave_pix_tipo in ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP')),
  add column chave_pix text check (length(chave_pix) between 1 and 140),
  add constraint musician_profiles_chave_pix_completa check ((chave_pix is null) = (chave_pix_tipo is null));

-- ---------------------------------------------------------------------------
-- Endereço do evento: tabela separada para não ser exposto no feed.
-- O dono lê direto; o músico contratado recebe pela API, após a contratação.
-- ---------------------------------------------------------------------------

create table public.event_locations (
  event_id uuid primary key references public.events (id) on delete cascade,
  endereco text not null check (length(trim(endereco)) between 5 and 200)
);

alter table public.event_locations enable row level security;
revoke all on public.event_locations from anon, authenticated;
grant all on public.event_locations to service_role;
grant select on public.event_locations to authenticated;

create policy "endereco visivel ao dono do evento" on public.event_locations
for select to authenticated
using (private.is_event_owner(event_id));

-- ---------------------------------------------------------------------------
-- Reputação do contratante (o músico vê antes de se inscrever)
-- ---------------------------------------------------------------------------

alter table public.contractor_profiles
  add column avaliacao_media numeric(3, 2) not null default 0 check (avaliacao_media between 0 and 5),
  add column total_avaliacoes integer not null default 0 check (total_avaliacoes >= 0);

grant select (avaliacao_media, total_avaliacoes) on public.contractor_profiles to authenticated;

-- Substitui refresh_musician_rating: mantém a média de quem foi avaliado, seja músico ou contratante.
create or replace function private.refresh_musician_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reviewed uuid := coalesce(new.reviewed_id, old.reviewed_id);
  v_total integer;
  v_media numeric(3, 2);
begin
  select count(*)::integer, coalesce(round(avg(rating), 2), 0)
  into v_total, v_media
  from public.reviews
  where reviewed_id = v_reviewed;

  update public.musician_profiles set total_avaliacoes = v_total, avaliacao_media = v_media where user_id = v_reviewed;
  update public.contractor_profiles set total_avaliacoes = v_total, avaliacao_media = v_media where user_id = v_reviewed;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Comissão e repasse
-- ---------------------------------------------------------------------------

-- RETIDO: pago pelo contratante, aguardando a conclusão do show.
-- PROCESSANDO: transferência ao músico solicitada. REPASSADO / FALHOU: resultado.
create type public.payout_status as enum ('RETIDO', 'PROCESSANDO', 'REPASSADO', 'FALHOU');

alter table public.payments
  -- valor = cachê + comissão da plataforma; o cachê é o que será repassado ao músico.
  add column valor_comissao numeric(10, 2) not null default 0 check (valor_comissao >= 0),
  add column valor_cache numeric(10, 2) generated always as (valor - valor_comissao) stored,
  add column repasse_status public.payout_status,
  add column repasse_asaas_id text unique,
  add column repassado_em timestamptz;

-- Passa a marcar o valor como RETIDO ao confirmar o pagamento.
create or replace function public.confirm_asaas_payment(p_asaas_payment_id text)
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
  set status = 'PAGO', pago_em = now(), repasse_status = 'RETIDO'
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

-- Cancelamento pelo músico contratado: o evento volta a aceitar candidaturas.
-- A candidatura de quem desistiu é removida e as recusadas voltam a ficar pendentes.
create function public.reopen_event(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_musician_id uuid;
begin
  select musico_contratado_id into v_musician_id
  from public.events
  where id = p_event_id and status = 'CONTRATADO'
  for update;
  if not found then
    raise exception 'evento % nao esta contratado', p_event_id;
  end if;

  delete from public.event_candidates where event_id = p_event_id and musician_id = v_musician_id;
  update public.event_candidates set status = 'PENDENTE' where event_id = p_event_id;
  update public.events
  set status = 'ABERTO', musico_contratado_id = null, confirmacao_musico = false, confirmacao_contratante = false
  where id = p_event_id;
end;
$$;

revoke execute on function public.reopen_event(uuid) from public, anon, authenticated;
grant execute on function public.reopen_event(uuid) to service_role;
