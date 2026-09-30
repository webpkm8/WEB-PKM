-- Jalankan SEKALI di Supabase Dashboard -> SQL Editor.
-- Data cloud Web PKM dipisahkan berdasarkan auth.users.id.
create table if not exists public.user_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique(user_id, key)
);

alter table public.user_data enable row level security;

drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;

create policy "user_data_select_own" on public.user_data for select using (auth.uid() = user_id);
create policy "user_data_insert_own" on public.user_data for insert with check (auth.uid() = user_id);
create policy "user_data_update_own" on public.user_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_data_delete_own" on public.user_data for delete using (auth.uid() = user_id);

-- Supabase Dashboard -> Authentication -> Providers -> Email: ON.
-- Jika ingin akun langsung aktif tanpa klik email konfirmasi, matikan Confirm email.


-- FOTO PROFIL / AVATAR
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;
drop policy if exists "avatars_select_public" on storage.objects;

create policy "avatars_select_public"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatars_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
