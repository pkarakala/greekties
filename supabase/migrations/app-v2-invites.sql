-- ============================================================================
-- Greek Ties Mobile App — Migration: Server-Side Invite Codes
-- ============================================================================
-- Replaces the V1 "invite code = raw chapter UUID + client inserts its own
-- approved profile" flow, which let any client pick chapter_id/status freely.
--
-- New model:
--   • chapter_invites — short rotatable codes, admin-managed, optional expiry.
--   • join_chapter(invite_code)      — SECURITY DEFINER; the ONLY way clients
--     create a profile. Validates the code and inserts the row server-side.
--   • create_chapter_invite(chapter) — SECURITY DEFINER; admin-only code mint.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query (after app-v1-*.sql).
-- Safe to re-run: create-if-not-exists + drop-then-create throughout.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ── CHAPTER INVITES ──────────────────────────────────────────────────────────
create table if not exists chapter_invites (
  id          uuid primary key default uuid_generate_v4(),
  chapter_id  uuid not null references chapters(id) on delete cascade,
  code        text not null unique,
  created_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz,                       -- null = never expires
  revoked     boolean not null default false,
  created_at  timestamptz default now()
);
create index if not exists chapter_invites_chapter_idx on chapter_invites(chapter_id);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- Only chapter admins can see or manage their chapter's invites. Joiners never
-- read this table directly — they go through join_chapter(), which runs as the
-- function owner and bypasses RLS for the single code lookup.
alter table chapter_invites enable row level security;

drop policy if exists "Admins manage chapter invites" on chapter_invites;
create policy "Admins manage chapter invites"
  on chapter_invites for all
  using (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = chapter_invites.chapter_id
        and admin_role in ('owner', 'manager')
    )
  )
  with check (
    exists (
      select 1 from profiles
      where user_id = auth.uid()
        and chapter_id = chapter_invites.chapter_id
        and admin_role in ('owner', 'manager')
    )
  );

-- ── RPC: join_chapter(invite_code) → uuid ────────────────────────────────────
-- Validates the code and creates the caller's profile server-side. The client
-- never chooses chapter_id or status. Returns the joined chapter_id.
--
-- SECURITY DEFINER + a pinned search_path so the function can read
-- chapter_invites / write profiles regardless of the caller's RLS, without
-- being hijackable via schema shadowing.
create or replace function join_chapter(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
  jwt_email text;
  jwt_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a chapter.';
  end if;

  -- Serialize concurrent joins by the same user (the live profiles table may
  -- not have a unique constraint on user_id, so the exists check alone could
  -- race). Transaction-scoped: released automatically on commit/rollback.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  -- Single-chapter model: one profiles row per user, ever.
  if exists (select 1 from profiles where user_id = auth.uid()) then
    raise exception 'You already belong to a chapter. Each account can only join one chapter.';
  end if;

  -- Codes are minted lowercase; normalize what the user typed/pasted so
  -- autocapitalized links and stray whitespace still work.
  select * into invite
  from chapter_invites
  where code = lower(trim(invite_code));

  if not found then
    raise exception 'This invite code is not valid.';
  end if;
  if invite.revoked then
    raise exception 'This invite code has been revoked.';
  end if;
  if invite.expires_at is not null and invite.expires_at < now() then
    raise exception 'This invite code has expired.';
  end if;

  -- Pull identity from the JWT where available (may be null for some
  -- providers — profile editing fills the gaps later).
  jwt_email := auth.jwt() ->> 'email';
  jwt_name  := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    jwt_email
  );

  -- Relies on profiles.id / created_at having server-side defaults (standard
  -- on the live table per greek-ties-app-docs).
  insert into profiles (user_id, chapter_id, email, name, status)
  values (auth.uid(), invite.chapter_id, jwt_email, jwt_name, 'approved');

  return invite.chapter_id;
end;
$$;

-- Supabase's default privileges grant EXECUTE to `anon` individually, so
-- revoking from `public` alone isn't enough — revoke `anon` explicitly.
revoke execute on function join_chapter(text) from public;
revoke execute on function join_chapter(text) from anon;
grant execute on function join_chapter(text) to authenticated;

-- ── RPC: create_chapter_invite(target_chapter_id) → text ────────────────────
-- Admin-only mint. Returns the new 8-char code. Codes are lowercase hex —
-- fine for share links; rotate by revoking old rows and minting a new one.
create or replace function create_chapter_invite(target_chapter_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  -- Caller must be an owner/manager of the target chapter.
  if not exists (
    select 1 from profiles
    where user_id = auth.uid()
      and chapter_id = target_chapter_id
      and admin_role in ('owner', 'manager')
  ) then
    raise exception 'Only chapter admins can create invite links.';
  end if;

  -- Reuse the chapter's existing active code (the app fetches the link on
  -- every settings visit — don't mint a new row each time). Rotation =
  -- revoke the old row, then this mints a fresh code.
  select code into new_code
  from chapter_invites
  where chapter_id = target_chapter_id
    and not revoked
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;
  if new_code is not null then
    return new_code;
  end if;

  -- 8 hex chars = ~4 billion codes; a unique-constraint collision is
  -- astronomically rare, but retry rather than surface a raw 23505 error.
  loop
    new_code := substr(md5(gen_random_uuid()::text), 1, 8);
    begin
      insert into chapter_invites (chapter_id, code, created_by)
      values (target_chapter_id, new_code, auth.uid());
      return new_code;
    exception when unique_violation then
      null;  -- collision — loop and mint a fresh code
    end;
  end loop;
end;
$$;

revoke execute on function create_chapter_invite(uuid) from public;
revoke execute on function create_chapter_invite(uuid) from anon;
grant execute on function create_chapter_invite(uuid) to authenticated;

-- ============================================================================
-- ACCEPTANCE TESTS (run after applying):
--   1. As a non-admin member: select create_chapter_invite('<their chapter>');
--      → MUST error "Only chapter admins can create invite links."
--   2. As an admin: mint a code, then as a fresh signed-up user:
--      select join_chapter('<code>'); → returns the chapter_id and a profiles
--      row appears with status = 'approved'.
--   3. Call join_chapter again as that user → MUST error "already belong".
--   4. select * from chapter_invites; as a non-admin → MUST return 0 rows.
-- ============================================================================
