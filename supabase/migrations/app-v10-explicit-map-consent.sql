-- V10 explicit map consent — DRAFT, UNAPPLIED. Requires V6–V9.
-- Intentionally one-time (adding existing columns fails rather than resetting
-- later opt-ins on a rerun). No legacy coordinates constitute consent.
begin;

alter table public.profiles
  add column map_sharing_enabled boolean not null default false,
  add column map_revision uuid not null default gen_random_uuid();
update public.profiles set lat = null, lng = null;

-- Old clients cannot write coordinates, even after a later explicit opt-in.
-- Ordinary profile fields and all existing RLS policies remain unchanged.
revoke update (lat, lng, map_sharing_enabled, map_revision),
  insert (lat, lng, map_sharing_enabled, map_revision)
  on public.profiles from public, anon, authenticated;

create function public.invalidate_profile_map_location()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.city is distinct from old.city
     or new.map_sharing_enabled is distinct from old.map_sharing_enabled
     or new.membership_type is distinct from old.membership_type
     or new.status is distinct from old.status
     or new.chapter_id is distinct from old.chapter_id then
    new.lat := null;
    new.lng := null;
    new.map_revision := gen_random_uuid();
  end if;
  if not new.map_sharing_enabled or nullif(btrim(new.city), '') is null
     or new.membership_type <> 'alumni' or new.status is distinct from 'approved' then
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end;
$$;
create trigger invalidate_profile_map_location
before update on public.profiles
for each row execute function public.invalidate_profile_map_location();
revoke all on function public.invalidate_profile_map_location() from public, anon, authenticated;

alter table public.profiles add constraint profiles_map_consent_check check (
  (lat is null and lng is null) or
  (lat is not null and lng is not null and lat between -90 and 90
   and lng between -180 and 180 and map_sharing_enabled
   and nullif(btrim(city), '') is not null
   and membership_type = 'alumni' and status is not distinct from 'approved')
);

-- Phase 1 removes the previous pin BEFORE any lookup. CAS also rejects an
-- older delayed save that arrives after opt-out or a different city save.
create function public.set_profile_map_sharing(
  target_profile_id uuid, expected_revision uuid, profile_city text, sharing_enabled boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare next_revision uuid;
begin
  if auth.uid() is null or sharing_enabled is null then
    raise exception 'Sign in to change map sharing.';
  end if;
  update public.profiles
  set city = nullif(btrim(profile_city), ''),
      map_sharing_enabled = sharing_enabled and nullif(btrim(profile_city), '') is not null,
      lat = null, lng = null, map_revision = gen_random_uuid()
  where id = target_profile_id and user_id = auth.uid()
    and status = 'approved' and chapter_id is not null
    and map_revision = expected_revision
  returning map_revision into next_revision;
  if next_revision is null then
    raise exception 'Map settings changed or membership is unavailable. Reload your profile and retry.';
  end if;
  return next_revision;
end;
$$;

-- Phase 2 can only finish the exact, still-consenting revision. It cannot
-- change the city, consent, designation, chapter, or another member's row.
create function public.complete_profile_map_location(
  target_profile_id uuid, expected_revision uuid, latitude double precision, longitude double precision
) returns uuid language plpgsql security definer set search_path = '' as $$
declare next_revision uuid;
begin
  if latitude is null or longitude is null
     or not (latitude between -90 and 90) or not (longitude between -180 and 180) then
    raise exception 'Invalid city coordinates.';
  end if;
  update public.profiles set lat = latitude, lng = longitude,
    map_revision = gen_random_uuid()
  where id = target_profile_id and user_id = auth.uid()
    and status = 'approved' and chapter_id is not null
    and membership_type = 'alumni' and map_sharing_enabled
    and nullif(btrim(city), '') is not null and map_revision = expected_revision
  returning map_revision into next_revision;
  return next_revision;
end;
$$;

revoke all on function public.set_profile_map_sharing(uuid, uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.complete_profile_map_location(uuid, uuid, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.set_profile_map_sharing(uuid, uuid, text, boolean)
  to authenticated;
grant execute on function public.complete_profile_map_location(uuid, uuid, double precision, double precision)
  to authenticated;

-- Fail closed if inherited/table-level grants would defeat column revocation.
do $$
declare field text;
begin
  foreach field in array array['lat', 'lng', 'map_sharing_enabled', 'map_revision',
    'membership_type', 'status', 'chapter_id', 'user_id', 'admin_role'] loop
    if has_column_privilege('authenticated', 'public.profiles', field, 'update') then
      raise exception 'V10 aborted: authenticated can update protected column %', field;
    end if;
  end loop;
  foreach field in array array['lat', 'lng', 'map_sharing_enabled', 'map_revision'] loop
    if has_column_privilege('authenticated', 'public.profiles', field, 'insert') then
      raise exception 'V10 aborted: authenticated can insert map column %', field;
    end if;
  end loop;
end $$;
commit;
