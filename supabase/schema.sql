create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  phone text check (char_length(phone) between 1 and 40),
  email text,
  court text not null,
  players text not null check (players in ('2 players', '3 players', '4 players')),
  duration integer not null check (duration between 1 and 3),
  date date not null,
  time text not null check (char_length(time) between 1 and 60),
  estimated_total integer not null check (estimated_total > 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  promo text not null default '' check (char_length(promo) <= 80),
  notes text not null default '' check (char_length(notes) <= 1000),
  cancellation_token_hash text,
  booking_group_id uuid,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.bookings
  alter column phone drop not null;

alter table public.bookings
  add column if not exists email text;

alter table public.bookings
  add column if not exists discount_amount integer not null default 0;

alter table public.bookings
  drop constraint if exists bookings_discount_amount_check;

alter table public.bookings
  add constraint bookings_discount_amount_check
  check (discount_amount >= 0);

alter table public.bookings
  add column if not exists cancellation_token_hash text;

alter table public.bookings
  add column if not exists booking_group_id uuid;

create index if not exists bookings_booking_group_id_idx
  on public.bookings (booking_group_id)
  where booking_group_id is not null;

create table if not exists public.booking_date_blocks (
  id uuid primary key default extensions.gen_random_uuid(),
  blocked_date date not null,
  block_type text not null check (block_type in ('maintenance', 'closed')),
  start_time time not null default time '00:00',
  end_time time not null default time '24:00',
  courts text[],
  reason text not null default 'Maintenance',
  created_at timestamptz not null default now()
);

alter table public.booking_date_blocks
  add column if not exists id uuid;

update public.booking_date_blocks
set id = extensions.gen_random_uuid()
where id is null;

alter table public.booking_date_blocks
  alter column id set default extensions.gen_random_uuid(),
  alter column id set not null,
  add column if not exists start_time time not null default time '00:00',
  add column if not exists end_time time not null default time '24:00',
  add column if not exists courts text[],
  add column if not exists reason text not null default 'Maintenance';

update public.booking_date_blocks
set reason = 'Club closed'
where block_type = 'closed'
  and reason = 'Maintenance';

do $$
declare
  v_primary_key text;
begin
  select constraint_row.conname
  into v_primary_key
  from pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.booking_date_blocks'::regclass
    and constraint_row.contype = 'p';

  if v_primary_key is not null then
    execute format('alter table public.booking_date_blocks drop constraint %I', v_primary_key);
  end if;
end;
$$;

alter table public.booking_date_blocks
  add constraint booking_date_blocks_pkey primary key (id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.booking_date_blocks'::regclass
      and conname = 'booking_date_blocks_time_range_check'
  ) then
    alter table public.booking_date_blocks
      add constraint booking_date_blocks_time_range_check
      check (start_time >= time '00:00' and end_time <= time '24:00' and start_time < end_time);
  end if;
end;
$$;

create index if not exists booking_date_blocks_blocked_date_idx
  on public.booking_date_blocks (blocked_date);

alter table public.booking_date_blocks enable row level security;
revoke all on table public.booking_date_blocks from public, anon, authenticated;

create table if not exists public.court_rates (
  court text primary key check (char_length(trim(court)) between 2 and 60),
  hourly_rate integer not null check (hourly_rate between 1 and 100000),
  day_rate integer,
  night_rate integer,
  sort_order integer not null unique,
  image_path text not null default 'assets/pickleball-court-real-01.jpg'
);

alter table public.court_rates
  add column if not exists day_rate integer;

alter table public.court_rates
  add column if not exists night_rate integer;

update public.court_rates
set day_rate = coalesce(day_rate, hourly_rate),
    night_rate = coalesce(night_rate, hourly_rate);

alter table public.court_rates
  alter column day_rate set not null,
  alter column night_rate set not null;

alter table public.court_rates
  drop constraint if exists court_rates_day_rate_check,
  drop constraint if exists court_rates_night_rate_check;

alter table public.court_rates
  add constraint court_rates_day_rate_check check (day_rate between 1 and 100000),
  add constraint court_rates_night_rate_check check (night_rate between 1 and 100000);

create table if not exists public.promo_codes (
  code text primary key check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value integer not null,
  active boolean not null default true,
  expires_at timestamptz,
  max_redemptions integer,
  updated_at timestamptz not null default now(),
  constraint promo_codes_discount_value_check check (
    (discount_type = 'percentage' and discount_value between 1 and 99)
    or (discount_type = 'fixed' and discount_value between 1 and 100000)
  ),
  constraint promo_codes_max_redemptions_check check (
    max_redemptions is null or max_redemptions between 1 and 1000000
  )
);

alter table public.promo_codes
  add column if not exists expires_at timestamptz;

alter table public.promo_codes
  add column if not exists max_redemptions integer;

alter table public.promo_codes
  drop constraint if exists promo_codes_max_redemptions_check;

alter table public.promo_codes
  add constraint promo_codes_max_redemptions_check
  check (max_redemptions is null or max_redemptions between 1 and 1000000);

alter table public.promo_codes enable row level security;
revoke all on table public.promo_codes from public, anon, authenticated;

create table if not exists public.promo_code_redemptions (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  promo_code text not null references public.promo_codes(code) on delete cascade,
  phone_hash text,
  email_hash text,
  booking_group_id uuid,
  redeemed_at timestamptz not null default now()
);

alter table public.promo_code_redemptions
  alter column phone_hash drop not null;

alter table public.promo_code_redemptions
  add column if not exists booking_group_id uuid;

update public.promo_code_redemptions as r
set booking_group_id = b.booking_group_id
from public.bookings as b
where b.id = r.booking_id
  and r.booking_group_id is null
  and b.booking_group_id is not null;

create index if not exists promo_code_redemptions_code_idx
  on public.promo_code_redemptions (promo_code);

create index if not exists promo_code_redemptions_group_idx
  on public.promo_code_redemptions (promo_code, booking_group_id)
  where booking_group_id is not null;

create index if not exists promo_code_redemptions_phone_idx
  on public.promo_code_redemptions (promo_code, phone_hash);

create index if not exists promo_code_redemptions_email_idx
  on public.promo_code_redemptions (promo_code, email_hash)
  where email_hash is not null;

alter table public.promo_code_redemptions enable row level security;
revoke all on table public.promo_code_redemptions from public, anon, authenticated;

insert into public.promo_code_redemptions (
  booking_id, promo_code, phone_hash, email_hash, booking_group_id, redeemed_at
)
select
  b.id,
  p.code,
  encode(extensions.digest(convert_to('phone:' || regexp_replace(b.phone, '[^0-9]', '', 'g'), 'UTF8'), 'sha256'), 'hex'),
  case
    when nullif(trim(coalesce(b.email, '')), '') is not null then
      encode(extensions.digest(convert_to('email:' || lower(trim(b.email)), 'UTF8'), 'sha256'), 'hex')
  end,
  b.booking_group_id,
  b.created_at
from public.bookings as b
join public.promo_codes as p on p.code = upper(trim(b.promo))
where coalesce(trim(b.promo), '') <> ''
  and b.discount_amount > 0
on conflict (booking_id) do nothing;

alter table public.court_rates
  add column if not exists image_path text not null default 'assets/pickleball-court-real-01.jpg';

alter table public.court_rates
  drop constraint if exists court_rates_image_path_check;

alter table public.court_rates
  add constraint court_rates_image_path_check
  check (
    image_path in (
      'assets/pickleball-court-real-01.jpg',
      'assets/pickleball-court-real-02.jpg',
      'assets/pickleball-court-real-03.jpg',
      'assets/pickleball-court-real-04.jpg'
    )
    or image_path ~ '^courts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  );

insert into public.court_rates (court, hourly_rate, day_rate, night_rate, sort_order)
values
  ('The Ace Court', 400, 400, 400, 1),
  ('The Prime Court', 500, 500, 500, 2),
  ('The Rally Court', 400, 400, 400, 3),
  ('The Social Court', 450, 450, 450, 4)
on conflict (court) do nothing;

alter table public.court_rates
  drop constraint if exists court_rates_court_check;

alter table public.court_rates
  drop constraint if exists court_rates_sort_order_check;

alter table public.court_rates
  drop constraint if exists court_rates_sort_order_key;

alter table public.court_rates
  alter column sort_order type integer;

alter table public.court_rates
  add constraint court_rates_court_check
  check (char_length(trim(court)) between 2 and 60);

create unique index if not exists court_rates_court_lower_key
  on public.court_rates (lower(court));

create unique index if not exists court_rates_sort_order_key
  on public.court_rates (sort_order);

alter table public.bookings
  drop constraint if exists bookings_court_check;

update public.bookings
set court = case court
  when 'The Ace Court — ₱400/hour' then 'The Ace Court'
  when 'The Prime Court — ₱500/hour' then 'The Prime Court'
  when 'The Rally Court — ₱400/hour' then 'The Rally Court'
  when 'The Social Court — ₱450/hour' then 'The Social Court'
  else court
end
where court in (
  'The Ace Court — ₱400/hour',
  'The Prime Court — ₱500/hour',
  'The Rally Court — ₱400/hour',
  'The Social Court — ₱450/hour'
);

alter table public.bookings
  drop constraint if exists bookings_court_fkey;

alter table public.bookings
  add constraint bookings_court_fkey
  foreign key (court)
  references public.court_rates (court)
  on update cascade;

alter table public.bookings
  drop constraint if exists bookings_status_check;

update public.bookings
set status = 'confirmed'
where status = 'paid';

alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'cancelled'));

create table if not exists public.booking_submission_attempts (
  identifier_hash text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists booking_submission_attempts_identifier_time_idx
  on public.booking_submission_attempts (identifier_hash, attempted_at desc);

alter table public.booking_submission_attempts enable row level security;
revoke all on table public.booking_submission_attempts from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.booking_ip_rate_limit_secrets (
  key_id boolean primary key default true check (key_id),
  pepper text not null default encode(extensions.gen_random_bytes(32), 'hex')
);

insert into private.booking_ip_rate_limit_secrets (key_id)
values (true)
on conflict (key_id) do nothing;

alter table private.booking_ip_rate_limit_secrets enable row level security;
revoke all on table private.booking_ip_rate_limit_secrets from public, anon, authenticated;

create table if not exists private.booking_ip_submission_attempts (
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists booking_ip_submission_attempts_hash_time_idx
  on private.booking_ip_submission_attempts (ip_hash, attempted_at desc);

create index if not exists booking_ip_submission_attempts_time_idx
  on private.booking_ip_submission_attempts (attempted_at);

alter table private.booking_ip_submission_attempts enable row level security;
revoke all on table private.booking_ip_submission_attempts from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'court-images',
  'court-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Signed-in staff can upload court photos" on storage.objects;
create policy "Signed-in staff can upload court photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'court-images'
    and name like 'courts/%'
  );

drop policy if exists "Signed-in staff can delete court photos" on storage.objects;
create policy "Signed-in staff can delete court photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'court-images'
    and name like 'courts/%'
  );

alter table public.bookings enable row level security;

revoke all on table public.bookings from public, anon, authenticated;
grant select, update, delete on table public.bookings to authenticated;

alter table public.court_rates enable row level security;
revoke all on table public.court_rates from public, anon, authenticated;
grant select on table public.court_rates to anon, authenticated;
revoke update (hourly_rate) on table public.court_rates from public, anon, authenticated;

drop policy if exists "Visitors can view court rates" on public.court_rates;
create policy "Visitors can view court rates"
  on public.court_rates
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Signed-in staff can update court rates" on public.court_rates;

drop function if exists public.add_court(text, integer);
drop function if exists public.add_court(text, integer, text);
drop function if exists public.add_court(text, integer, integer, text);
create function public.add_court(
  p_court text,
  p_day_rate integer,
  p_night_rate integer,
  p_image_path text
)
returns table (court text, hourly_rate integer, day_rate integer, night_rate integer, sort_order integer, image_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_court text := trim(coalesce(p_court, ''));
begin
  perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(v_court), 0));
  perform pg_advisory_xact_lock(hashtextextended('court-rate-order', 0));

  if char_length(v_court) not between 2 and 60 then
    raise exception 'Court names must be between 2 and 60 characters.';
  end if;

  if p_day_rate is null or p_day_rate not between 1 and 100000
    or p_night_rate is null or p_night_rate not between 1 and 100000 then
    raise exception 'Day and night rates must each be between ₱1 and ₱100,000.';
  end if;

  if p_image_path is null or not (
    p_image_path in (
      'assets/pickleball-court-real-01.jpg',
      'assets/pickleball-court-real-02.jpg',
      'assets/pickleball-court-real-03.jpg',
      'assets/pickleball-court-real-04.jpg'
    )
    or p_image_path ~ '^courts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  ) then
    raise exception 'Choose an image from the court photo list.';
  end if;

  if exists (
    select 1 from public.court_rates as r where lower(r.court) = lower(v_court)
  ) then
    raise exception 'A court with that name already exists.';
  end if;

  insert into public.court_rates as r (court, hourly_rate, day_rate, night_rate, sort_order, image_path)
  values (
    v_court,
    p_day_rate,
    p_day_rate,
    p_night_rate,
    coalesce((select max(existing.sort_order) + 1 from public.court_rates as existing), 1),
    p_image_path
  )
  returning r.court, r.hourly_rate, r.day_rate, r.night_rate, r.sort_order, r.image_path
  into court, hourly_rate, day_rate, night_rate, sort_order, image_path;

  return next;
end;
$$;

revoke all on function public.add_court(text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.add_court(text, integer, integer, text) to authenticated;

create or replace function public.delete_court(p_court text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_court text := trim(coalesce(p_court, ''));
  v_court_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(v_court), 0));
  perform pg_advisory_xact_lock(hashtextextended('court-rate-order', 0));

  if not exists (select 1 from public.court_rates as r where r.court = v_court) then
    raise exception 'This court no longer exists. Refresh the page and try again.';
  end if;

  if exists (select 1 from public.bookings as b where b.court = v_court) then
    raise exception 'This court has booking history and cannot be deleted.';
  end if;

  if exists (
    select 1 from public.booking_date_blocks as date_block
    where date_block.courts @> array[v_court]
  ) then
    raise exception 'This court has maintenance or closure blocks and cannot be deleted.';
  end if;

  select count(*) into v_court_count from public.court_rates;
  if v_court_count <= 1 then
    raise exception 'At least one court must remain available.';
  end if;

  delete from public.court_rates as r where r.court = v_court;
  return true;
end;
$$;

revoke all on function public.delete_court(text) from public, anon, authenticated;
grant execute on function public.delete_court(text) to authenticated;

drop function if exists public.rename_court(text, text);
create function public.rename_court(p_old_court text, p_new_court text)
returns table (court text, hourly_rate integer, day_rate integer, night_rate integer, sort_order integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_court text := trim(coalesce(p_old_court, ''));
  v_new_court text := trim(coalesce(p_new_court, ''));
  v_hourly_rate integer;
  v_day_rate integer;
  v_night_rate integer;
  v_sort_order integer;
begin
  if lower(v_old_court) < lower(v_new_court) then
    perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(v_old_court), 0));
    perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(v_new_court), 0));
  else
    perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(v_new_court), 0));
    perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(v_old_court), 0));
  end if;

  if char_length(v_new_court) not between 2 and 60 then
    raise exception 'Court names must be between 2 and 60 characters.';
  end if;

  if lower(v_old_court) = lower(v_new_court) then
    raise exception 'Enter a different court name.';
  end if;

  if exists (
    select 1 from public.court_rates as r where lower(r.court) = lower(v_new_court)
  ) then
    raise exception 'A court with that name already exists.';
  end if;

  update public.court_rates as r
  set court = v_new_court
  where r.court = v_old_court
  returning r.hourly_rate, r.day_rate, r.night_rate, r.sort_order
  into v_hourly_rate, v_day_rate, v_night_rate, v_sort_order;

  if not found then
    raise exception 'This court no longer exists. Refresh the page and try again.';
  end if;

  update public.bookings as b
  set court = v_new_court
  where b.court = v_old_court;

  update public.booking_date_blocks as date_block
  set courts = array_replace(date_block.courts, v_old_court, v_new_court)
  where date_block.courts @> array[v_old_court];

  court := v_new_court;
  hourly_rate := v_hourly_rate;
  day_rate := v_day_rate;
  night_rate := v_night_rate;
  sort_order := v_sort_order;
  return next;
end;
$$;

revoke all on function public.rename_court(text, text) from public, anon, authenticated;
grant execute on function public.rename_court(text, text) to authenticated;

drop function if exists public.update_court_rate(text, integer);
drop function if exists public.update_court_rate(text, integer, integer);
create function public.update_court_rate(p_court text, p_day_rate integer, p_night_rate integer)
returns table (court text, hourly_rate integer, day_rate integer, night_rate integer, sort_order integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(coalesce(p_court, '')), 0));

  if p_day_rate is null or p_day_rate not between 1 and 100000
    or p_night_rate is null or p_night_rate not between 1 and 100000 then
    raise exception 'Day and night rates must each be between ₱1 and ₱100,000.';
  end if;

  update public.court_rates as r
  set hourly_rate = p_day_rate,
      day_rate = p_day_rate,
      night_rate = p_night_rate
  where r.court = p_court
  returning r.court, r.hourly_rate, r.day_rate, r.night_rate, r.sort_order
  into court, hourly_rate, day_rate, night_rate, sort_order;

  if not found then
    raise exception 'This court no longer exists. Refresh the page and try again.';
  end if;

  return next;
end;
$$;

revoke all on function public.update_court_rate(text, integer, integer) from public, anon, authenticated;
grant execute on function public.update_court_rate(text, integer, integer) to authenticated;

drop function if exists public.save_court_settings(text, text, integer);
drop function if exists public.save_court_settings(text, text, integer, text);
drop function if exists public.save_court_settings(text, text, integer, integer, text);
create function public.save_court_settings(
  p_old_court text,
  p_new_court text,
  p_day_rate integer,
  p_night_rate integer,
  p_image_path text
)
returns table (court text, hourly_rate integer, day_rate integer, night_rate integer, sort_order integer, image_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_court text := trim(coalesce(p_old_court, ''));
  v_new_court text := trim(coalesce(p_new_court, ''));
begin
  if lower(v_old_court) <= lower(v_new_court) then
    perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(v_old_court), 0));
    if lower(v_old_court) <> lower(v_new_court) then
      perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(v_new_court), 0));
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(v_new_court), 0));
    perform pg_advisory_xact_lock(hashtextextended('court-rate:' || lower(v_old_court), 0));
  end if;

  if char_length(v_new_court) not between 2 and 60 then
    raise exception 'Court names must be between 2 and 60 characters.';
  end if;

  if p_day_rate is null or p_day_rate not between 1 and 100000
    or p_night_rate is null or p_night_rate not between 1 and 100000 then
    raise exception 'Day and night rates must each be between ₱1 and ₱100,000.';
  end if;

  if p_image_path is null or not (
    p_image_path in (
      'assets/pickleball-court-real-01.jpg',
      'assets/pickleball-court-real-02.jpg',
      'assets/pickleball-court-real-03.jpg',
      'assets/pickleball-court-real-04.jpg'
    )
    or p_image_path ~ '^courts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  ) then
    raise exception 'Choose an image from the court photo list.';
  end if;

  if exists (
    select 1
    from public.court_rates as r
    where lower(r.court) = lower(v_new_court)
      and r.court <> v_old_court
  ) then
    raise exception 'A court with that name already exists.';
  end if;

  update public.court_rates as r
  set court = v_new_court,
      hourly_rate = p_day_rate,
      day_rate = p_day_rate,
      night_rate = p_night_rate,
      image_path = p_image_path
  where r.court = v_old_court
  returning r.court, r.hourly_rate, r.day_rate, r.night_rate, r.sort_order, r.image_path
  into court, hourly_rate, day_rate, night_rate, sort_order, image_path;

  if not found then
    raise exception 'This court no longer exists. Refresh the page and try again.';
  end if;

  update public.booking_date_blocks as date_block
  set courts = array_replace(date_block.courts, v_old_court, v_new_court)
  where date_block.courts @> array[v_old_court];

  return next;
end;
$$;

revoke all on function public.save_court_settings(text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.save_court_settings(text, text, integer, integer, text) to authenticated;

create or replace function public.prevent_booking_time_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_lock_key text;
  v_new_lock_key text;
  v_time_parts text[];
  v_start_minute integer;
  v_end_minute integer;
  v_existing_parts text[];
  v_existing_start_minute integer;
  v_existing_end_minute integer;
begin
  v_new_lock_key := new.date::text || ':' || new.court;
  if tg_op = 'UPDATE' then
    v_old_lock_key := old.date::text || ':' || old.court;
    if v_old_lock_key < v_new_lock_key then
      perform pg_advisory_xact_lock(hashtextextended(v_old_lock_key, 0));
      if v_old_lock_key <> v_new_lock_key then
        perform pg_advisory_xact_lock(hashtextextended(v_new_lock_key, 0));
      end if;
    else
      perform pg_advisory_xact_lock(hashtextextended(v_new_lock_key, 0));
      if v_old_lock_key <> v_new_lock_key then
        perform pg_advisory_xact_lock(hashtextextended(v_old_lock_key, 0));
      end if;
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended(v_new_lock_key, 0));
  end if;

  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  v_time_parts := regexp_match(
    new."time",
    '^[[:space:]]*([0-9]{1,2}):([0-9]{2})[[:space:]]*(AM|PM)[[:space:]]*[–-][[:space:]]*([0-9]{1,2}):([0-9]{2})[[:space:]]*(AM|PM)[[:space:]]*$',
    'i'
  );
  if v_time_parts is null then
    raise exception 'Choose a valid booking time.';
  end if;

  if v_time_parts[1]::integer not between 1 and 12
    or v_time_parts[2]::integer not between 0 and 59
    or v_time_parts[4]::integer not between 1 and 12
    or v_time_parts[5]::integer not between 0 and 59 then
    raise exception 'Choose a valid booking time.';
  end if;

  v_start_minute := (
    (v_time_parts[1]::integer % 12)
    + case when upper(v_time_parts[3]) = 'PM' then 12 else 0 end
  ) * 60 + v_time_parts[2]::integer;
  v_end_minute := (
    (v_time_parts[4]::integer % 12)
    + case when upper(v_time_parts[6]) = 'PM' then 12 else 0 end
  ) * 60 + v_time_parts[5]::integer;

  if v_end_minute <= v_start_minute
    or v_end_minute - v_start_minute <> new.duration * 60 then
    raise exception 'The selected time does not match the booking duration.';
  end if;

  for v_existing_parts in
    select regexp_match(
      b."time",
      '([0-9]{1,2}):([0-9]{2})[[:space:]]*(AM|PM)[[:space:]]*[–-][[:space:]]*([0-9]{1,2}):([0-9]{2})[[:space:]]*(AM|PM)',
      'i'
    )
    from public.bookings as b
    where b.date = new.date
      and b.court = new.court
      and b.status in ('pending', 'confirmed')
      and b.id <> new.id
  loop
    if v_existing_parts is null then
      continue;
    end if;

    v_existing_start_minute := (
      (v_existing_parts[1]::integer % 12)
      + case when upper(v_existing_parts[3]) = 'PM' then 12 else 0 end
    ) * 60 + v_existing_parts[2]::integer;
    v_existing_end_minute := (
      (v_existing_parts[4]::integer % 12)
      + case when upper(v_existing_parts[6]) = 'PM' then 12 else 0 end
    ) * 60 + v_existing_parts[5]::integer;

    if v_start_minute < v_existing_end_minute
      and v_existing_start_minute < v_end_minute then
      raise exception using
        message = 'That time has just become unavailable. Please choose another time.',
        errcode = '23P01';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists prevent_booking_time_overlap on public.bookings;
create trigger prevent_booking_time_overlap
  before insert or update on public.bookings
  for each row
  execute function public.prevent_booking_time_overlap();

create or replace function public.booking_time_overlaps_block(
  p_booking_time text,
  p_block_start time,
  p_block_end time
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[];
  v_booking_start integer;
  v_booking_end integer;
  v_block_start integer := extract(epoch from p_block_start)::integer / 60;
  v_block_end integer := extract(epoch from p_block_end)::integer / 60;
begin
  v_parts := regexp_match(
    p_booking_time,
    '^([0-9]{1,2}):([0-9]{2})\s*(AM|PM)\s*[–-]\s*([0-9]{1,2}):([0-9]{2})\s*(AM|PM)$',
    'i'
  );
  if v_parts is null then
    return true;
  end if;

  if v_parts[1]::integer not between 1 and 12
    or v_parts[4]::integer not between 1 and 12
    or v_parts[2]::integer not between 0 and 59
    or v_parts[5]::integer not between 0 and 59 then
    return true;
  end if;

  v_booking_start := (
    (v_parts[1]::integer % 12)
    + case when upper(v_parts[3]) = 'PM' then 12 else 0 end
  ) * 60 + v_parts[2]::integer;
  v_booking_end := (
    (v_parts[4]::integer % 12)
    + case when upper(v_parts[6]) = 'PM' then 12 else 0 end
  ) * 60 + v_parts[5]::integer;

  if v_booking_end <= v_booking_start then
    return true;
  end if;

  return v_booking_start < v_block_end and v_block_start < v_booking_end;
end;
$$;

revoke all on function public.booking_time_overlaps_block(text, time, time) from public, anon, authenticated;

create or replace function public.prevent_booking_on_blocked_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('pending', 'confirmed') then
    perform pg_advisory_xact_lock(hashtextextended('booking-date-block:' || new.date::text, 0));

    if exists (
      select 1
      from public.booking_date_blocks as date_block
      where date_block.blocked_date = new.date
        and (date_block.courts is null or new.court = any(date_block.courts))
        and public.booking_time_overlaps_block(
          new."time",
          date_block.start_time,
          date_block.end_time
        )
      ) then
        raise exception using
          message = 'That time is blocked for maintenance or a club closure. Choose another time.',
          errcode = 'P0001';
      end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_booking_on_blocked_date() from public, anon, authenticated;

drop trigger if exists prevent_booking_on_blocked_date on public.bookings;
create trigger prevent_booking_on_blocked_date
  before insert or update of date, "time", status on public.bookings
  for each row
  execute function public.prevent_booking_on_blocked_date();

drop function if exists public.list_promo_codes();
create function public.list_promo_codes()
returns table (
  code text,
  discount_type text,
  discount_value integer,
  active boolean,
  expires_at timestamptz,
  max_redemptions integer,
  used_count integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.code,
    p.discount_type,
    p.discount_value,
    p.active,
    p.expires_at,
    p.max_redemptions,
    count(distinct coalesce(r.booking_group_id, r.booking_id))::integer,
    p.updated_at
  from public.promo_codes as p
  left join public.promo_code_redemptions as r on r.promo_code = p.code
  group by p.code
  order by p.code
$$;

revoke all on function public.list_promo_codes() from public, anon, authenticated;
grant execute on function public.list_promo_codes() to authenticated;

drop function if exists public.save_promo_code(text, text, integer, boolean);
create or replace function public.save_promo_code(
  p_code text,
  p_discount_type text,
  p_discount_value integer,
  p_expires_at timestamptz,
  p_max_redemptions integer,
  p_active boolean
)
returns table (
  code text,
  discount_type text,
  discount_value integer,
  active boolean,
  expires_at timestamptz,
  max_redemptions integer,
  used_count integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_used_count integer;
begin
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,39}$' then
    raise exception 'Promo codes must be 2–40 letters, numbers, hyphens, or underscores.';
  end if;

  if p_discount_type is null or p_discount_type not in ('percentage', 'fixed') then
    raise exception 'Choose a percentage or fixed-amount discount.';
  end if;

  if p_discount_value is null
    or (p_discount_type = 'percentage' and p_discount_value not between 1 and 99)
    or (p_discount_type = 'fixed' and p_discount_value not between 1 and 100000) then
    raise exception 'Percentage discounts must be 1–99%%. Fixed discounts must be between ₱1 and ₱100,000.';
  end if;

  if p_active is null then
    raise exception 'Choose whether this promo code is active.';
  end if;

  if p_max_redemptions is not null and p_max_redemptions not between 1 and 1000000 then
    raise exception 'The redemption limit must be between 1 and 1,000,000, or leave it blank for unlimited uses.';
  end if;

  if p_active and p_expires_at is not null and p_expires_at <= now() then
    raise exception 'An active promo code must expire in the future.';
  end if;

  perform 1 from public.promo_codes as p where p.code = v_code for update;
  if not found then
    raise exception 'This promo code no longer exists. Refresh the list and try again.';
  end if;

  select count(distinct coalesce(r.booking_group_id, r.booking_id))::integer
  into v_used_count
  from public.promo_code_redemptions as r
  where r.promo_code = v_code;

  if p_max_redemptions is not null and p_max_redemptions < v_used_count then
    raise exception 'The redemption limit cannot be lower than the % uses already recorded.', v_used_count;
  end if;

  update public.promo_codes as p
  set discount_type = p_discount_type,
      discount_value = p_discount_value,
      active = p_active,
      expires_at = p_expires_at,
      max_redemptions = p_max_redemptions,
      updated_at = now()
  where p.code = v_code;

  return query
  select p.code, p.discount_type, p.discount_value, p.active, p.expires_at, p.max_redemptions,
    (select count(distinct coalesce(r.booking_group_id, r.booking_id))::integer
      from public.promo_code_redemptions as r where r.promo_code = p.code),
    p.updated_at
  from public.promo_codes as p
  where p.code = v_code;
end;
$$;

revoke all on function public.save_promo_code(text, text, integer, timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.save_promo_code(text, text, integer, timestamptz, integer, boolean) to authenticated;

drop function if exists public.create_promo_code(text, text, integer);
create or replace function public.create_promo_code(
  p_code text,
  p_discount_type text,
  p_discount_value integer,
  p_expires_at timestamptz,
  p_max_redemptions integer
)
returns table (
  code text,
  discount_type text,
  discount_value integer,
  active boolean,
  expires_at timestamptz,
  max_redemptions integer,
  used_count integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,39}$' then
    raise exception 'Promo codes must be 2–40 letters, numbers, hyphens, or underscores.';
  end if;

  if p_discount_type is null or p_discount_type not in ('percentage', 'fixed') then
    raise exception 'Choose a percentage or fixed-amount discount.';
  end if;

  if p_discount_value is null
    or (p_discount_type = 'percentage' and p_discount_value not between 1 and 99)
    or (p_discount_type = 'fixed' and p_discount_value not between 1 and 100000) then
    raise exception 'Percentage discounts must be 1–99%%. Fixed discounts must be between ₱1 and ₱100,000.';
  end if;

  if p_max_redemptions is not null and p_max_redemptions not between 1 and 1000000 then
    raise exception 'The redemption limit must be between 1 and 1,000,000, or leave it blank for unlimited uses.';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The expiration time must be in the future.';
  end if;

  insert into public.promo_codes (code, discount_type, discount_value, active, expires_at, max_redemptions)
  values (v_code, p_discount_type, p_discount_value, true, p_expires_at, p_max_redemptions);

  insert into public.promo_code_redemptions (
    booking_id, promo_code, phone_hash, email_hash, booking_group_id, redeemed_at
  )
  select
    b.id,
    v_code,
    encode(extensions.digest(convert_to('phone:' || regexp_replace(b.phone, '[^0-9]', '', 'g'), 'UTF8'), 'sha256'), 'hex'),
    case
      when nullif(trim(coalesce(b.email, '')), '') is not null then
        encode(extensions.digest(convert_to('email:' || lower(trim(b.email)), 'UTF8'), 'sha256'), 'hex')
    end,
    b.booking_group_id,
    b.created_at
  from public.bookings as b
  where upper(trim(b.promo)) = v_code
    and b.discount_amount > 0
  on conflict (booking_id) do nothing;

  return query
  select p.code, p.discount_type, p.discount_value, p.active, p.expires_at, p.max_redemptions,
    (select count(distinct coalesce(r.booking_group_id, r.booking_id))::integer
      from public.promo_code_redemptions as r where r.promo_code = p.code),
    p.updated_at
  from public.promo_codes as p
  where p.code = v_code;
exception
  when unique_violation then
    raise exception 'A promo code with that name already exists.';
end;
$$;

revoke all on function public.create_promo_code(text, text, integer, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.create_promo_code(text, text, integer, timestamptz, integer) to authenticated;

create or replace function public.delete_promo_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.promo_codes
  where code = upper(trim(coalesce(p_code, '')));
  return found;
end;
$$;

revoke all on function public.delete_promo_code(text) from public, anon, authenticated;
grant execute on function public.delete_promo_code(text) to authenticated;

drop function if exists public.get_booking_pricing(text, integer, text);
create or replace function public.get_booking_group_pricing(
  p_courts text[],
  p_duration integer,
  p_time text,
  p_promo text
)
returns table (subtotal integer, discount_amount integer, estimated_total integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_time_parts text[];
  v_start_minute integer;
  v_end_minute integer;
  v_court_count integer;
  v_subtotal integer;
  v_discount_type text;
  v_discount_value integer;
  v_expires_at timestamptz;
  v_max_redemptions integer;
  v_used_redemptions integer;
  v_discount_amount integer := 0;
  v_code text := upper(trim(coalesce(p_promo, '')));
begin
  v_court_count := coalesce(cardinality(p_courts), 0);
  if v_court_count < 1 then
    raise exception 'Choose at least one court.';
  end if;

  if (select count(distinct selected.court) from unnest(p_courts) as selected(court)) <> v_court_count then
    raise exception 'A court can only be selected once.';
  end if;

  if p_duration is null or p_duration not between 1 and 3 then
    raise exception 'Choose a booking duration between 1 and 3 hours.';
  end if;

  v_time_parts := regexp_match(
    p_time,
    '^[[:space:]]*([0-9]{1,2}):([0-9]{2})[[:space:]]*(AM|PM)[[:space:]]*[–-][[:space:]]*([0-9]{1,2}):([0-9]{2})[[:space:]]*(AM|PM)[[:space:]]*$',
    'i'
  );
  if v_time_parts is null then
    raise exception 'Choose a valid booking time.';
  end if;

  if v_time_parts[1]::integer not between 1 and 12
    or v_time_parts[2]::integer not between 0 and 59
    or v_time_parts[4]::integer not between 1 and 12
    or v_time_parts[5]::integer not between 0 and 59 then
    raise exception 'Choose a valid booking time.';
  end if;

  v_start_minute := (
    (v_time_parts[1]::integer % 12)
    + case when upper(v_time_parts[3]) = 'PM' then 12 else 0 end
  ) * 60 + v_time_parts[2]::integer;
  v_end_minute := (
    (v_time_parts[4]::integer % 12)
    + case when upper(v_time_parts[6]) = 'PM' then 12 else 0 end
  ) * 60 + v_time_parts[5]::integer;

  if v_start_minute < 420 or v_end_minute > 1320
    or v_end_minute - v_start_minute <> p_duration * 60 then
    raise exception 'Choose a valid time that matches the booking duration and club hours.';
  end if;

  select sum(case when v_start_minute >= 1020 then r.night_rate else r.day_rate end * p_duration)::integer
  into v_subtotal
  from unnest(p_courts) as selected(court)
  join public.court_rates as r on r.court = selected.court;

  if v_subtotal is null then
    raise exception 'One or more selected courts are no longer available.';
  end if;

  if v_code <> '' then
    select p.discount_type, p.discount_value, p.expires_at, p.max_redemptions
    into v_discount_type, v_discount_value, v_expires_at, v_max_redemptions
    from public.promo_codes as p
    where p.code = v_code and p.active
    for update;

    if not found then
      raise exception 'That promo code is invalid or inactive.';
    end if;

    if v_expires_at is not null and v_expires_at <= clock_timestamp() then
      raise exception 'That promo code has expired.';
    end if;

    if v_max_redemptions is not null then
      select count(distinct coalesce(r.booking_group_id, r.booking_id))::integer
      into v_used_redemptions
      from public.promo_code_redemptions as r
      where r.promo_code = v_code;

      if v_used_redemptions >= v_max_redemptions then
        raise exception 'That promo code has reached its redemption limit.';
      end if;
    end if;

    if v_discount_type = 'percentage' then
      v_discount_amount := round(v_subtotal * v_discount_value / 100.0)::integer;
    else
      v_discount_amount := v_discount_value;
    end if;
    v_discount_amount := least(v_discount_amount, v_subtotal - v_court_count);
  end if;

  return query
  select v_subtotal, v_discount_amount, v_subtotal - v_discount_amount;
end;
$$;

revoke all on function public.get_booking_group_pricing(text[], integer, text, text) from public, anon, authenticated;

create or replace function public.guard_booking_promo_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pricing record;
  v_email_hash text;
begin
  new.promo := upper(trim(coalesce(new.promo, '')));
  if new.booking_group_id is null then
    select pricing.*
    into v_pricing
    from public.get_booking_group_pricing(
      array[new.court],
      new.duration,
      new."time",
      new.promo
    ) as pricing;

    if new.estimated_total is distinct from v_pricing.estimated_total
      or new.discount_amount is distinct from v_pricing.discount_amount then
      raise exception 'The court rate or promo code changed. Refresh the estimate and try again.';
    end if;
  end if;

  if new.promo <> '' then
    if nullif(trim(coalesce(new.email, '')), '') is null then
      raise exception 'An email address is required when using a promo code.';
    end if;

    if nullif(trim(coalesce(new.email, '')), '') is not null then
      v_email_hash := encode(extensions.digest(
        convert_to('email:' || lower(trim(new.email)), 'UTF8'),
        'sha256'
      ), 'hex');
    end if;

    if exists (
      select 1
      from public.promo_code_redemptions as r
      where r.promo_code = new.promo
        and r.email_hash = v_email_hash
        and (new.booking_group_id is null or r.booking_group_id is distinct from new.booking_group_id)
    ) then
      raise exception 'This promo code has already been used with this email address.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_booking_promo_redemption() from public, anon, authenticated;

create or replace function public.record_booking_promo_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_hash text;
begin
  if new.promo = '' then
    return new;
  end if;

  if nullif(trim(coalesce(new.email, '')), '') is not null then
    v_email_hash := encode(extensions.digest(
      convert_to('email:' || lower(trim(new.email)), 'UTF8'),
      'sha256'
    ), 'hex');
  end if;

  insert into public.promo_code_redemptions (
    booking_id, promo_code, phone_hash, email_hash, booking_group_id
  )
  values (new.id, new.promo, null, v_email_hash, new.booking_group_id);
  return new;
end;
$$;

revoke all on function public.record_booking_promo_redemption() from public, anon, authenticated;

drop trigger if exists guard_booking_promo_redemption on public.bookings;
create trigger guard_booking_promo_redemption
  before insert on public.bookings
  for each row
  execute function public.guard_booking_promo_redemption();

drop trigger if exists record_booking_promo_redemption on public.bookings;
create trigger record_booking_promo_redemption
  after insert on public.bookings
  for each row
  execute function public.record_booking_promo_redemption();

create or replace function public.create_booking_group(
  p_name text,
  p_phone text,
  p_email text,
  p_courts text[],
  p_players text,
  p_duration integer,
  p_date date,
  p_time text,
  p_estimated_total integer,
  p_promo text,
  p_notes text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pricing record;
  v_court text;
  v_rate integer;
  v_subtotal integer;
  v_remaining_discount integer;
  v_row_discount integer;
  v_booking_id uuid;
  v_booking_group_id uuid := extensions.gen_random_uuid();
  v_cancellation_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_code text := upper(trim(coalesce(p_promo, '')));
begin
  if p_date is null then
    raise exception 'Choose a booking date.';
  end if;

  if p_status not in ('pending', 'confirmed', 'cancelled') then
    raise exception 'Choose a valid booking status.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-date-block:' || p_date::text, 0));
  if exists (
    select 1
    from public.booking_date_blocks as date_block
    where date_block.blocked_date = p_date
      and (date_block.courts is null or date_block.courts && p_courts)
      and public.booking_time_overlaps_block(
        p_time,
        date_block.start_time,
        date_block.end_time
      )
  ) then
    raise exception using
      message = 'That time is blocked for maintenance or a club closure. Choose another time.',
      errcode = 'P0001';
  end if;

  select pricing.*
  into v_pricing
  from public.get_booking_group_pricing(p_courts, p_duration, p_time, v_code) as pricing;

  if p_estimated_total is distinct from v_pricing.estimated_total then
    raise exception 'The court rate or promo code changed. Refresh the estimate and try again.';
  end if;

  v_remaining_discount := v_pricing.discount_amount;
  for v_court in
    select selected.court
    from unnest(p_courts) with ordinality as selected(court, position)
    order by selected.position
  loop
    select case
      when (
        (substring(p_time from '^([0-9]{1,2})')::integer % 12)
        + case when upper(substring(p_time from '([AP]M)')) = 'PM' then 12 else 0 end
      ) >= 17 then r.night_rate
      else r.day_rate
    end
    into v_rate
    from public.court_rates as r
    where r.court = v_court;

    v_subtotal := v_rate * p_duration;
    v_row_discount := least(v_remaining_discount, v_subtotal - 1);
    v_remaining_discount := v_remaining_discount - v_row_discount;

    insert into public.bookings (
      name, phone, email, court, players, duration, date, "time",
      estimated_total, discount_amount, promo, notes, cancellation_token_hash,
      booking_group_id, status
    )
    values (
      p_name, p_phone, p_email, v_court, p_players, p_duration, p_date, p_time,
      v_subtotal - v_row_discount, v_row_discount, v_code, coalesce(p_notes, ''),
      encode(extensions.digest(convert_to(v_cancellation_token, 'UTF8'), 'sha256'), 'hex'),
      v_booking_group_id, p_status
    )
    returning id into v_booking_id;
  end loop;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_group_id', v_booking_group_id,
    'cancellation_token', v_cancellation_token
  );
end;
$$;

revoke all on function public.create_booking_group(
  text, text, text, text[], text, integer, date, text, integer, text, text, text
) from public, anon, authenticated;

drop function if exists public.validate_promo_code(text, integer, text);
drop function if exists public.validate_promo_code(text, integer, text, text, text);
drop function if exists public.validate_promo_code(text[], integer, text, text, text, text);
drop function if exists public.validate_promo_code(text[], integer, text, text, text);
create function public.validate_promo_code(
  p_courts text[],
  p_duration integer,
  p_time text,
  p_promo text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pricing record;
  v_discount_type text;
  v_discount_value integer;
  v_email_hash text;
  v_code text := upper(trim(coalesce(p_promo, '')));
begin
  if v_code = '' then
    raise exception 'Enter a promo code.';
  end if;

  select pricing.*
  into v_pricing
  from public.get_booking_group_pricing(p_courts, p_duration, p_time, v_code) as pricing;

  select p.discount_type, p.discount_value
  into v_discount_type, v_discount_value
  from public.promo_codes as p
  where p.code = v_code and p.active;

  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'Enter an email address to check this promo code.';
  end if;
  v_email_hash := encode(extensions.digest(
    convert_to('email:' || lower(trim(p_email)), 'UTF8'),
    'sha256'
  ), 'hex');

  if exists (
    select 1
    from public.promo_code_redemptions as r
    where r.promo_code = v_code
      and r.email_hash = v_email_hash
  ) then
    raise exception 'This promo code has already been used with this email address.';
  end if;

  return jsonb_build_object(
    'code', v_code,
    'discount_type', v_discount_type,
    'discount_value', v_discount_value,
    'courts', p_courts,
    'duration', p_duration,
    'time', p_time,
    'subtotal', v_pricing.subtotal,
    'discount_amount', v_pricing.discount_amount,
    'estimated_total', v_pricing.estimated_total
  );
end;
$$;

revoke all on function public.validate_promo_code(text[], integer, text, text, text) from public, anon, authenticated;
grant execute on function public.validate_promo_code(text[], integer, text, text, text) to anon, authenticated;

drop function if exists public.create_customer_booking(
  text, text, text, text, text, integer, date, text, integer, text, text
);
drop function if exists public.create_customer_booking(
  text, text, text, text[], text, integer, date, text, integer, text, text
);
create or replace function public.create_customer_booking(
  p_name text,
  p_email text,
  p_courts text[],
  p_players text,
  p_duration integer,
  p_date date,
  p_time text,
  p_estimated_total integer,
  p_promo text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identifier_hashes text[];
  v_identifier_hash text;
  v_hourly_attempts bigint;
  v_daily_attempts bigint;
  v_forwarded_for text;
  v_client_ip inet;
  v_ip_pepper text;
  v_ip_hash text;
  v_ip_hourly_attempts bigint;
  v_ip_daily_attempts bigint;
  v_booking_result jsonb;
begin
  if nullif(trim(coalesce(p_email, '')), '') is null
    or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  v_forwarded_for := coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-forwarded-for';
  v_forwarded_for := nullif(trim(split_part(coalesce(v_forwarded_for, ''), ',', 1)), '');
  begin
    v_client_ip := v_forwarded_for::inet;
  exception
    when invalid_text_representation then
      raise exception using
        message = 'We could not verify this network address. Please try again later.',
        errcode = 'P0001';
  end;

  if v_client_ip is null then
    raise exception using
      message = 'We could not verify this network address. Please try again later.',
      errcode = 'P0001';
  end if;

  select rate_limit_secret.pepper
  into v_ip_pepper
  from private.booking_ip_rate_limit_secrets as rate_limit_secret
  where rate_limit_secret.key_id;

  if v_ip_pepper is null then
    raise exception 'The booking rate limiter is not configured.';
  end if;

  v_ip_hash := encode(extensions.hmac(
    convert_to('booking-ip:' || v_client_ip::text, 'UTF8'),
    convert_to(v_ip_pepper, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_ip_hash, 0));

  select
    count(*) filter (where attempted_at >= now() - interval '1 hour'),
    count(*)
  into v_ip_hourly_attempts, v_ip_daily_attempts
  from private.booking_ip_submission_attempts
  where ip_hash = v_ip_hash
    and attempted_at >= now() - interval '24 hours';

  if v_ip_hourly_attempts >= 10 or v_ip_daily_attempts >= 30 then
    raise exception using
      message = 'Too many booking requests from this network. Please try again later.',
      errcode = 'P0001';
  end if;

  insert into private.booking_ip_submission_attempts (ip_hash)
  values (v_ip_hash);

  v_identifier_hashes := array(
    select identifier_hash
    from unnest(array[
      case
        when nullif(trim(coalesce(p_email, '')), '') is not null then
          encode(extensions.digest(
            convert_to('email:' || lower(trim(p_email)), 'UTF8'),
            'sha256'
          ), 'hex')
      end
    ]) as identifiers(identifier_hash)
    where identifier_hash is not null
    order by identifier_hash
  );

  foreach v_identifier_hash in array v_identifier_hashes loop
    perform pg_advisory_xact_lock(hashtextextended(v_identifier_hash, 0));

    select
      count(*) filter (where attempted_at >= now() - interval '1 hour'),
      count(*)
    into v_hourly_attempts, v_daily_attempts
    from public.booking_submission_attempts
    where identifier_hash = v_identifier_hash
      and attempted_at >= now() - interval '24 hours';

    if v_hourly_attempts >= 5 or v_daily_attempts >= 10 then
      raise exception using
        message = 'Too many booking requests. Please try again later.',
        errcode = 'P0001';
    end if;

    insert into public.booking_submission_attempts (identifier_hash)
    values (v_identifier_hash);

    delete from public.booking_submission_attempts
    where identifier_hash = v_identifier_hash
      and attempted_at < now() - interval '24 hours';
  end loop;

  v_booking_result := public.create_booking_group(
    p_name,
    null,
    p_email,
    p_courts,
    p_players,
    p_duration,
    p_date,
    p_time,
    p_estimated_total,
    p_promo,
    p_notes,
    'pending'
  );

  delete from private.booking_ip_submission_attempts
  where attempted_at < now() - interval '24 hours';

  return v_booking_result;
end;
$$;

revoke all on function public.create_customer_booking(
  text, text, text[], text, integer, date, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.create_customer_booking(
  text, text, text[], text, integer, date, text, integer, text, text
) to anon;

drop function if exists public.create_admin_booking(text, text, text[], text, integer, date, text, integer, text);
create or replace function public.create_admin_booking(
  p_name text,
  p_email text,
  p_courts text[],
  p_players text,
  p_duration integer,
  p_date date,
  p_time text,
  p_estimated_total integer,
  p_promo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(coalesce(p_email, '')), '') is null
    or lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  return public.create_booking_group(
    p_name,
    null,
    p_email,
    p_courts,
    p_players,
    p_duration,
    p_date,
    p_time,
    p_estimated_total,
    p_promo,
    '',
    'confirmed'
  );
end;
$$;

revoke all on function public.create_admin_booking(
  text, text, text[], text, integer, date, text, integer, text
) from public, anon, authenticated;
grant execute on function public.create_admin_booking(
  text, text, text[], text, integer, date, text, integer, text
) to authenticated;

drop function if exists public.cancel_customer_booking(uuid, text, text);
create function public.cancel_customer_booking(
  p_booking_id uuid,
  p_email text,
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking_group_id uuid;
  v_updated_count integer;
begin
  select b.booking_group_id
  into v_booking_group_id
  from public.bookings as b
  where b.id = p_booking_id
    and b.status in ('pending', 'confirmed')
    and b.created_at >= now() - interval '48 hours'
    and (
      (p_email is not null and lower(b.email) = lower(trim(p_email)))
      or (
        p_token is not null
        and b.cancellation_token_hash = encode(
          extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
          'hex'
        )
      )
    );

  if not found then
    return false;
  end if;

  update public.bookings as b
  set status = 'cancelled',
      cancellation_token_hash = null
  where (
      (v_booking_group_id is not null and b.booking_group_id = v_booking_group_id)
      or (v_booking_group_id is null and b.id = p_booking_id)
    )
    and b.status in ('pending', 'confirmed')
    and b.created_at >= now() - interval '48 hours';

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

revoke all on function public.cancel_customer_booking(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_customer_booking(uuid, text, text) to anon;

create or replace function public.list_public_bookings(p_start_date date, p_end_date date)
returns table (date date, "time" text, court text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.date, b.time, b.court
  from public.bookings as b
  where b.status = 'confirmed'
    and b.date >= p_start_date
    and b.date < p_end_date
$$;

revoke all on function public.list_public_bookings(date, date) from public, anon, authenticated;
grant execute on function public.list_public_bookings(date, date) to anon;

create or replace function public.list_unavailable_booking_times(
  p_booking_date date,
  p_court text
)
returns table ("time" text)
language sql
stable
security definer
set search_path = ''
as $$
  select b."time"
  from public.bookings as b
  where b.date = p_booking_date
    and b.court = p_court
    and b.status in ('pending', 'confirmed')
$$;

revoke all on function public.list_unavailable_booking_times(date, text) from public, anon, authenticated;
grant execute on function public.list_unavailable_booking_times(date, text) to anon;

drop function if exists public.list_booking_date_blocks(date, date);
create function public.list_booking_date_blocks(
  p_start_date date,
  p_end_date date
)
returns table (
  id uuid,
  blocked_date date,
  block_type text,
  start_time time,
  end_time time,
  courts text[],
  reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    date_block.id,
    date_block.blocked_date,
    date_block.block_type,
    date_block.start_time,
    date_block.end_time,
    date_block.courts,
    date_block.reason
  from public.booking_date_blocks as date_block
  where date_block.blocked_date >= p_start_date
    and date_block.blocked_date < p_end_date
  order by date_block.blocked_date, date_block.start_time
$$;

revoke all on function public.list_booking_date_blocks(date, date) from public, anon, authenticated;
grant execute on function public.list_booking_date_blocks(date, date) to anon, authenticated;

drop function if exists public.create_booking_date_block(date, text);
drop function if exists public.create_booking_date_block(date, text, time, time, text);
drop function if exists public.create_booking_date_block(date, text, text[], time, time, text);
create function public.create_booking_date_block(
  p_blocked_date date,
  p_block_type text,
  p_courts text[],
  p_start_time time,
  p_end_time time,
  p_reason text
)
returns table (
  id uuid,
  blocked_date date,
  block_type text,
  start_time time,
  end_time time,
  courts text[],
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block_id uuid;
  v_court_count integer;
begin
  if p_blocked_date is null
    or p_blocked_date < (clock_timestamp() at time zone 'Asia/Manila')::date then
    raise exception 'Choose today or a future date to block.';
  end if;

  if p_block_type is null or p_block_type not in ('maintenance', 'closed') then
    raise exception 'Choose maintenance or club closed as the block type.';
  end if;

  if p_courts is not null then
    v_court_count := cardinality(p_courts);
    if v_court_count < 1
      or (select count(distinct selected.court) from unnest(p_courts) as selected(court)) <> v_court_count
      or exists (
        select 1 from unnest(p_courts) as selected(court)
        where selected.court is null
          or not exists (select 1 from public.court_rates as rate where rate.court = selected.court)
      ) then
      raise exception 'Choose one or more valid courts, or choose Whole club.';
    end if;
  end if;

  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
    raise exception 'Choose an end time after the start time.';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 120 then
    raise exception 'Enter a reason between 2 and 120 characters.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-date-block:' || p_blocked_date::text, 0));

  if exists (
    select 1
    from public.bookings as booking
    where booking.date = p_blocked_date
      and booking.status in ('pending', 'confirmed')
      and (p_courts is null or booking.court = any(p_courts))
      and public.booking_time_overlaps_block(
        booking."time",
        p_start_time,
        p_end_time
      )
  ) then
    raise exception 'This time overlaps an active booking. Move or cancel that booking before adding this block.';
  end if;

  if exists (
    select 1
    from public.booking_date_blocks as date_block
    where date_block.blocked_date = p_blocked_date
      and (date_block.courts is null or p_courts is null or date_block.courts && p_courts)
      and p_start_time < date_block.end_time
      and date_block.start_time < p_end_time
  ) then
    raise exception 'This time overlaps another maintenance or closure block.';
  end if;

  insert into public.booking_date_blocks as inserted_block (
    blocked_date, block_type, start_time, end_time, courts, reason
  )
  values (
    p_blocked_date, p_block_type, p_start_time, p_end_time, p_courts, trim(p_reason)
  )
  returning inserted_block.id into v_block_id;

  select
    date_block.id,
    date_block.blocked_date,
    date_block.block_type,
    date_block.start_time,
    date_block.end_time,
    date_block.courts,
    date_block.reason
  into id, blocked_date, block_type, start_time, end_time, courts, reason
  from public.booking_date_blocks as date_block
  where date_block.id = v_block_id;
  return next;
end;
$$;

revoke all on function public.create_booking_date_block(date, text, text[], time, time, text) from public, anon, authenticated;
grant execute on function public.create_booking_date_block(date, text, text[], time, time, text) to authenticated;

drop function if exists public.delete_booking_date_block(date);
create or replace function public.delete_booking_date_block(p_block_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocked_date date;
begin
  select date_block.blocked_date
  into v_blocked_date
  from public.booking_date_blocks as date_block
  where date_block.id = p_block_id;

  if v_blocked_date is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-date-block:' || v_blocked_date::text, 0));

  delete from public.booking_date_blocks as date_block
  where date_block.id = p_block_id;
  return found;
end;
$$;

revoke all on function public.delete_booking_date_block(uuid) from public, anon, authenticated;
grant execute on function public.delete_booking_date_block(uuid) to authenticated;

drop policy if exists "Visitors can submit pending booking requests" on public.bookings;
create policy "Visitors can submit pending booking requests"
  on public.bookings
  for insert
  to anon
  with check (status = 'pending');

drop policy if exists "Signed-in staff can view booking requests" on public.bookings;
create policy "Signed-in staff can view booking requests"
  on public.bookings
  for select
  to authenticated
  using (true);

drop policy if exists "Signed-in staff can update booking requests" on public.bookings;
create policy "Signed-in staff can update booking requests"
  on public.bookings
  for update
  to authenticated
  using (true)
  with check (status in ('pending', 'confirmed', 'cancelled'));

drop policy if exists "Signed-in staff can create booking requests" on public.bookings;

drop policy if exists "Signed-in staff can delete booking requests" on public.bookings;
create policy "Signed-in staff can delete booking requests"
  on public.bookings
  for delete
  to authenticated
  using (true);

notify pgrst, 'reload schema';
