alter table public.events add column ausencia_informada_em timestamptz;

alter table public.events add constraint events_ausencia_depois_do_inicio
  check (ausencia_informada_em is null or ausencia_informada_em >= inicio);

create index events_ausencia_pendente_idx on public.events (ausencia_informada_em)
  where status = 'CONTRATADO' and ausencia_informada_em is not null;
