-- ENTER69 — CORREÇÃO DE SEGURANÇA PARA O PROJETO JÁ CONFIGURADO
-- Execute no Supabase SQL Editor ANTES de publicar o site final.
--
-- A política "Anyone can view songs" que foi criada manualmente expõe
-- pin_salt/pin_hash através da tabela songs. Remova-a.
drop policy if exists "Anyone can view songs" on public.songs;
drop policy if exists "Public can read songs" on public.songs;

-- Recria o catálogo público com apenas campos seguros.
drop view if exists public.public_songs;

create view public.public_songs as
select
  id,
  name,
  artist,
  category,
  file_path,
  cover_path,
  file_name,
  created_at
from public.songs;

grant select on public.public_songs to anon, authenticated;

-- Garante RLS na tabela sensível.
alter table public.songs enable row level security;

-- As políticas de INSERT/UPDATE/DELETE devem continuar limitadas aos
-- administradores cadastrados em public.admin_users.


-- ENTER69: correção da verificação do administrador para RLS e Storage.
create or replace function public.is_enter69_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_enter69_admin() from public;
grant execute on function public.is_enter69_admin() to authenticated;

drop policy if exists "Admins can insert songs" on public.songs;
create policy "Admins can insert songs"
on public.songs
for insert to authenticated
with check (public.is_enter69_admin());

drop policy if exists "Admins can update songs" on public.songs;
create policy "Admins can update songs"
on public.songs
for update to authenticated
using (public.is_enter69_admin())
with check (public.is_enter69_admin());

drop policy if exists "Admins can delete songs" on public.songs;
create policy "Admins can delete songs"
on public.songs
for delete to authenticated
using (public.is_enter69_admin());

drop policy if exists "Admins can manage ENTER69 files" on storage.objects;
create policy "Admins can manage ENTER69 files"
on storage.objects
for all to authenticated
using (
  bucket_id in ('music','covers')
  and public.is_enter69_admin()
)
with check (
  bucket_id in ('music','covers')
  and public.is_enter69_admin()
);
