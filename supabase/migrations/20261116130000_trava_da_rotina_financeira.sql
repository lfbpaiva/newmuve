create table public.rotina_financeira_execucao (
  id smallint primary key default 1 check (id = 1),
  dono uuid,
  geracao bigint not null default 0 check (geracao >= 0),
  iniciada_em timestamptz,
  valida_ate timestamptz,
  ultimo_dono uuid,
  ultima_iniciada_em timestamptz,
  ultima_conclusao_em timestamptz,
  ultimo_resultado text check (ultimo_resultado in ('SUCESSO', 'FALHA', 'EXPIRADA')),
  ultimo_sucesso_em timestamptz,
  ultimo_erro text check (char_length(ultimo_erro) <= 500),
  constraint rotina_financeira_execucao_ativa check (
    (dono is null and iniciada_em is null and valida_ate is null)
    or (dono is not null and iniciada_em is not null and valida_ate is not null)
  )
);

insert into public.rotina_financeira_execucao (id) values (1);

alter table public.rotina_financeira_execucao enable row level security;
revoke all on public.rotina_financeira_execucao from anon, authenticated, service_role;
grant select on public.rotina_financeira_execucao to service_role;

create function public.adquirir_rotina_financeira(p_dono uuid, p_validade_segundos integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_geracao bigint;
begin
  if p_dono is null or p_validade_segundos is null or p_validade_segundos not between 30 and 3600 then
    raise exception 'parametros invalidos para a trava da rotina financeira';
  end if;

  update public.rotina_financeira_execucao
  set ultimo_dono = case when dono is null then ultimo_dono else dono end,
      ultima_iniciada_em = case when dono is null then ultima_iniciada_em else iniciada_em end,
      ultima_conclusao_em = case when dono is null then ultima_conclusao_em else valida_ate end,
      ultimo_resultado = case when dono is null then ultimo_resultado else 'EXPIRADA' end,
      ultimo_erro = case when dono is null then ultimo_erro else 'A execução anterior perdeu a validade sem encerrar.' end,
      dono = p_dono,
      geracao = geracao + 1,
      iniciada_em = now(),
      valida_ate = now() + make_interval(secs => p_validade_segundos)
  where id = 1 and (dono is null or valida_ate <= now())
  returning geracao into v_geracao;

  return v_geracao;
end;
$$;

create function public.renovar_rotina_financeira(p_dono uuid, p_geracao bigint, p_validade_segundos integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_validade_segundos is null or p_validade_segundos not between 30 and 3600 then
    raise exception 'parametros invalidos para a trava da rotina financeira';
  end if;

  update public.rotina_financeira_execucao
  set valida_ate = now() + make_interval(secs => p_validade_segundos)
  where id = 1 and dono = p_dono and geracao = p_geracao and valida_ate > now();

  return found;
end;
$$;

create function public.encerrar_rotina_financeira(p_dono uuid, p_geracao bigint, p_resultado text, p_erro text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_resultado is null or p_resultado not in ('SUCESSO', 'FALHA') then
    raise exception 'resultado invalido para a rotina financeira';
  end if;

  update public.rotina_financeira_execucao
  set ultimo_dono = dono,
      ultima_iniciada_em = iniciada_em,
      ultima_conclusao_em = now(),
      ultimo_resultado = p_resultado,
      ultimo_sucesso_em = case when p_resultado = 'SUCESSO' then now() else ultimo_sucesso_em end,
      ultimo_erro = case when p_resultado = 'SUCESSO' then null else left(coalesce(nullif(btrim(p_erro), ''), 'Falha sem detalhe.'), 500) end,
      dono = null,
      iniciada_em = null,
      valida_ate = null
  where id = 1 and dono = p_dono and geracao = p_geracao;

  return found;
end;
$$;

revoke execute on function public.adquirir_rotina_financeira(uuid, integer) from public, anon, authenticated;
revoke execute on function public.renovar_rotina_financeira(uuid, bigint, integer) from public, anon, authenticated;
revoke execute on function public.encerrar_rotina_financeira(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.adquirir_rotina_financeira(uuid, integer) to service_role;
grant execute on function public.renovar_rotina_financeira(uuid, bigint, integer) to service_role;
grant execute on function public.encerrar_rotina_financeira(uuid, bigint, text, text) to service_role;
