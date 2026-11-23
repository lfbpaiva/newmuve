alter table public.musician_profiles
  add column redes_sociais jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(redes_sociais) = 'object'
      and redes_sociais - array['instagram', 'youtube', 'spotify', 'tiktok'] = '{}'::jsonb
      and length(redes_sociais::text) <= 1400
    );

grant select (redes_sociais) on public.musician_profiles to authenticated;
