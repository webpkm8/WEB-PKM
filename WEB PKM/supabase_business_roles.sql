-- Web PKM: Owner + UMKM shared business access
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  business_code text not null unique,
  name text not null default 'Usaha Saya',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','umkm')),
  business_id uuid references public.businesses(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);

drop policy if exists "business_select_member" on public.businesses;
create policy "business_select_member" on public.businesses for select using (
  owner_id = auth.uid() or exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.business_id = businesses.id
  )
);

-- Shared user_data is keyed by business, not by individual account.
alter table public.user_data add column if not exists business_id uuid references public.businesses(id) on delete cascade;

-- Backfill existing rows when profiles/businesses already exist.
update public.user_data ud
set business_id = p.business_id
from public.profiles p
where p.user_id = ud.user_id and ud.business_id is null;

create unique index if not exists user_data_business_key_unique on public.user_data(business_id, key);

-- Replace old per-user policies with member-based policies.
drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;

drop policy if exists "user_data_select_business" on public.user_data;
drop policy if exists "user_data_insert_business" on public.user_data;
drop policy if exists "user_data_update_business" on public.user_data;
drop policy if exists "user_data_delete_business" on public.user_data;

create policy "user_data_select_business" on public.user_data for select using (
  business_id is not null and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.business_id = user_data.business_id)
);
create policy "user_data_insert_business" on public.user_data for insert with check (
  business_id is not null and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.business_id = user_data.business_id)
);
create policy "user_data_update_business" on public.user_data for update using (
  business_id is not null and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.business_id = user_data.business_id)
) with check (
  business_id is not null and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.business_id = user_data.business_id)
);
create policy "user_data_delete_business" on public.user_data for delete using (
  business_id is not null and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.business_id = user_data.business_id)
);

create or replace function public.connect_business(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  p public.profiles;
  b public.businesses;
  code text := upper(trim(p_code));
begin
  if me is null then raise exception 'Anda belum login.'; end if;
  if code = '' then raise exception 'Kode usaha wajib diisi.'; end if;
  select * into p from public.profiles where user_id = me;
  if p.user_id is null then raise exception 'Profil akun belum tersedia.'; end if;
  select * into b from public.businesses where business_code = code;
  if b.id is null then raise exception 'Kode usaha tidak ditemukan.'; end if;
  if p.role = 'owner' and b.owner_id <> me then raise exception 'Kode usaha bukan milik akun Owner ini.'; end if;
  update public.profiles set business_id = b.id where user_id = me;
  return jsonb_build_object('role', p.role, 'business_id', b.id, 'business_code', b.business_code, 'owner_id', b.owner_id, 'name', b.name);
end;
$$;

grant execute on function public.connect_business(text) to authenticated;

-- Create profile/business for newly registered accounts.
create or replace function public.handle_new_webpkm_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_value text := coalesce(new.raw_user_meta_data->>'role','owner');
  code_value text := upper(trim(coalesce(new.raw_user_meta_data->>'business_code','')));
  business_id_value uuid;
  owner_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'business_name'),''), 'Usaha Saya');
begin
  if role_value not in ('owner','umkm') then role_value := 'owner'; end if;
  if role_value = 'owner' then
    if code_value = '' then
      code_value := 'OWN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    end if;
    insert into public.businesses(owner_id,business_code,name)
    values(new.id, code_value, owner_name)
    returning id into business_id_value;
  end if;
  insert into public.profiles(user_id,role,business_id) values(new.id,role_value,business_id_value)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_webpkm on auth.users;
create trigger on_auth_user_created_webpkm
after insert on auth.users
for each row execute function public.handle_new_webpkm_user();

-- Backfill existing users as Owners only when no profile exists.
do $$
declare r record; code text; bid uuid;
begin
  for r in select u.id, u.email, coalesce(nullif(trim(u.raw_user_meta_data->>'name'),''),'Usaha Saya') as nm from auth.users u left join public.profiles p on p.user_id=u.id where p.user_id is null loop
    code := 'OWN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    insert into public.businesses(owner_id,business_code,name) values(r.id,code,r.nm) returning id into bid;
    insert into public.profiles(user_id,role,business_id) values(r.id,'owner',bid);
  end loop;
end $$;

-- Backfill user_data for any accounts that now have a business.
update public.user_data ud set business_id = p.business_id from public.profiles p where p.user_id=ud.user_id and ud.business_id is null;
