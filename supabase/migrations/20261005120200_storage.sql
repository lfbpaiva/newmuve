-- Muve — armazenamento de imagens
-- Buckets de leitura pública (as URLs são exibidas em cards e perfis). O envio
-- é feito somente pela API, com a service_role, por isso não há policies de
-- escrita em storage.objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('event-banners', 'event-banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
