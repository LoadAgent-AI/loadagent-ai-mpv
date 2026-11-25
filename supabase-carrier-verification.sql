-- ============================================================================
-- LoadAgent-AI: Global Carrier Verification, Storage & Payment Security Schema
-- ============================================================================

-- 1. CARRIER PROFILES TABLE
create table if not exists public.carrier_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text not null check (char_length(btrim(email)) between 5 and 160),
  company_name text not null check (char_length(btrim(company_name)) between 2 and 160),
  mc_number text check (mc_number is null or char_length(btrim(mc_number)) <= 40),
  dot_number text check (dot_number is null or char_length(btrim(dot_number)) <= 40),
  doc_path text not null,
  doc_hash text not null check (char_length(doc_hash) = 64),
  status text not null default 'Pending Verification',
  is_verified boolean not null default false,
  free_counteroffers_used int not null default 0 check (free_counteroffers_used >= 0 and free_counteroffers_used <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mc_or_dot_required check (
    nullif(trim(coalesce(mc_number, '')), '') is not null
    or nullif(trim(coalesce(dot_number, '')), '') is not null
  )
);

-- 2. GLOBAL UNIQUENESS (Prevents duplicate MC, DOT, and repeated files across all users)
create unique index if not exists uq_carrier_mc_norm
  on public.carrier_profiles (upper(regexp_replace(mc_number, '[^A-Z0-9]', '', 'g')))
  where mc_number is not null and btrim(mc_number) <> '';

create unique index if not exists uq_carrier_dot_norm
  on public.carrier_profiles (upper(regexp_replace(dot_number, '[^A-Z0-9]', '', 'g')))
  where dot_number is not null and btrim(dot_number) <> '';

create unique index if not exists uq_carrier_doc_hash
  on public.carrier_profiles (doc_hash);

-- 3. PAYMENT / SUBSCRIPTION TABLE (Protected against client-side spoofing)
create table if not exists public.carrier_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_code text not null default 'free_trial',
  payment_status text not null default 'inactive', -- inactive | active | past_due | canceled
  provider text,
  provider_ref text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- 4. SECURITY TRIGGER FOR CARRIER PROFILES
-- Blocks users from self-verifying, tampering with status, or lowering used free counteroffers
create or replace function public.enforce_carrier_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.is_verified := false;
      new.status := 'Pending Verification';
      new.free_counteroffers_used := least(greatest(coalesce(new.free_counteroffers_used, 0), 0), 5);
      new.created_at := now();
    elsif tg_op = 'UPDATE' then
      new.user_id := old.user_id;
      new.created_at := old.created_at;

      -- Nobody except service_role/admin can flip is_verified to true
      if new.is_verified is distinct from old.is_verified then
        new.is_verified := old.is_verified;
      end if;

      -- Keep status aligned with verification state when not service_role
      if old.is_verified = false and new.is_verified = false then
        if new.status not like 'Rejected%' then
          new.status := 'Pending Verification';
        end if;
      end if;

      -- Free counteroffers (max 5) can only increment, never reset by client
      if coalesce(new.free_counteroffers_used, 0) < coalesce(old.free_counteroffers_used, 0) then
        new.free_counteroffers_used := old.free_counteroffers_used;
      end if;
      if coalesce(new.free_counteroffers_used, 0) > 5 then
        new.free_counteroffers_used := 5;
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_carrier_security on public.carrier_profiles;
create trigger trg_enforce_carrier_security
before insert or update on public.carrier_profiles
for each row execute function public.enforce_carrier_security();

-- 5. SECURITY TRIGGER FOR SUBSCRIPTIONS / PAYMENTS
-- Users can read their own plan, but cannot activate/modify payment status from browser
create or replace function public.enforce_subscription_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.plan_code := 'free_trial';
      new.payment_status := 'inactive';
      new.provider_ref := null;
      new.current_period_end := null;
    elsif tg_op = 'UPDATE' then
      new.user_id := old.user_id;
      new.plan_code := old.plan_code;
      new.payment_status := old.payment_status;
      new.provider := old.provider;
      new.provider_ref := old.provider_ref;
      new.current_period_end := old.current_period_end;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_subscription_security on public.carrier_subscriptions;
create trigger trg_enforce_subscription_security
before insert or update on public.carrier_subscriptions
for each row execute function public.enforce_subscription_security();

-- 6. ROW-LEVEL SECURITY (RLS) ON TABLES
alter table public.carrier_profiles enable row level security;
alter table public.carrier_subscriptions enable row level security;

drop policy if exists "carrier_profiles_select_own" on public.carrier_profiles;
create policy "carrier_profiles_select_own"
on public.carrier_profiles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "carrier_profiles_insert_own" on public.carrier_profiles;
create policy "carrier_profiles_insert_own"
on public.carrier_profiles for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "carrier_profiles_update_own" on public.carrier_profiles;
create policy "carrier_profiles_update_own"
on public.carrier_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "carrier_subscriptions_select_own" on public.carrier_subscriptions;
create policy "carrier_subscriptions_select_own"
on public.carrier_subscriptions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "carrier_subscriptions_insert_own" on public.carrier_subscriptions;
create policy "carrier_subscriptions_insert_own"
on public.carrier_subscriptions for insert
to authenticated
with check (auth.uid() = user_id);

-- 7. PRIVATE STORAGE BUCKET FOR VERIFICATION DOCUMENTS
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'carrier-docs',
  'carrier-docs',
  false,
  5242880, -- 5 MB limit
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- 8. STRICT STORAGE POLICIES (Users only access files inside <auth.uid()>/ folder)
drop policy if exists "carrier_docs_insert_own_folder" on storage.objects;
create policy "carrier_docs_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'carrier-docs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "carrier_docs_select_own_folder" on storage.objects;
create policy "carrier_docs_select_own_folder"
on storage.objects for select
to authenticated
using (
  bucket_id = 'carrier-docs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "carrier_docs_update_own_folder" on storage.objects;
create policy "carrier_docs_update_own_folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'carrier-docs'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'carrier-docs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "carrier_docs_delete_own_folder" on storage.objects;
create policy "carrier_docs_delete_own_folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'carrier-docs'
  and auth.uid()::text = (storage.foldername(name))[1]
);
