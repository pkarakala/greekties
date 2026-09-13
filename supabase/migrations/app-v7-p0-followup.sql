-- Greek Ties V7 — live-schema follow-up for P0 authorization/invites.
-- Run after app-v6-p0-authorization-invites.sql. This migration is additive
-- and does not alter production until explicitly applied by an operator.

begin;

-- Live-schema preflight (verified against production through
-- information_schema.columns on 2026-09-12). Abort before changing anything
-- if a required app/grant column is missing. The explicit transaction also
-- makes every later policy/grant self-check fail closed as one unit.
do $$
declare
  missing_columns text;
begin
  select string_agg(required.column_name, ', ' order by required.column_name)
  into missing_columns
  from unnest(array[
    'id', 'user_id', 'chapter_id', 'name', 'email', 'class_year', 'role',
    'industry', 'city', 'company', 'job_title', 'open_to_mentor', 'bio',
    'status', 'admin_role', 'lat', 'lng', 'avatar_url', 'linkedin_url',
    'is_hiring'
  ]) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns actual
    where actual.table_schema = 'public'
      and actual.table_name = 'profiles'
      and actual.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'V7 aborted: public.profiles is missing required live columns: %',
      missing_columns;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chapters'
      and column_name = 'name'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chapters'
      and column_name = 'designation'
  ) then
    raise exception 'V7 aborted: public.chapters is missing name or designation';
  end if;
end $$;

-- RESTRICTIVE policies combine with every permissive policy using AND. Never
-- drop an unknown restrictive policy: it may encode an external security
-- requirement. But an authenticated SELECT/UPDATE restrictive policy could
-- silently make the app's owner profile editor unusable, so abort the entire
-- transaction and require an operator to review it before rollout.
do $$
declare
  blocking_policies text;
begin
  select string_agg(format('%I (%s)', pol.polname, pol.polcmd), ', ' order by pol.polname)
  into blocking_policies
  from pg_policy pol
  where pol.polrelid = 'public.profiles'::regclass
    and not pol.polpermissive
    and pol.polcmd in ('*', 'r', 'w')
    and (
      0 = any(pol.polroles)
      or exists (
        select 1
        from pg_roles r
        where r.oid = any(pol.polroles)
          and pg_has_role('authenticated', r.oid, 'usage')
      )
    );

  if blocking_policies is not null then
    raise exception using
      message = 'V7 aborted: restrictive profiles policies require manual review: '
        || blocking_policies,
      hint = 'V7 preserves restrictive policies. Confirm they allow an authenticated user to select and update every ordinary field on their own profile, then revise the policy or this preflight deliberately.';
  end if;
end $$;

-- The live database currently stores status as nullable text with no check.
-- Reject incompatible existing status checks rather than dropping unknown
-- constraints; otherwise rejected-member lifecycle RPCs could fail at runtime.
do $$
declare
  c record;
begin
  for c in
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    if c.definition not ilike '%rejected%' then
      raise exception 'profiles status constraint % excludes rejected: %', c.conname, c.definition;
    end if;
  end loop;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%rejected%'
  ) then
    alter table public.profiles
      add constraint profiles_status_lifecycle_check
      check (status is null or status in ('pending', 'approved', 'rejected'))
      not valid;
    alter table public.profiles validate constraint profiles_status_lifecycle_check;
  end if;
end $$;

-- Replace client-facing permissive policies on only these two tables. The
-- catalog scope handles differently named policies while preserving every
-- restrictive policy and policies granted solely to non-client roles.
do $$
declare
  p record;
begin
  for p in
    select n.nspname, c.relname, pol.polname
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'chapters')
      and pol.polpermissive
      and (
        0 = any(pol.polroles)
        or exists (
          select 1 from pg_roles r
          where r.oid = any(pol.polroles)
            and r.rolname in ('anon', 'authenticated', 'public')
        )
      )
  loop
    execute format('drop policy %I on %I.%I', p.polname, p.nspname, p.relname);
  end loop;
end $$;

create policy "Users request pending profile"
  on public.profiles for insert to authenticated
  with check (user_id = auth.uid() and chapter_id is not null and status = 'pending' and admin_role is null);
create policy "Users read own profile"
  on public.profiles for select to authenticated using (user_id = auth.uid());
create policy "Approved members read approved chapter profiles"
  on public.profiles for select to authenticated
  using (status = 'approved' and public.is_approved_chapter_member(chapter_id));
create policy "Approved admins read chapter profiles"
  on public.profiles for select to authenticated using (public.is_chapter_admin(chapter_id));
create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Approved members read own chapter"
  on public.chapters for select to authenticated using (public.is_approved_chapter_member(id));
create policy "Approved admins update own chapter"
  on public.chapters for update to authenticated
  using (public.is_chapter_admin(id)) with check (public.is_chapter_admin(id));

revoke all on table public.profiles, public.chapters from public, anon, authenticated;

-- Table-level REVOKE does not remove old column-level grants. Clear any such
-- client grants by catalog scope so a prior V6 run or manual grant cannot keep
-- protected columns writable after V7.
do $$
declare
  g record;
  grantee_sql text;
begin
  for g in
    select table_schema, table_name, column_name, grantee, privilege_type
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name in ('profiles', 'chapters')
      and lower(grantee) in ('public', 'anon', 'authenticated')
  loop
    grantee_sql := case
      when lower(g.grantee) = 'public' then 'public'
      else format('%I', g.grantee)
    end;
    execute format(
      'revoke %s (%I) on table %I.%I from %s',
      g.privilege_type, g.column_name, g.table_schema, g.table_name, grantee_sql
    );
  end loop;
end $$;

grant select on table public.profiles, public.chapters to authenticated;
grant insert (user_id, chapter_id, email, name, status, admin_role) on table public.profiles to authenticated;
grant update (
  name, class_year, role, industry, city, company, job_title, linkedin_url,
  bio, open_to_mentor, is_hiring, avatar_url, lat, lng
) on table public.profiles to authenticated;
grant update (name, designation) on table public.chapters to authenticated;

alter table public.profiles enable row level security;
alter table public.chapters enable row level security;

-- Commit only if the complete profile form remains writable and identity,
-- tenancy, approval, and admin-control columns remain unavailable to clients.
do $$
declare
  column_name text;
begin
  if has_table_privilege('authenticated', 'public.profiles', 'update') then
    raise exception 'V7 aborted: authenticated retained table-level profiles UPDATE';
  end if;

  foreach column_name in array array[
    'name', 'class_year', 'role', 'industry', 'city', 'company', 'job_title',
    'linkedin_url', 'bio', 'open_to_mentor', 'is_hiring', 'avatar_url', 'lat', 'lng'
  ]
  loop
    if not has_column_privilege(
      'authenticated', 'public.profiles', column_name, 'update'
    ) then
      raise exception 'V7 aborted: authenticated cannot update profiles.%', column_name;
    end if;
  end loop;

  foreach column_name in array array[
    'status', 'chapter_id', 'user_id', 'admin_role'
  ]
  loop
    if has_column_privilege(
      'authenticated', 'public.profiles', column_name, 'update'
    ) then
      raise exception 'V7 aborted: authenticated can update protected profiles.%', column_name;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_policy pol
    where pol.polrelid = 'public.profiles'::regclass
      and pol.polname = 'Users update own profile'
      and pol.polpermissive
      and pol.polcmd = 'w'
  ) then
    raise exception 'V7 aborted: owner profile UPDATE policy is missing';
  end if;
end $$;

commit;
