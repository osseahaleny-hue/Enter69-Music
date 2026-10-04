-- ENTER69 — esquema Supabase
-- Para um projeto novo, execute este arquivo inteiro.
-- Para o projeto que já configurou seguindo as instruções, execute
-- security-fix.sql para remover a exposição dos hashes.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  artist text not null,
  category text not null,
  file_path text not null unique,
  cover_path text,
  file_name text not null,
  pin_salt text not null,
  pin_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.songs enable row level security;

revoke all on public.songs from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;

drop policy if exists "Admins can insert songs" on public.songs;
create policy "Admins can insert songs"
on public.songs for insert
to authenticated
with check (
  exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
);

drop policy if exists "Admins can update songs" on public.songs;
create policy "Admins can update songs"
on public.songs for update
to authenticated
using (
  exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
);

drop policy if exists "Admins can delete songs" on public.songs;
create policy "Admins can delete songs"
on public.songs for delete
to authenticated
using (
  exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
);

drop view if exists public.public_songs;
create view public.public_songs as
select id,name,artist,category,file_path,cover_path,file_name,created_at
from public.songs;

grant select on public.public_songs to anon, authenticated;

insert into storage.buckets (id,name,public)
values ('music','music',false)
on conflict (id) do update set public=false;

insert into storage.buckets (id,name,public)
values ('covers','covers',false)
on conflict (id) do update set public=false;

drop policy if exists "Admins can manage ENTER69 files" on storage.objects;
create policy "Admins can manage ENTER69 files"
on storage.objects for all
to authenticated
using (
  bucket_id in ('music','covers')
  and exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
)
with check (
  bucket_id in ('music','covers')
  and exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
);
