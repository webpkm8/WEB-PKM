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
