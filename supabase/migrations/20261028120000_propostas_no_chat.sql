alter table public.candidate_messages
  add column tipo text not null default 'TEXTO' check (tipo in ('TEXTO', 'PROPOSTA')),
  add column valor numeric(10, 2) check (valor is null or valor >= 100),
  add column status_proposta text check (status_proposta in ('ABERTA', 'ACEITA', 'RECUSADA', 'SUBSTITUIDA')),
  add constraint candidate_messages_proposta_coerente check (
    (tipo = 'TEXTO' and valor is null and status_proposta is null)
    or (tipo = 'PROPOSTA' and valor is not null and status_proposta is not null)
  );

create unique index candidate_messages_uma_proposta_aberta on public.candidate_messages (candidate_id) where status_proposta = 'ABERTA';
