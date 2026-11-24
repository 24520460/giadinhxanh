-- Gia Dinh Xanh database schema
-- Supabase/PostgreSQL migration

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists btree_gist;
create extension if not exists postgis;

create type public.app_role as enum ('customer', 'worker', 'business', 'admin');
create type public.account_status as enum ('active', 'suspended', 'deleted');
create type public.business_status as enum ('active', 'suspended', 'deleted');
create type public.worker_status as enum ('active', 'suspended', 'deleted');
create type public.service_pricing_type as enum ('fixed', 'area', 'hour', 'survey');
create type public.service_status as enum ('active', 'suspended', 'deleted');
create type public.category_status as enum ('active', 'suspended', 'deleted');
create type public.booking_status as enum (
  'pending_confirmation',
  'confirmed',
  'surveying',
  'awaiting_customer_quote',
  'in_progress',
  'completed',
  'cancelled',
  'cancelled_no_agreement',
  'failed'
);
create type public.payment_status as enum ('pending', 'success', 'failed', 'refunded');
create type public.payment_method as enum ('qr_bank_transfer', 'pay_on_completion');
create type public.quote_status as enum ('pending', 'accepted', 'rejected', 'expired');
create type public.adjustment_status as enum ('pending', 'accepted', 'rejected', 'expired');
create type public.review_status as enum ('published', 'edited', 'moderated', 'deleted');
create type public.ticket_status as enum ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed');
create type public.ticket_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.dispute_status as enum ('open', 'under_review', 'resolved', 'rejected');

create sequence public.booking_code_seq start with 1;
create sequence public.support_ticket_seq start with 1;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'customer',
  account_status public.account_status not null default 'active',
  full_name text,
  phone text,
  avatar_url text,
  description text,
  must_change_password boolean not null default false,
  provisioned_by uuid references auth.users(id),
  provisioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provinces (
  code text primary key,
  name text not null,
  name_en text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wards (
  code text primary key,
  province_code text not null references public.provinces(code) on update cascade,
  name text not null,
  name_en text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  street_address text not null,
  province_code text not null references public.provinces(code),
  ward_code text not null references public.wards(code),
  latitude double precision,
  longitude double precision,
  location geography(point, 4326),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  default_address_id uuid references public.addresses(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.addresses
  add constraint addresses_location_present
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null));

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null unique references public.profiles(id),
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  phone text,
  email text,
  street_address text,
  province_code text references public.provinces(code),
  ward_code text references public.wards(code),
  latitude double precision,
  longitude double precision,
  location geography(point, 4326),
  status public.business_status not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  business_id uuid not null references public.businesses(id),
  street_address text,
  province_code text references public.provinces(code),
  ward_code text references public.wards(code),
  latitude double precision,
  longitude double precision,
  location geography(point, 4326),
  status public.worker_status not null default 'active',
  can_self_set_location boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_portfolio_images (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  image_url text not null,
  storage_path text,
  title text,
  description text,
  display_order integer not null default 0 check (display_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  status public.category_status not null default 'active',
  display_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name text not null,
  slug text not null,
  description text,
  pricing_type public.service_pricing_type not null,
  base_price numeric(14,2) not null default 0 check (base_price >= 0),
  initial_visit_fee numeric(14,2) not null default 0 check (initial_visit_fee >= 0),
  min_quantity numeric(12,2),
  max_quantity numeric(12,2),
  quantity_step numeric(12,2),
  unit_label text,
  estimated_duration_minutes integer not null default 60 check (estimated_duration_minutes > 0),
  area_rounding_step numeric(12,2),
  status public.service_status not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug),
  check (
    (pricing_type <> 'area' or min_quantity is not null)
    and (pricing_type <> 'hour' or min_quantity is not null)
  )
);

create table public.service_categories_map (
  service_id uuid not null references public.services(id) on delete cascade,
  category_id uuid not null references public.service_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (service_id, category_id)
);

create table public.service_images (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  image_url text not null,
  storage_path text,
  title text,
  display_order integer not null default 0 check (display_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_workers (
  service_id uuid not null references public.services(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (service_id, worker_id)
);

create table public.worker_schedules (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, day_of_week, start_minute, end_minute),
  check (end_minute > start_minute)
);

create table public.worker_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table public.booking_cancellations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  cancelled_by uuid not null references auth.users(id),
  reason text,
  pre_confirmation boolean not null,
  refund numeric(14,2) not null default 0 check (refund >= 0),
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique default ('GDX-' || lpad(nextval('public.booking_code_seq')::text, 6, '0')),
  customer_id uuid not null references public.customers(id),
  business_id uuid not null references public.businesses(id),
  service_id uuid not null references public.services(id),
  worker_id uuid not null references public.workers(id),
  address_id uuid references public.addresses(id),
  customer_street_address text not null,
  customer_province_code text not null references public.provinces(code),
  customer_ward_code text not null references public.wards(code),
  status public.booking_status not null default 'pending_confirmation',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  initial_quantity numeric(12,2),
  initial_unit_price numeric(14,2) not null check (initial_unit_price >= 0),
  initial_visit_fee numeric(14,2) not null default 0 check (initial_visit_fee >= 0),
  initial_total numeric(14,2) not null check (initial_total >= 0),
  final_quantity numeric(12,2),
  final_unit_price numeric(14,2),
  final_price numeric(14,2),
  final_total numeric(14,2),
  extra_fee numeric(14,2) not null default 0 check (extra_fee >= 0),
  customer_notes text,
  worker_notes text,
  cancellation_reason text,
  cancelled_at timestamptz,
  confirmed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  check (final_unit_price is null or final_unit_price >= 0),
  check (final_price is null or final_price >= 0),
  check (final_total is null or final_total >= 0)
);

alter table public.booking_cancellations
  add constraint booking_cancellations_booking_fkey
  foreign key (booking_id) references public.bookings(id) on delete cascade;

alter table public.bookings
  add constraint bookings_worker_time_exclusion
  exclude using gist (
    worker_id with =,
    tstzrange(scheduled_start, scheduled_end, '[)') with &&
  )
  where (status in (
    'pending_confirmation',
    'confirmed',
    'surveying',
    'awaiting_customer_quote',
    'in_progress'
  ));

create table public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  changed_by uuid references auth.users(id),
  reason text,
  created_at timestamptz not null default now()
);

create table public.booking_price_quotes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  worker_id uuid not null references public.workers(id),
  description text not null,
  proposed_unit_price numeric(14,2) not null check (proposed_unit_price >= 0),
  proposed_quantity numeric(12,2),
  proposed_final_price numeric(14,2) not null check (proposed_final_price >= 0),
  expires_at timestamptz,
  status public.quote_status not null default 'pending',
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.booking_quantity_adjustments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  worker_id uuid not null references public.workers(id),
  adjustment_type text not null check (adjustment_type in ('area', 'hours', 'duration', 'quantity', 'other')),
  description text,
  original_quantity numeric(12,2),
  proposed_quantity numeric(12,2),
  original_duration_minutes integer,
  proposed_duration_minutes integer,
  original_extra_fee numeric(14,2) not null default 0,
  proposed_extra_fee numeric(14,2) not null default 0,
  recalculated_unit_price numeric(14,2),
  recalculated_total numeric(14,2),
  proposed_scheduled_end timestamptz,
  status public.adjustment_status not null default 'pending',
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  transaction_reference text,
  qr_payload text,
  bank_name text,
  demo_account_number text,
  amount numeric(14,2) not null check (amount >= 0),
  initial_visit_fee_amount numeric(14,2) not null default 0,
  service_amount numeric(14,2) not null default 0,
  extra_fee_amount numeric(14,2) not null default 0,
  is boolean not null default true,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id),
  customer_id uuid not null references public.customers(id),
  worker_id uuid not null references public.workers(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  report_quality_issue boolean not null default false,
  status public.review_status not null default 'published',
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worker_reports (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id),
  reported_by uuid references auth.users(id),
  booking_id uuid references public.bookings(id),
  category text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.disciplinary_actions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id),
  business_id uuid not null references public.businesses(id),
  actor_profile_id uuid not null references public.profiles(id),
  action_type text not null check (action_type in ('warning', 'work_suspension', 'account_suspension')),
  reason text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  opened_by uuid not null references auth.users(id),
  reason text not null,
  status public.dispute_status not null default 'open',
  resolution text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default ('HT-' || lpad(nextval('public.support_ticket_seq')::text, 6, '0')),
  customer_id uuid references public.customers(id),
  booking_id uuid references public.bookings(id),
  subject text not null,
  description text,
  priority public.ticket_priority not null default 'medium',
  status public.ticket_status not null default 'open',
  assigned_to uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  message text not null,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.support_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  recipient_id uuid primary key references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_booking_enabled boolean not null default true,
  email_status_enabled boolean not null default true,
  email_adjustment_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Updated-at triggers
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','provinces','wards','addresses','customers','businesses','workers',
    'worker_portfolio_images','service_categories','services','service_images',
    'worker_schedules','worker_availability_exceptions','bookings','payments',
    'reviews','disputes','support_tickets','notification_preferences','platform_settings'
  ]
  loop
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end;
$$;

-- Keep geography fields synchronized with latitude/longitude.
create function public.set_geography_location()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.latitude is null or new.longitude is null then
    new.location = null;
  else
    new.location = st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  end if;
  return new;
end;
$$;

create trigger set_address_location
  before insert or update of latitude, longitude on public.addresses
  for each row execute function public.set_geography_location();

create trigger set_business_location
  before insert or update of latitude, longitude on public.businesses
  for each row execute function public.set_geography_location();

create trigger set_worker_location
  before insert or update of latitude, longitude on public.workers
  for each row execute function public.set_geography_location();

create function public.validate_ward_province()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ward_code is not null then
    if not exists (
      select 1
      from public.wards w
      where w.code = new.ward_code
        and w.province_code = new.province_code
    ) then
      raise exception 'Ward does not belong to the selected province';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_address_ward
  before insert or update of province_code, ward_code on public.addresses
  for each row execute function public.validate_ward_province();

create trigger validate_business_ward
  before insert or update of province_code, ward_code on public.businesses
  for each row execute function public.validate_ward_province();

create trigger validate_worker_ward
  before insert or update of province_code, ward_code on public.workers
  for each row execute function public.validate_ward_province();

-- Profile bootstrap and role helpers
create function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'admin', false);
$$;

create function public.is_business()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'business', false);
$$;

create function public.is_worker()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'worker', false);
$$;

create function public.is_customer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'customer', false);
$$;

create function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.customers where profile_id = auth.uid();
$$;

create function public.current_worker_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.workers where profile_id = auth.uid();
$$;

create function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.businesses where owner_profile_id = auth.uid();
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    role,
    full_name,
    phone,
    must_change_password
  )
  values (
    new.id,
    'customer',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'phone',
    false
  )
  on conflict (id) do update
    set full_name = coalesce(public.profiles.full_name, excluded.full_name),
        phone = coalesce(public.profiles.phone, excluded.phone);

  insert into public.customers (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.provisioned_profile_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.provisioning_profile', true), '') = 'true'
     or coalesce(current_setting('app.password_change', true), '') = 'true'
  then
    return new;
  end if;

  if auth.uid() is not null
     and not public.is_admin()
     and (
       old.role is distinct from new.role
       or old.account_status is distinct from new.account_status
       or old.must_change_password is distinct from new.must_change_password
       or old.provisioned_by is distinct from new.provisioned_by
       or old.provisioned_at is distinct from new.provisioned_at
     )
  then
    raise exception 'Role, account status and provisioning fields cannot be changed directly';
  end if;
  return new;
end;
$$;

create trigger protect_profile_account_fields
  before update on public.profiles
  for each row execute function public.provisioned_profile_guard();

create function public.mark_password_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.password_change', 'true', true);
  update public.profiles
  set must_change_password = false
  where id = auth.uid();
end;
$$;

-- Booking status history
create function public.record_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger record_booking_status_changes
  after insert or update on public.bookings
  for each row execute function public.record_booking_status();

create function public.validate_booking_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if public.is_admin() then
    return new;
  elsif public.is_worker() and old.worker_id = public.current_worker_id() then
    if new.status in ('confirmed','surveying','in_progress','completed','cancelled','cancelled_no_agreement') then
      return new;
    end if;
  elsif public.is_customer() and old.customer_id = public.current_customer_id() then
    if new.status = 'completed' then
      return new;
    end if;
    if old.status = 'pending_confirmation' and new.status = 'cancelled' then
      return new;
    end if;
  elsif public.is_business() and old.business_id = public.current_business_id() then
    if new.status in ('pending_confirmation','confirmed','cancelled','failed') then
      return new;
    end if;
  end if;

  raise exception 'Invalid booking status transition';
end;
$$;

create trigger validate_booking_status_transition_trigger
  before update of status on public.bookings
  for each row execute function public.validate_booking_status_transition();

create function public.protect_worker_account_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.business_id is distinct from new.business_id
     or old.status is distinct from new.status
     or old.deleted_at is distinct from new.deleted_at
  then
    if not public.is_admin() and not public.is_business() then
      raise exception 'Worker ownership and account status cannot be changed by a worker';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_worker_account_fields_trigger
  before update on public.workers
  for each row execute function public.protect_worker_account_fields();

create function public.protect_business_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.owner_profile_id is distinct from new.owner_profile_id
     or old.status is distinct from new.status
     or old.deleted_at is distinct from new.deleted_at
  then
    if not public.is_admin() then
      raise exception 'Only admins can change business ownership or account status';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_business_owner_trigger
  before update on public.businesses
  for each row execute function public.protect_business_owner();

-- Prevent day-off overlaps with active bookings
create function public.check_availability_exception_conflict()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.bookings b
    where b.worker_id = new.worker_id
      and b.status in ('confirmed','surveying','awaiting_customer_quote','in_progress')
      and b.scheduled_start < new.end_at
      and b.scheduled_end > new.start_at
  ) then
    raise exception 'Cannot create a day-off exception that overlaps a confirmed booking';
  end if;
  return new;
end;
$$;

create trigger check_worker_availability_exception
  before insert or update on public.worker_availability_exceptions
  for each row execute function public.check_availability_exception_conflict();

-- Atomic booking creation
create function public.create_booking(
  p_service_id uuid,
  p_worker_id uuid,
  p_address_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_initial_quantity numeric default null,
  p_initial_unit_price numeric default null,
  p_initial_visit_fee numeric default null,
  p_customer_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_service public.services%rowtype;
  v_worker public.workers%rowtype;
  v_address public.addresses%rowtype;
  v_unit_price numeric;
  v_visit_fee numeric;
  v_initial_total numeric;
  v_start_local time;
  v_day integer;
  v_start_minute integer;
  v_end_minute integer;
  v_booking_id uuid;
begin
  if not public.is_customer() then
    raise exception 'Only customers can create bookings';
  end if;
  
  v_customer_id := public.current_customer_id();
  if v_customer_id is null then
    raise exception 'Customer profile not found';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
    and status = 'active'
    and deleted_at is null
  for update;
  if not found then raise exception 'Service is unavailable'; end if;

  select * into v_worker
  from public.workers
  where id = p_worker_id
    and status = 'active'
    and deleted_at is null
  for update;
  if not found then raise exception 'Worker is unavailable'; end if;

  if v_worker.business_id <> v_service.business_id then
    raise exception 'Worker is not employed by this service business';
  end if;

  if not exists (
    select 1 from public.service_workers sw
    where sw.service_id = p_service_id
      and sw.worker_id = p_worker_id
      and sw.active
  ) then
    raise exception 'Worker does not provide this service';
  end if;

  if p_address_id is not null then
    select * into v_address
    from public.addresses
    where id = p_address_id
      and user_id = auth.uid()
      and deleted_at is null;
    if not found then raise exception 'Address is unavailable'; end if;
  else
    raise exception 'Address is required';
  end if;

  if p_scheduled_end <= p_scheduled_start then
    raise exception 'Invalid booking time range';
  end if;

  v_start_local := (timezone('Asia/Ho_Chi_Minh', p_scheduled_start))::time;
  v_day := extract(dow from timezone('Asia/Ho_Chi_Minh', p_scheduled_start))::integer;
  v_start_minute := extract(hour from v_start_local)::integer * 60 + extract(minute from v_start_local)::integer;
  v_end_minute := v_start_minute + ceil(extract(epoch from (p_scheduled_end - p_scheduled_start)) / 60)::integer;

  if not exists (
    select 1
    from public.worker_schedules ws
    where ws.worker_id = p_worker_id
      and ws.active
      and ws.day_of_week = v_day
      and ws.start_minute <= v_start_minute
      and ws.end_minute >= v_end_minute
  ) then
    raise exception 'Worker is not scheduled for this time';
  end if;

  if exists (
    select 1
    from public.worker_availability_exceptions wae
    where wae.worker_id = p_worker_id
      and wae.start_at < p_scheduled_end
      and wae.end_at > p_scheduled_start
  ) then
    raise exception 'Worker is unavailable for this time';
  end if;

  v_unit_price := coalesce(p_initial_unit_price, v_service.base_price);
  v_visit_fee := coalesce(p_initial_visit_fee, v_service.initial_visit_fee);

  if v_service.pricing_type = 'area' then
    if p_initial_quantity is null or p_initial_quantity <= 0 then
      raise exception 'Area quantity is required';
    end if;
    if v_service.min_quantity is not null and p_initial_quantity < v_service.min_quantity then
      raise exception 'Area quantity is below the minimum';
    end if;
    if v_service.max_quantity is not null and p_initial_quantity > v_service.max_quantity then
      raise exception 'Area quantity is above the maximum';
    end if;
  elsif v_service.pricing_type = 'hour' then
    if p_initial_quantity is null or p_initial_quantity <= 0 then
      raise exception 'Hour quantity is required';
    end if;
  end if;

  v_initial_total :=
    case
      when v_service.pricing_type in ('area','hour') then round(coalesce(p_initial_quantity, 1) * v_unit_price, 2)
      when v_service.pricing_type = 'survey' then v_visit_fee
      else v_unit_price
    end;

  insert into public.bookings (
    customer_id, business_id, service_id, worker_id, address_id,
    customer_street_address, customer_province_code, customer_ward_code,
    scheduled_start, scheduled_end, initial_quantity, initial_unit_price,
    initial_visit_fee, initial_total, customer_notes
  )
  values (
    v_customer_id, v_service.business_id, p_service_id, p_worker_id, p_address_id,
    v_address.street_address, v_address.province_code, v_address.ward_code,
    p_scheduled_start, p_scheduled_end, p_initial_quantity, v_unit_price,
    v_visit_fee, v_initial_total, p_customer_notes
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

-- Customer cancellation before worker confirmation
create function public.cancel_booking_pre_confirmation(p_booking_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then raise exception 'Booking not found'; end if;
  if v_booking.customer_id <> public.current_customer_id() then
    raise exception 'Only the booking customer can cancel this booking';
  end if;
  if v_booking.status <> 'pending_confirmation' then
    raise exception 'Booking can only be cancelled before worker confirmation';
  end if;

  insert into public.booking_cancellations (
    booking_id, cancelled_by, reason, pre_confirmation, refund
  )
  values (
    p_booking_id, auth.uid(), p_reason, true, v_booking.initial_total
  );

  update public.bookings
  set status = 'cancelled',
      cancellation_reason = p_reason,
      cancelled_at = now(),
      updated_at = now()
  where id = p_booking_id;
end;
$$;

create function public.transition_booking_status(
  p_booking_id uuid,
  p_to_status public.booking_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then raise exception 'Booking not found'; end if;

  if public.is_worker() and v_booking.worker_id = public.current_worker_id() then
    if p_to_status not in ('confirmed','surveying','in_progress','completed','cancelled','cancelled_no_agreement') then
      raise exception 'Invalid worker booking transition';
    end if;
  elsif public.is_customer() and v_booking.customer_id = public.current_customer_id() then
    if p_to_status <> 'completed' then
      raise exception 'Customers can only confirm completion';
    end if;
  elsif public.is_business() and v_booking.business_id = public.current_business_id() then
    if p_to_status not in ('confirmed','cancelled','failed') then
      raise exception 'Invalid business booking transition';
    end if;
  elsif not public.is_admin() then
    raise exception 'Not authorized to change booking status';
  end if;

  update public.bookings
  set status = p_to_status,
      confirmed_at = case when p_to_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
      started_at = case when p_to_status = 'in_progress' then coalesce(started_at, now()) else started_at end,
      completed_at = case when p_to_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
      cancellation_reason = case when p_to_status in ('cancelled','cancelled_no_agreement','failed') then p_reason else cancellation_reason end,
      cancelled_at = case when p_to_status in ('cancelled','cancelled_no_agreement','failed') then coalesce(cancelled_at, now()) else cancelled_at end,
      updated_at = now(),
      version = version + 1
  where id = p_booking_id;
end;
$$;

create function public.reassign_booking(p_booking_id uuid, p_new_worker_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_worker public.workers%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then raise exception 'Booking not found'; end if;
  if not public.is_admin()
     and (not public.is_business() or v_booking.business_id <> public.current_business_id()) then
    raise exception 'Only the owning business or admin can reassign';
  end if;
  if v_booking.status not in ('pending_confirmation','confirmed') then
    raise exception 'Booking cannot be reassigned after work starts';
  end if;

  select * into v_worker
  from public.workers
  where id = p_new_worker_id
    and business_id = v_booking.business_id
    and status = 'active'
    and deleted_at is null;
  if not found then raise exception 'Replacement worker is unavailable'; end if;

  update public.bookings
  set worker_id = p_new_worker_id,
      status = 'pending_confirmation',
      updated_at = now(),
      version = version + 1
  where id = p_booking_id;
end;
$$;

-- Worker submits a booking adjustment
create function public.submit_booking_adjustment(
  p_booking_id uuid,
  p_adjustment_type text,
  p_description text,
  p_original_quantity numeric default null,
  p_proposed_quantity numeric default null,
  p_original_duration_minutes integer default null,
  p_proposed_duration_minutes integer default null,
  p_proposed_extra_fee numeric default 0,
  p_proposed_scheduled_end timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_worker_id uuid;
  v_recalculated_total numeric;
  v_adjustment_id uuid;
begin
  v_worker_id := public.current_worker_id();
  if v_worker_id is null then raise exception 'Worker profile not found'; end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then raise exception 'Booking not found'; end if;
  if v_booking.worker_id <> v_worker_id then
    raise exception 'Worker is not assigned to this booking';
  end if;
  if p_proposed_extra_fee is null or p_proposed_extra_fee < 0 then
    raise exception 'Invalid extra fee';
  end if;

  v_recalculated_total :=
    coalesce(v_booking.initial_total, 0)
    + p_proposed_extra_fee
    + coalesce(
      (coalesce(p_proposed_quantity, v_booking.initial_quantity) -
       coalesce(p_original_quantity, v_booking.initial_quantity)) *
      v_booking.initial_unit_price,
      0
    );

  insert into public.booking_quantity_adjustments (
    booking_id, worker_id, adjustment_type, description,
    original_quantity, proposed_quantity, original_duration_minutes,
    proposed_duration_minutes, original_extra_fee, proposed_extra_fee,
    recalculated_unit_price, recalculated_total, proposed_scheduled_end
  )
  values (
    p_booking_id, v_worker_id, p_adjustment_type, p_description,
    p_original_quantity, p_proposed_quantity, p_original_duration_minutes,
    p_proposed_duration_minutes, v_booking.extra_fee, p_proposed_extra_fee,
    v_booking.initial_unit_price, v_recalculated_total, p_proposed_scheduled_end
  )
  returning id into v_adjustment_id;

  return v_adjustment_id;
end;
$$;

-- Customer accepts or rejects a worker adjustment
create function public.respond_booking_adjustment(
  p_adjustment_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adjustment public.booking_quantity_adjustments%rowtype;
  v_booking public.bookings%rowtype;
begin
  select * into v_adjustment
  from public.booking_quantity_adjustments
  where id = p_adjustment_id
  for update;
  if not found then raise exception 'Adjustment not found'; end if;
  if v_adjustment.status <> 'pending' then
    raise exception 'Adjustment has already been responded to';
  end if;

  select * into v_booking
  from public.bookings
  where id = v_adjustment.booking_id
  for update;
  if v_booking.customer_id <> public.current_customer_id() then
    raise exception 'Only the booking customer can respond';
  end if;

  if p_accept then
    update public.booking_quantity_adjustments
    set status = 'accepted',
        responded_by = auth.uid(),
        responded_at = now()
    where id = p_adjustment_id;

    update public.bookings
    set final_quantity = coalesce(v_adjustment.proposed_quantity, final_quantity),
        final_unit_price = coalesce(v_adjustment.recalculated_unit_price, final_unit_price),
        extra_fee = v_adjustment.proposed_extra_fee,
        final_total = v_adjustment.recalculated_total,
        scheduled_end = coalesce(v_adjustment.proposed_scheduled_end, scheduled_end),
        updated_at = now(),
        version = version + 1
    where id = v_adjustment.booking_id;
  else
    update public.booking_quantity_adjustments
    set status = 'rejected',
        responded_by = auth.uid(),
        responded_at = now()
    where id = p_adjustment_id;
  end if;
end;
$$;

-- Simulated QR bank transfer payment
create function public.create_payment(
  p_booking_id uuid,
  p_transaction_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_payment_id uuid;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.customer_id <> public.current_customer_id() then
    raise exception 'Only the booking customer can pay';
  end if;

  insert into public.payments (
    booking_id,
    customer_id,
    method,
    status,
    transaction_reference,
    qr_payload,
    bank_name,
    demo_account_number,
    amount,
    initial_visit_fee_amount,
    service_amount,
    extra_fee_amount,
    is
  )
  values (
    p_booking_id,
    v_booking.customer_id,
    'qr_bank_transfer',
    'pending',
    p_transaction_reference,
    'GDX|' || v_booking.booking_code || '|' || coalesce(v_booking.final_total, v_booking.initial_total)::text,
    'Demo Bank',
    '0123456789',
    coalesce(v_booking.final_total, v_booking.initial_total),
    v_booking.initial_visit_fee,
    coalesce(v_booking.final_price, v_booking.initial_total),
    v_booking.extra_fee,
    true
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create function public.confirm_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.customer_id <> public.current_customer_id() then
    raise exception 'Only the booking customer can confirm payment';
  end if;
  if not v_payment.is then raise exception 'Only simulated payments are allowed'; end if;

  update public.payments
  set status = 'success',
      paid_at = now(),
      updated_at = now()
  where id = p_payment_id;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.provinces enable row level security;
alter table public.wards enable row level security;
alter table public.addresses enable row level security;
alter table public.customers enable row level security;
alter table public.businesses enable row level security;
alter table public.workers enable row level security;
alter table public.worker_portfolio_images enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.service_categories_map enable row level security;
alter table public.service_images enable row level security;
alter table public.service_workers enable row level security;
alter table public.worker_schedules enable row level security;
alter table public.worker_availability_exceptions enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_cancellations enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.booking_price_quotes enable row level security;
alter table public.booking_quantity_adjustments enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.worker_reports enable row level security;
alter table public.disciplinary_actions enable row level security;
alter table public.disputes enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.platform_settings enable row level security;
alter table public.audit_logs enable row level security;

-- Public/read and owner policies
create policy "profiles_public_or_self" on public.profiles for select
using (
  id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.workers w where w.profile_id = profiles.id and w.deleted_at is null)
  or exists (select 1 from public.businesses b where b.owner_profile_id = profiles.id and b.deleted_at is null)
);

create policy "profiles_update_self" on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "provinces_read" on public.provinces for select using (active);
create policy "wards_read" on public.wards for select using (active);

create policy "addresses_owner" on public.addresses for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "customers_owner" on public.customers for select
using (profile_id = auth.uid() or public.is_admin());

create policy "customer_update_owner" on public.customers for update
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "businesses_public_or_owner" on public.businesses for select
using (status = 'active' and deleted_at is null or owner_profile_id = auth.uid() or public.is_admin());

create policy "businesses_owner_update" on public.businesses for update
using (owner_profile_id = auth.uid() or public.is_admin())
with check (owner_profile_id = auth.uid() or public.is_admin());

create policy "businesses_admin_insert" on public.businesses for insert
with check (public.is_admin());

create policy "workers_public_or_related" on public.workers for select
using (
  (status = 'active' and deleted_at is null)
  or profile_id = auth.uid()
  or public.is_admin()
  or business_id = public.current_business_id()
);

create policy "workers_business_update" on public.workers for update
using (business_id = public.current_business_id() or profile_id = auth.uid() or public.is_admin())
with check (business_id = public.current_business_id() or profile_id = auth.uid() or public.is_admin());

create policy "workers_business_insert" on public.workers for insert
with check (business_id = public.current_business_id() or public.is_admin());

create policy "worker_portfolio_public" on public.worker_portfolio_images for select
using (
  active
  or exists (select 1 from public.workers w where w.id = worker_portfolio_images.worker_id and w.profile_id = auth.uid())
  or exists (select 1 from public.workers w where w.id = worker_portfolio_images.worker_id and w.business_id = public.current_business_id())
  or public.is_admin()
);

create policy "worker_portfolio_owner" on public.worker_portfolio_images for all
using (
  exists (select 1 from public.workers w where w.id = worker_portfolio_images.worker_id and w.profile_id = auth.uid())
  or exists (select 1 from public.workers w where w.id = worker_portfolio_images.worker_id and w.business_id = public.current_business_id())
)
with check (
  exists (select 1 from public.workers w where w.id = worker_portfolio_images.worker_id and w.profile_id = auth.uid())
  or exists (select 1 from public.workers w where w.id = worker_portfolio_images.worker_id and w.business_id = public.current_business_id())
);

create policy "categories_public" on public.service_categories for select
using (status = 'active' and deleted_at is null or public.is_admin());

create policy "categories_admin_insert" on public.service_categories for insert
with check (public.is_admin());

create policy "categories_admin_update" on public.service_categories for update
using (public.is_admin())
with check (public.is_admin());

create policy "services_public_or_owner" on public.services for select
using (
  (status = 'active' and deleted_at is null)
  or business_id = public.current_business_id()
  or public.is_admin()
);

create policy "services_business_manage" on public.services for all
using (business_id = public.current_business_id() or public.is_admin())
with check (business_id = public.current_business_id() or public.is_admin());

create policy "service_categories_public" on public.service_categories_map for select using (true);

create policy "service_categories_business_manage" on public.service_categories_map for all
using (
  exists (select 1 from public.services s where s.id = service_id and s.business_id = public.current_business_id())
  or public.is_admin()
)
with check (
  exists (select 1 from public.services s where s.id = service_id and s.business_id = public.current_business_id())
  or public.is_admin()
);

create policy "service_images_public" on public.service_images for select
using (
  exists (
    select 1 from public.services s
    where s.id = service_images.service_id
      and s.status = 'active'
      and s.deleted_at is null
  )
  or exists (
    select 1 from public.services s
    where s.id = service_images.service_id
      and s.business_id = public.current_business_id()
  )
  or public.is_admin()
);

create policy "service_images_business_manage" on public.service_images for all
using (
  exists (select 1 from public.services s where s.id = service_images.service_id and s.business_id = public.current_business_id())
  or public.is_admin()
)
with check (
  exists (select 1 from public.services s where s.id = service_images.service_id and s.business_id = public.current_business_id())
  or public.is_admin()
);

create policy "service_workers_public" on public.service_workers for select using (active);

create policy "service_workers_business_manage" on public.service_workers for all
using (
  exists (
    select 1 from public.services s
    where s.id = service_id and s.business_id = public.current_business_id()
  )
  or public.is_admin()
)
with check (
  exists (
    select 1 from public.services s
    where s.id = service_id and s.business_id = public.current_business_id()
  )
  or public.is_admin()
);

create policy "worker_schedules_owner" on public.worker_schedules for all
using (
  worker_id = public.current_worker_id()
  or exists (select 1 from public.workers w where w.id = worker_id and w.business_id = public.current_business_id())
  or public.is_admin()
)
with check (
  worker_id = public.current_worker_id()
  or exists (select 1 from public.workers w where w.id = worker_id and w.business_id = public.current_business_id())
  or public.is_admin()
);

create policy "worker_exceptions_owner" on public.worker_availability_exceptions for all
using (
  worker_id = public.current_worker_id()
  or exists (select 1 from public.workers w where w.id = worker_id and w.business_id = public.current_business_id())
  or public.is_admin()
)
with check (
  worker_id = public.current_worker_id()
  or exists (select 1 from public.workers w where w.id = worker_id and w.business_id = public.current_business_id())
  or public.is_admin()
);

create policy "bookings_owner" on public.bookings for select
using (
  customer_id = public.current_customer_id()
  or worker_id = public.current_worker_id()
  or business_id = public.current_business_id()
  or public.is_admin()
);

create policy "bookings_status_update" on public.bookings for update
using (
  worker_id = public.current_worker_id()
  or business_id = public.current_business_id()
  or customer_id = public.current_customer_id()
  or public.is_admin()
)
with check (
  worker_id = public.current_worker_id()
  or business_id = public.current_business_id()
  or customer_id = public.current_customer_id()
  or public.is_admin()
);

create policy "booking_cancellations_owner" on public.booking_cancellations for select
using (
  exists (select 1 from public.bookings b where b.id = booking_cancellations.booking_id and b.customer_id = public.current_customer_id())
  or exists (select 1 from public.bookings b where b.id = booking_cancellations.booking_id and b.worker_id = public.current_worker_id())
  or exists (select 1 from public.bookings b where b.id = booking_cancellations.booking_id and b.business_id = public.current_business_id())
  or public.is_admin()
);

create policy "booking_status_history_owner" on public.booking_status_history for select
using (
  exists (select 1 from public.bookings b where b.id = booking_status_history.booking_id and b.customer_id = public.current_customer_id())
  or exists (select 1 from public.bookings b where b.id = booking_status_history.booking_id and b.worker_id = public.current_worker_id())
  or exists (select 1 from public.bookings b where b.id = booking_status_history.booking_id and b.business_id = public.current_business_id())
  or public.is_admin()
);

create policy "booking_quotes_owner" on public.booking_price_quotes for all
using (
  worker_id = public.current_worker_id()
  or exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = public.current_customer_id())
  or public.is_admin()
)
with check (
  worker_id = public.current_worker_id()
  or exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = public.current_customer_id())
  or public.is_admin()
);

create policy "booking_adjustments_owner" on public.booking_quantity_adjustments for all
using (
  worker_id = public.current_worker_id()
  or exists (select 1 from public.bookings b where b.id = booking_quantity_adjustments.booking_id and b.customer_id = public.current_customer_id())
  or exists (select 1 from public.bookings b where b.id = booking_quantity_adjustments.booking_id and b.business_id = public.current_business_id())
  or public.is_admin()
)
with check (
  worker_id = public.current_worker_id()
  or exists (select 1 from public.bookings b where b.id = booking_quantity_adjustments.booking_id and b.customer_id = public.current_customer_id())
  or public.is_admin()
);

create policy "payments_owner" on public.payments for select
using (customer_id = public.current_customer_id() or public.is_admin());

create policy "reviews_public" on public.reviews for select
using (status in ('published','edited'));

create policy "reviews_customer_create" on public.reviews for insert
with check (
  customer_id = public.current_customer_id()
  and exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and b.status = 'completed'
      and b.customer_id = public.current_customer_id()
  )
);

create policy "reviews_customer_update" on public.reviews for update
using (customer_id = public.current_customer_id())
with check (customer_id = public.current_customer_id());

create policy "worker_reports_business" on public.worker_reports for all
using (
  exists (select 1 from public.workers w where w.id = worker_id and w.business_id = public.current_business_id())
  or public.is_admin()
)
with check (
  exists (select 1 from public.workers w where w.id = worker_id and w.business_id = public.current_business_id())
  or public.is_admin()
);

create policy "disciplinary_business" on public.disciplinary_actions for all
using (business_id = public.current_business_id() or public.is_admin())
with check (business_id = public.current_business_id() or public.is_admin());

create policy "disputes_owner" on public.disputes for all
using (
  opened_by = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.bookings b where b.id = disputes.booking_id and b.business_id = public.current_business_id())
)
with check (
  opened_by = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.bookings b where b.id = disputes.booking_id and b.business_id = public.current_business_id())
);

create policy "support_tickets_owner" on public.support_tickets for all
using (
  created_by = auth.uid()
  or public.is_admin()
  or assigned_to = auth.uid()
)
with check (
  created_by = auth.uid()
  or public.is_admin()
  or assigned_to = auth.uid()
);

create policy "support_messages_owner" on public.support_messages for all
using (
  exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.created_by = auth.uid() or t.assigned_to = auth.uid()))
  or public.is_admin()
)
with check (
  exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.created_by = auth.uid() or t.assigned_to = auth.uid()))
  or public.is_admin()
);

create policy "support_attachments_owner" on public.support_attachments for all
using (
  uploaded_by = auth.uid()
  or public.is_admin()
)
with check (
  uploaded_by = auth.uid()
  or public.is_admin()
);

create policy "notifications_owner" on public.notifications for all
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create policy "notification_preferences_owner" on public.notification_preferences for all
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create policy "platform_settings_admin" on public.platform_settings for all
using (public.is_admin())
with check (public.is_admin());

create policy "audit_logs_admin_read" on public.audit_logs for select
using (public.is_admin());

-- Account provisioning RPCs
create function public.provision_business_account(
  p_profile_id uuid,
  p_name text,
  p_slug text,
  p_description text default null,
  p_must_change_password boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  if not public.is_admin() then raise exception 'Only admins can provision businesses'; end if;
  perform set_config('app.provisioning_profile', 'true', true);
  update public.profiles
  set role = 'business',
      account_status = 'active',
      must_change_password = p_must_change_password,
      provisioned_by = auth.uid(),
      provisioned_at = now()
  where id = p_profile_id;
  if not found then raise exception 'Profile not found'; end if;

  insert into public.businesses (owner_profile_id, name, slug, description)
  values (p_profile_id, p_name, p_slug, p_description)
  returning id into v_business_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, reason)
  values (auth.uid(), 'provision_business_account', 'business', v_business_id::text, 'Business account created off-platform');
  return v_business_id;
end;
$$;

create function public.provision_worker_account(
  p_profile_id uuid,
  p_business_id uuid,
  p_must_change_password boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
begin
  if not public.is_business() and not public.is_admin() then
    raise exception 'Only businesses or admins can provision workers';
  end if;
  if public.is_business() and p_business_id <> public.current_business_id() then
    raise exception 'Cannot provision a worker outside the current business';
  end if;

  perform set_config('app.provisioning_profile', 'true', true);
  update public.profiles
  set role = 'worker',
      account_status = 'active',
      must_change_password = p_must_change_password,
      provisioned_by = auth.uid(),
      provisioned_at = now()
  where id = p_profile_id;
  if not found then raise exception 'Profile not found'; end if;

  insert into public.workers (profile_id, business_id)
  values (p_profile_id, p_business_id)
  returning id into v_worker_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, reason)
  values (auth.uid(), 'provision_worker_account', 'worker', v_worker_id::text, 'Worker account created off-platform');
  return v_worker_id;
end;
$$;

-- Performance and search indexes
create index idx_profiles_role_status on public.profiles(role, account_status);
create index idx_addresses_user_default on public.addresses(user_id, is_default) where deleted_at is null;
create index idx_addresses_location on public.addresses using gist(location);
create index idx_businesses_status on public.businesses(status) where deleted_at is null;
create index idx_businesses_location on public.businesses using gist(location);
create index idx_workers_business_status on public.workers(business_id, status) where deleted_at is null;
create index idx_workers_location on public.workers using gist(location);
create index idx_worker_portfolio_worker_order on public.worker_portfolio_images(worker_id, display_order);
create index idx_service_categories_status on public.service_categories(status) where deleted_at is null;
create index idx_services_business_status on public.services(business_id, status) where deleted_at is null;
create index idx_services_name_trgm on public.services using gin(name gin_trgm_ops);
create index idx_services_pricing_type on public.services(pricing_type);
create index idx_service_categories_map_category on public.service_categories_map(category_id, service_id);
create index idx_service_images_service_order on public.service_images(service_id, display_order);
create index idx_service_workers_worker on public.service_workers(worker_id, active);
create index idx_worker_schedules_worker_day on public.worker_schedules(worker_id, day_of_week, active);
create index idx_worker_exceptions_worker_time on public.worker_availability_exceptions(worker_id, start_at, end_at);
create index idx_bookings_customer_created on public.bookings(customer_id, created_at desc);
create index idx_bookings_worker_status_time on public.bookings(worker_id, status, scheduled_start);
create index idx_bookings_business_created on public.bookings(business_id, created_at desc);
create index idx_bookings_status_time on public.bookings(status, scheduled_start);
create index idx_booking_status_history_booking on public.booking_status_history(booking_id, created_at);
create index idx_booking_quantity_adjustments_booking_status on public.booking_quantity_adjustments(booking_id, status);
create index idx_payments_booking_status on public.payments(booking_id, status);
create index idx_payments_customer_created on public.payments(customer_id, created_at desc);
create index idx_reviews_worker_status on public.reviews(worker_id, status);
create index idx_support_tickets_status_priority on public.support_tickets(status, priority, created_at desc);
create index idx_support_messages_ticket on public.support_messages(ticket_id, created_at);
create index idx_notifications_recipient_unread on public.notifications(recipient_id, created_at desc) where read_at is null;
create index idx_audit_logs_created on public.audit_logs(created_at desc);
create index idx_audit_logs_actor on public.audit_logs(actor_id, created_at desc);
create unique index uq_addresses_user_default
  on public.addresses(user_id)
  where is_default and deleted_at is null;
create unique index uq_service_cover
  on public.service_images(service_id)
  where is_cover;
create unique index uq_booking_pending_adjustment
  on public.booking_quantity_adjustments(booking_id)
  where status = 'pending';
create unique index uq_payment_booking_method
  on public.payments(booking_id, method);

insert into public.platform_settings (key, value)
values
  ('cancellation_policy', '{"customer_pre_confirmation": "free", "confirmed_booking": "configured_by_admin"}'::jsonb),
  ('quote_response_minutes', '{"minutes": 30}'::jsonb),
  ('review_edit_days', '{"days": 7}'::jsonb),
  ('demo_payment', '{"enabled": true, "requires_real_payment": false}'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Demo/public storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('business_logos', 'business_logos', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('service_images', 'service_images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('worker_portfolio', 'worker_portfolio', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('support_attachments', 'support_attachments', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public_avatar_read" on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatar_owner_manage" on storage.objects for all
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "public_business_logo_read" on storage.objects for select
using (bucket_id = 'business_logos');

create policy "business_logo_owner_manage" on storage.objects for all
using (
  bucket_id = 'business_logos'
  and public.is_business()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'business_logos'
  and public.is_business()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "public_service_image_read" on storage.objects for select
using (bucket_id = 'service_images');

create policy "service_image_business_manage" on storage.objects for all
using (
  bucket_id = 'service_images'
  and public.is_business()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'service_images'
  and public.is_business()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "public_worker_portfolio_read" on storage.objects for select
using (bucket_id = 'worker_portfolio');

create policy "worker_portfolio_owner_manage" on storage.objects for all
using (
  bucket_id = 'worker_portfolio'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
)
with check (
  bucket_id = 'worker_portfolio'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

create policy "support_attachment_owner_manage" on storage.objects for all
using (
  bucket_id = 'support_attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
)
with check (
  bucket_id = 'support_attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);
