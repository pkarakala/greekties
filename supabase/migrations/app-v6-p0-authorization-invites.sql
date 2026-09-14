-- ============================================================================
-- Greek Ties Mobile App - P0 authorization and invite hardening
-- ============================================================================
-- Applies the approved-profile gate consistently to chapter-scoped features,
-- removes direct invite/profile creation from API clients, and replaces broad
-- table grants with the minimum operations used by the app.
--
-- Run after every app-v1 through app-v5 migration.
-- ============================================================================

-- ── APPROVED-MEMBERSHIP HELPERS ─────────────────────────────────────────────
-- SECURITY DEFINER avoids recursive profiles/channels RLS evaluation. Every
-- object reference is schema-qualified and search_path is empty.

create or replace function public.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.status = 'approved'
  );
$$;

create or replace function public.is_approved_chapter_member(p_chapter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.chapter_id = p_chapter_id
      and p.status = 'approved'
  );
$$;

-- Preserve the existing helper names used by the v5 chat policies, but make
-- approval status part of every decision.
create or replace function public.auth_user_chapter_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.chapter_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.status = 'approved'
  limit 1;
$$;

create or replace function public.is_chapter_admin(p_chapter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.chapter_id = p_chapter_id
      and p.status = 'approved'
      and p.admin_role in ('owner', 'manager')
  );
$$;

create or replace function public.is_channel_visible(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.channels c
    join public.profiles p on p.user_id = auth.uid()
    where c.id = p_channel_id
      and c.chapter_id = p.chapter_id
      and p.status = 'approved'
      and (
        c.visibility = 'all'
        or (c.visibility = 'alumni_only' and p.role = 'Alumni')
        or exists (
          select 1
          from public.channel_members cm
          where cm.channel_id = c.id
            and cm.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.is_public_chapter_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.channels c
    join public.profiles p on p.user_id = auth.uid()
    where c.id = p_channel_id
      and c.chapter_id = p.chapter_id
      and c.visibility = 'all'
      and p.status = 'approved'
  );
$$;

create or replace function public.is_chapter_admin_for_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.channels c
    join public.profiles p on p.user_id = auth.uid()
    where c.id = p_channel_id
      and c.chapter_id = p.chapter_id
      and p.status = 'approved'
      and p.admin_role in ('owner', 'manager')
  );
$$;

revoke all on function public.is_approved_member() from public, anon, authenticated;
revoke all on function public.is_approved_chapter_member(uuid) from public, anon, authenticated;
revoke all on function public.auth_user_chapter_id() from public, anon, authenticated;
revoke all on function public.is_chapter_admin(uuid) from public, anon, authenticated;
revoke all on function public.is_channel_visible(uuid) from public, anon, authenticated;
revoke all on function public.is_public_chapter_channel(uuid) from public, anon, authenticated;
revoke all on function public.is_chapter_admin_for_channel(uuid) from public, anon, authenticated;
grant execute on function public.is_approved_member() to authenticated, service_role;
grant execute on function public.is_approved_chapter_member(uuid) to authenticated, service_role;
grant execute on function public.auth_user_chapter_id() to authenticated, service_role;
grant execute on function public.is_chapter_admin(uuid) to authenticated, service_role;
grant execute on function public.is_channel_visible(uuid) to authenticated, service_role;
grant execute on function public.is_public_chapter_channel(uuid) to authenticated, service_role;
grant execute on function public.is_chapter_admin_for_channel(uuid) to authenticated, service_role;

-- ── INVITE RPCS ──────────────────────────────────────────────────────────────
-- Preview is safe for signed-out invite recipients: it returns only the three
-- display fields used by the confirmation screen and never exposes invite rows.
create or replace function public.resolve_chapter_invite(invite_code text)
returns table (
  chapter_id uuid,
  chapter_name text,
  chapter_designation text,
  chapter_university text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.designation, c.university
  from public.chapter_invites i
  join public.chapters c on c.id = i.chapter_id
  where i.code = lower(btrim($1))
    and not i.revoked
    and (i.expires_at is null or i.expires_at > now())
  limit 1;
$$;

create or replace function public.join_chapter(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.chapter_invites%rowtype;
  existing_profile public.profiles%rowtype;
  jwt_email text;
  jwt_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a chapter.';
  end if;

  if invite_code is null or btrim(invite_code) = '' then
    raise exception 'This invite code is not valid.';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select i.* into invite
  from public.chapter_invites i
  where i.code = lower(btrim(invite_code));

  if not found then
    raise exception 'This invite code is not valid.';
  end if;
  if invite.revoked then
    raise exception 'This invite code has been revoked.';
  end if;
  if invite.expires_at is not null and invite.expires_at <= now() then
    raise exception 'This invite code has expired.';
  end if;

  select p.* into existing_profile
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1;
  if found then
    if existing_profile.status = 'rejected' and existing_profile.chapter_id = invite.chapter_id then
      update public.profiles
      set status = 'approved', admin_role = null
      where id = existing_profile.id;
      return invite.chapter_id;
    end if;
    raise exception 'You already belong to a chapter. Each account can only join one chapter.';
  end if;

  jwt_email := auth.jwt() ->> 'email';
  jwt_name := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    jwt_email
  );

  insert into public.profiles (user_id, chapter_id, email, name, status)
  values (auth.uid(), invite.chapter_id, jwt_email, jwt_name, 'approved');

  return invite.chapter_id;
end;
$$;

create or replace function public.create_chapter_invite(target_chapter_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.is_chapter_admin(target_chapter_id) then
    raise exception 'Only approved chapter admins can create invite links.';
  end if;

  select i.code into new_code
  from public.chapter_invites i
  where i.chapter_id = target_chapter_id
    and not i.revoked
    and (i.expires_at is null or i.expires_at > now())
  order by i.created_at desc
  limit 1;
  if new_code is not null then
    return new_code;
  end if;

  loop
    -- 96 bits for newly minted codes; existing 8-character codes remain valid.
    new_code := substr(md5(gen_random_uuid()::text), 1, 24);
    begin
      insert into public.chapter_invites (chapter_id, code, created_by)
      values (target_chapter_id, new_code, auth.uid());
      return new_code;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;

revoke all on function public.resolve_chapter_invite(text) from public, anon, authenticated;
revoke all on function public.join_chapter(text) from public, anon, authenticated;
revoke all on function public.create_chapter_invite(uuid) from public, anon, authenticated;
grant execute on function public.resolve_chapter_invite(text) to anon, authenticated, service_role;
grant execute on function public.join_chapter(text) to authenticated, service_role;
grant execute on function public.create_chapter_invite(uuid) to authenticated, service_role;

-- ── SERVER-ONLY PROFILE APPROVAL/ADMIN LIFECYCLE ─────────────────────────────
-- Clients may request a pending profile and edit ordinary fields on their own
-- row, but only these RPCs can change approval/admin state.
create or replace function public.approve_chapter_member(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.profiles%rowtype;
begin
  select p.* into actor
  from public.profiles p
  where p.user_id = auth.uid()
    and p.status = 'approved'
    and p.admin_role in ('owner', 'manager')
  limit 1;

  select p.* into target
  from public.profiles p
  where p.id = target_profile_id;

  if actor.id is null or target.id is null or actor.chapter_id is distinct from target.chapter_id then
    raise exception 'Only approved chapter admins can approve this member.';
  end if;
  if target.status is distinct from 'pending' then
    raise exception 'Only pending profiles can be approved.';
  end if;

  update public.profiles
  set status = 'approved', admin_role = null
  where id = target_profile_id;
end;
$$;

create or replace function public.reject_chapter_member(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.profiles%rowtype;
begin
  select p.* into actor
  from public.profiles p
  where p.user_id = auth.uid()
    and p.status = 'approved'
    and p.admin_role in ('owner', 'manager')
  limit 1;

  select p.* into target
  from public.profiles p
  where p.id = target_profile_id;

  if actor.id is null or target.id is null or actor.chapter_id is distinct from target.chapter_id then
    raise exception 'Only approved chapter admins can reject this member.';
  end if;
  if target.user_id = actor.user_id then
    raise exception 'Admins cannot remove their own chapter access.';
  end if;
  if target.admin_role = 'owner' then
    raise exception 'Chapter owners cannot be removed.';
  end if;
  if target.admin_role = 'manager' and actor.admin_role <> 'owner' then
    raise exception 'Only the chapter owner can remove a manager.';
  end if;

  update public.profiles
  set status = 'rejected', admin_role = null
  where id = target_profile_id;
end;
$$;

create or replace function public.set_chapter_member_admin_role(
  target_profile_id uuid,
  target_admin_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.profiles%rowtype;
begin
  if target_admin_role is not null and target_admin_role <> 'manager' then
    raise exception 'The requested admin role is not allowed.';
  end if;

  select p.* into actor
  from public.profiles p
  where p.user_id = auth.uid()
    and p.status = 'approved'
    and p.admin_role = 'owner'
  limit 1;

  select p.* into target
  from public.profiles p
  where p.id = target_profile_id;

  if actor.id is null or target.id is null or actor.chapter_id is distinct from target.chapter_id then
    raise exception 'Only the approved chapter owner can change admin roles.';
  end if;
  if target.status is distinct from 'approved' or target.admin_role = 'owner' then
    raise exception 'This member''s admin role cannot be changed.';
  end if;

  update public.profiles
  set admin_role = target_admin_role
  where id = target_profile_id;
end;
$$;

revoke all on function public.approve_chapter_member(uuid) from public, anon, authenticated;
revoke all on function public.reject_chapter_member(uuid) from public, anon, authenticated;
revoke all on function public.set_chapter_member_admin_role(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_chapter_member(uuid) to authenticated, service_role;
grant execute on function public.reject_chapter_member(uuid) to authenticated, service_role;
grant execute on function public.set_chapter_member_admin_role(uuid, text) to authenticated, service_role;

-- ── PROFILES AND CHAPTERS ────────────────────────────────────────────────────
-- The secure join/create RPCs already serialize per user. This database
-- invariant also blocks direct pending-profile races and multi-chapter rows.
create unique index if not exists profiles_one_row_per_user_idx
  on public.profiles(user_id)
  where user_id is not null;

-- The linked-project SQL runner may preserve objects from a previous failed
-- submission even when this file's transaction reports an error. Drop only
-- the replacement policies owned by this migration so a retry is safe. V7
-- must still be run after V6 and must not be followed by a V6 rerun.
do $$
begin
  drop policy if exists "Users request pending profile" on public.profiles;
  drop policy if exists "Users read own profile" on public.profiles;
  drop policy if exists "Approved members read approved chapter profiles" on public.profiles;
  drop policy if exists "Approved admins read chapter profiles" on public.profiles;
  drop policy if exists "Users update own profile" on public.profiles;

  drop policy if exists "Approved members read own chapter" on public.chapters;
  drop policy if exists "Approved admins update own chapter" on public.chapters;

  drop policy if exists "Approved members see allowed channels" on public.channels;
  drop policy if exists "Approved admins read channels" on public.channels;
  drop policy if exists "Approved admins create channels" on public.channels;
  drop policy if exists "Approved admins update channels" on public.channels;
  drop policy if exists "Approved admins delete channels" on public.channels;

  drop policy if exists "Approved members read visible channel messages" on public.channel_messages;
  drop policy if exists "Approved members send visible channel messages" on public.channel_messages;
  drop policy if exists "Approved members delete own channel messages" on public.channel_messages;
  drop policy if exists "Approved admins delete chapter channel messages" on public.channel_messages;

  drop policy if exists "Approved members read own channel membership" on public.channel_members;
  drop policy if exists "Approved members join public chapter channels" on public.channel_members;
  drop policy if exists "Approved members update own channel membership" on public.channel_members;
  drop policy if exists "Approved members leave channels" on public.channel_members;
  drop policy if exists "Approved admins read channel membership" on public.channel_members;
  drop policy if exists "Approved admins add channel members" on public.channel_members;
  drop policy if exists "Approved admins remove channel members" on public.channel_members;

  drop policy if exists "Approved members read visible message reactions" on public.message_reactions;
  drop policy if exists "Approved members react to visible messages" on public.message_reactions;
  drop policy if exists "Approved members remove own reactions" on public.message_reactions;

  drop policy if exists "Approved admins manage chapter invites" on public.chapter_invites;

  drop policy if exists "Approved members read chapter jobs" on public.job_postings;
  drop policy if exists "Approved members post jobs" on public.job_postings;
  drop policy if exists "Approved members update own jobs" on public.job_postings;
  drop policy if exists "Approved admins update chapter jobs" on public.job_postings;
  drop policy if exists "Approved members delete own jobs" on public.job_postings;
  drop policy if exists "Approved admins delete chapter jobs" on public.job_postings;

  drop policy if exists "Approved participants read mentorship requests" on public.mentorship_requests;
  drop policy if exists "Approved members create mentorship requests" on public.mentorship_requests;
  drop policy if exists "Approved recipients respond to mentorship requests" on public.mentorship_requests;
  drop policy if exists "Approved participants read accepted mentorship messages" on public.messages;
  drop policy if exists "Approved participants send accepted mentorship messages" on public.messages;
  drop policy if exists "Approved participants mark mentorship messages read" on public.messages;

  drop policy if exists "Approved members file own reports" on public.content_reports;
  drop policy if exists "Approved members read own reports" on public.content_reports;
  drop policy if exists "Approved admins read chapter reports" on public.content_reports;
  drop policy if exists "Approved admins update chapter reports" on public.content_reports;

  drop policy if exists "Approved members read own blocks" on public.user_blocks;
  drop policy if exists "Approved members create own blocks" on public.user_blocks;
  drop policy if exists "Approved members delete own blocks" on public.user_blocks;

  drop policy if exists "Approved members read chapter events" on public.events;
  drop policy if exists "Approved members create chapter events" on public.events;
  drop policy if exists "Approved creators update own events" on public.events;
  drop policy if exists "Approved admins update chapter events" on public.events;
  drop policy if exists "Approved creators delete own events" on public.events;
  drop policy if exists "Approved admins delete chapter events" on public.events;

  drop policy if exists "Approved members read chapter RSVPs" on public.event_rsvps;
  drop policy if exists "Approved members manage own RSVPs" on public.event_rsvps;

  drop policy if exists "Approved members read own notifications" on public.notifications;
  drop policy if exists "Approved members update own notifications" on public.notifications;
  drop policy if exists "Approved members delete own notifications" on public.notifications;
end $$;

drop policy if exists "Chapter members can read profiles" on public.profiles;
drop policy if exists "Chapter president can update member status" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users request pending profile"
  on public.profiles for insert to authenticated
  with check (
    user_id = auth.uid()
    and chapter_id is not null
    and status = 'pending'
    and admin_role is null
  );

create policy "Users read own profile"
  on public.profiles for select to authenticated
  using (user_id = auth.uid());

create policy "Approved members read approved chapter profiles"
  on public.profiles for select to authenticated
  using (
    status = 'approved'
    and public.is_approved_chapter_member(chapter_id)
  );

create policy "Approved admins read chapter profiles"
  on public.profiles for select to authenticated
  using (public.is_chapter_admin(chapter_id));

create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Authenticated users can create chapters" on public.chapters;
drop policy if exists "Chapter creator can update their chapter" on public.chapters;
drop policy if exists "Chapters are viewable by authenticated users" on public.chapters;

create policy "Approved members read own chapter"
  on public.chapters for select to authenticated
  using (public.is_approved_chapter_member(id));

create policy "Approved admins update own chapter"
  on public.chapters for update to authenticated
  using (public.is_chapter_admin(id))
  with check (public.is_chapter_admin(id));

-- ── CHANNELS, MEMBERSHIP, MESSAGES, AND REACTIONS ────────────────────────────
drop policy if exists "Members see allowed channels" on public.channels;
create policy "Approved members see allowed channels"
  on public.channels for select to authenticated
  using (public.is_channel_visible(id));

drop policy if exists "Admins manage channels" on public.channels;
create policy "Approved admins read channels"
  on public.channels for select to authenticated
  using (public.is_chapter_admin_for_channel(id));
create policy "Approved admins create channels"
  on public.channels for insert to authenticated
  with check (
    public.is_chapter_admin(chapter_id)
    and created_by = auth.uid()
  );
create policy "Approved admins update channels"
  on public.channels for update to authenticated
  using (public.is_chapter_admin_for_channel(id))
  with check (public.is_chapter_admin(chapter_id));
create policy "Approved admins delete channels"
  on public.channels for delete to authenticated
  using (public.is_chapter_admin_for_channel(id));

drop policy if exists "Read messages in visible channels" on public.channel_messages;
create policy "Approved members read visible channel messages"
  on public.channel_messages for select to authenticated
  using (public.is_channel_visible(channel_id));

drop policy if exists "Send messages to visible channels" on public.channel_messages;
create policy "Approved members send visible channel messages"
  on public.channel_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_channel_visible(channel_id));

drop policy if exists "Delete own messages" on public.channel_messages;
create policy "Approved members delete own channel messages"
  on public.channel_messages for delete to authenticated
  using (sender_id = auth.uid() and public.is_channel_visible(channel_id));

drop policy if exists "Admins delete chapter channel messages" on public.channel_messages;
create policy "Approved admins delete chapter channel messages"
  on public.channel_messages for delete to authenticated
  using (public.is_chapter_admin_for_channel(channel_id));

drop policy if exists "Read own membership" on public.channel_members;
create policy "Approved members read own channel membership"
  on public.channel_members for select to authenticated
  using (user_id = auth.uid() and public.is_channel_visible(channel_id));

drop policy if exists "Join public chapter channels" on public.channel_members;
create policy "Approved members join public chapter channels"
  on public.channel_members for insert to authenticated
  with check (user_id = auth.uid() and public.is_public_chapter_channel(channel_id));

drop policy if exists "Update own membership" on public.channel_members;
create policy "Approved members update own channel membership"
  on public.channel_members for update to authenticated
  using (user_id = auth.uid() and public.is_channel_visible(channel_id))
  with check (user_id = auth.uid() and public.is_channel_visible(channel_id));

drop policy if exists "Leave channels" on public.channel_members;
create policy "Approved members leave channels"
  on public.channel_members for delete to authenticated
  using (user_id = auth.uid() and public.is_channel_visible(channel_id));

drop policy if exists "Admins read channel membership" on public.channel_members;
create policy "Approved admins read channel membership"
  on public.channel_members for select to authenticated
  using (public.is_chapter_admin_for_channel(channel_id));

drop policy if exists "Admins add channel members" on public.channel_members;
create policy "Approved admins add channel members"
  on public.channel_members for insert to authenticated
  with check (
    public.is_chapter_admin_for_channel(channel_id)
    and exists (
      select 1 from public.profiles p
      join public.channels c on c.id = channel_members.channel_id
      where p.user_id = channel_members.user_id
        and p.chapter_id = c.chapter_id
        and p.status = 'approved'
    )
  );

drop policy if exists "Admins remove channel members" on public.channel_members;
create policy "Approved admins remove channel members"
  on public.channel_members for delete to authenticated
  using (public.is_chapter_admin_for_channel(channel_id));

drop policy if exists "Read reactions on visible messages" on public.message_reactions;
create policy "Approved members read visible message reactions"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.channel_messages m
      where m.id = message_reactions.message_id
    )
  );

drop policy if exists "React to visible messages" on public.message_reactions;
create policy "Approved members react to visible messages"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.channel_messages m
      where m.id = message_reactions.message_id
    )
  );

drop policy if exists "Remove own reactions" on public.message_reactions;
create policy "Approved members remove own reactions"
  on public.message_reactions for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.channel_messages m
      where m.id = message_reactions.message_id
    )
  );

-- ── INVITE TABLE ─────────────────────────────────────────────────────────────
drop policy if exists "Admins manage chapter invites" on public.chapter_invites;
create policy "Approved admins manage chapter invites"
  on public.chapter_invites for all to authenticated
  using (public.is_chapter_admin(chapter_id))
  with check (public.is_chapter_admin(chapter_id));

-- ── JOBS ─────────────────────────────────────────────────────────────────────
drop policy if exists "Members read chapter jobs" on public.job_postings;
create policy "Approved members read chapter jobs"
  on public.job_postings for select to authenticated
  using (public.is_approved_chapter_member(chapter_id));

drop policy if exists "Members post jobs" on public.job_postings;
create policy "Approved members post jobs"
  on public.job_postings for insert to authenticated
  with check (
    posted_by = auth.uid()
    and public.is_approved_chapter_member(chapter_id)
  );

drop policy if exists "Members manage own jobs" on public.job_postings;
create policy "Approved members update own jobs"
  on public.job_postings for update to authenticated
  using (posted_by = auth.uid() and public.is_approved_chapter_member(chapter_id))
  with check (posted_by = auth.uid() and public.is_approved_chapter_member(chapter_id));

drop policy if exists "Admins manage chapter jobs" on public.job_postings;
create policy "Approved admins update chapter jobs"
  on public.job_postings for update to authenticated
  using (public.is_chapter_admin(chapter_id))
  with check (public.is_chapter_admin(chapter_id));

drop policy if exists "Members delete own jobs" on public.job_postings;
create policy "Approved members delete own jobs"
  on public.job_postings for delete to authenticated
  using (posted_by = auth.uid() and public.is_approved_chapter_member(chapter_id));

drop policy if exists "Admins delete chapter jobs" on public.job_postings;
create policy "Approved admins delete chapter jobs"
  on public.job_postings for delete to authenticated
  using (public.is_chapter_admin(chapter_id));

-- ── MENTORSHIP REQUESTS AND MESSAGES ─────────────────────────────────────────
drop policy if exists "Users can view their own mentorship requests" on public.mentorship_requests;
create policy "Approved participants read mentorship requests"
  on public.mentorship_requests for select to authenticated
  using (
    (auth.uid() = from_user_id or auth.uid() = to_user_id)
    and public.is_approved_chapter_member(chapter_id)
  );

drop policy if exists "Users can insert mentorship requests" on public.mentorship_requests;
create policy "Approved members create mentorship requests"
  on public.mentorship_requests for insert to authenticated
  with check (
    auth.uid() = from_user_id
    and from_user_id is distinct from to_user_id
    and status = 'pending'
    and public.is_approved_chapter_member(chapter_id)
    and exists (
      select 1 from public.profiles recipient
      where recipient.user_id = mentorship_requests.to_user_id
        and recipient.chapter_id = mentorship_requests.chapter_id
        and recipient.status = 'approved'
    )
  );

drop policy if exists "Users can update their own mentorship requests" on public.mentorship_requests;
create policy "Approved recipients respond to mentorship requests"
  on public.mentorship_requests for update to authenticated
  using (
    auth.uid() = to_user_id
    and public.is_approved_chapter_member(chapter_id)
  )
  with check (
    auth.uid() = to_user_id
    and status in ('accepted', 'declined')
    and public.is_approved_chapter_member(chapter_id)
  );

drop policy if exists "Participants can read messages" on public.messages;
create policy "Approved participants read accepted mentorship messages"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.mentorship_requests mr
      where mr.id = messages.request_id
        and mr.status = 'accepted'
        and (mr.from_user_id = auth.uid() or mr.to_user_id = auth.uid())
        and public.is_approved_chapter_member(mr.chapter_id)
    )
  );

drop policy if exists "Users can insert messages" on public.messages;
create policy "Approved participants send accepted mentorship messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.mentorship_requests mr
      where mr.id = messages.request_id
        and mr.status = 'accepted'
        and (mr.from_user_id = auth.uid() or mr.to_user_id = auth.uid())
        and public.is_approved_chapter_member(mr.chapter_id)
    )
  );

drop policy if exists "Participants can mark messages read" on public.messages;
create policy "Approved participants mark mentorship messages read"
  on public.messages for update to authenticated
  using (
    exists (
      select 1 from public.mentorship_requests mr
      where mr.id = messages.request_id
        and mr.status = 'accepted'
        and (mr.from_user_id = auth.uid() or mr.to_user_id = auth.uid())
        and public.is_approved_chapter_member(mr.chapter_id)
    )
  )
  with check (
    exists (
      select 1 from public.mentorship_requests mr
      where mr.id = messages.request_id
        and mr.status = 'accepted'
        and (mr.from_user_id = auth.uid() or mr.to_user_id = auth.uid())
        and public.is_approved_chapter_member(mr.chapter_id)
    )
  );

-- ── MODERATION ────────────────────────────────────────────────────────────────
drop policy if exists "Users file own reports" on public.content_reports;
create policy "Approved members file own reports"
  on public.content_reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and (
      (chapter_id is null and public.is_approved_member())
      or public.is_approved_chapter_member(chapter_id)
    )
  );

drop policy if exists "Users read own reports" on public.content_reports;
create policy "Approved members read own reports"
  on public.content_reports for select to authenticated
  using (reporter_id = auth.uid() and public.is_approved_member());

drop policy if exists "Admins read chapter reports" on public.content_reports;
create policy "Approved admins read chapter reports"
  on public.content_reports for select to authenticated
  using (public.is_chapter_admin(chapter_id));

drop policy if exists "Admins update chapter reports" on public.content_reports;
create policy "Approved admins update chapter reports"
  on public.content_reports for update to authenticated
  using (public.is_chapter_admin(chapter_id))
  with check (public.is_chapter_admin(chapter_id));

drop policy if exists "Manage own blocks" on public.user_blocks;
create policy "Approved members read own blocks"
  on public.user_blocks for select to authenticated
  using (blocker_id = auth.uid() and public.is_approved_member());
create policy "Approved members create own blocks"
  on public.user_blocks for insert to authenticated
  with check (
    blocker_id = auth.uid()
    and blocker_id is distinct from blocked_id
    and public.is_approved_member()
  );
create policy "Approved members delete own blocks"
  on public.user_blocks for delete to authenticated
  using (blocker_id = auth.uid() and public.is_approved_member());

-- ── OTHER CHAPTER-SCOPED FEATURES ────────────────────────────────────────────
-- Events use the same chapter membership primitive and must not become an
-- alternate access path for pending/rejected profiles.
drop policy if exists "Members read chapter events" on public.events;
create policy "Approved members read chapter events"
  on public.events for select to authenticated
  using (public.is_approved_chapter_member(chapter_id));
drop policy if exists "Members create chapter events" on public.events;
create policy "Approved members create chapter events"
  on public.events for insert to authenticated
  with check (created_by = auth.uid() and public.is_approved_chapter_member(chapter_id));
drop policy if exists "Creators update own events" on public.events;
create policy "Approved creators update own events"
  on public.events for update to authenticated
  using (created_by = auth.uid() and public.is_approved_chapter_member(chapter_id))
  with check (created_by = auth.uid() and public.is_approved_chapter_member(chapter_id));
drop policy if exists "Admins update chapter events" on public.events;
create policy "Approved admins update chapter events"
  on public.events for update to authenticated
  using (public.is_chapter_admin(chapter_id))
  with check (public.is_chapter_admin(chapter_id));
drop policy if exists "Creators delete own events" on public.events;
create policy "Approved creators delete own events"
  on public.events for delete to authenticated
  using (created_by = auth.uid() and public.is_approved_chapter_member(chapter_id));
drop policy if exists "Admins delete chapter events" on public.events;
create policy "Approved admins delete chapter events"
  on public.events for delete to authenticated
  using (public.is_chapter_admin(chapter_id));

drop policy if exists "Members read chapter RSVPs" on public.event_rsvps;
create policy "Approved members read chapter RSVPs"
  on public.event_rsvps for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_rsvps.event_id
    )
  );
drop policy if exists "Users manage own RSVPs" on public.event_rsvps;
create policy "Approved members manage own RSVPs"
  on public.event_rsvps for all to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.events e where e.id = event_rsvps.event_id)
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.events e where e.id = event_rsvps.event_id)
  );

-- Stored chapter notifications must disappear as soon as a profile is no
-- longer approved. The send-push Edge Function applies the same check before
-- writing new rows or delivering push payloads.
drop policy if exists "Users read own notifications" on public.notifications;
create policy "Approved members read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid() and public.is_approved_member());
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Approved members update own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid() and public.is_approved_member())
  with check (user_id = auth.uid() and public.is_approved_member());
drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Approved members delete own notifications"
  on public.notifications for delete to authenticated
  using (user_id = auth.uid() and public.is_approved_member());

-- ── LEAST-PRIVILEGE API GRANTS ───────────────────────────────────────────────
-- RLS controls rows; grants control which operations/columns reach RLS at all.
revoke all on table public.profiles, public.chapters, public.chapter_invites,
  public.channels, public.channel_members, public.channel_messages,
  public.message_reactions, public.job_postings, public.mentorship_requests,
  public.messages, public.content_reports, public.user_blocks, public.events,
  public.event_rsvps, public.notifications from public, anon, authenticated;

-- Clear column grants left by earlier migrations before rebuilding them.
revoke update (last_read_at) on public.channel_members from authenticated;

grant select on public.profiles to authenticated;
grant insert (
  user_id, chapter_id, name, email, class_year, role, industry, city, company,
  job_title, open_to_mentor, bio, theme_preference, lat, lng, avatar_url,
  linkedin_url, seeking_mentor, chapter_role, is_hiring, status, admin_role
) on public.profiles to authenticated;
grant update (
  name, email, class_year, role, industry, city, company, job_title,
  open_to_mentor, bio, theme_preference, lat, lng, avatar_url, linkedin_url,
  seeking_mentor, chapter_role, is_hiring
) on public.profiles to authenticated;

grant select on public.chapters to authenticated;
grant update (name, designation) on public.chapters to authenticated;

-- chapter_invites intentionally has no anon/authenticated table grants.
grant select, insert, delete on public.channels to authenticated;
grant update (name, description, visibility) on public.channels to authenticated;

grant select, insert, delete on public.channel_members to authenticated;
grant update (last_read_at) on public.channel_members to authenticated;

grant select, insert, delete on public.channel_messages to authenticated;
grant select, insert, delete on public.message_reactions to authenticated;

grant select, insert, delete on public.job_postings to authenticated;
grant update (
  title, company, location, industry, description, apply_url, is_open
) on public.job_postings to authenticated;

grant select, insert on public.mentorship_requests to authenticated;
grant update (status) on public.mentorship_requests to authenticated;
grant select, insert on public.messages to authenticated;
grant update (is_read) on public.messages to authenticated;

grant select, insert on public.content_reports to authenticated;
grant update (status) on public.content_reports to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

grant select, insert, delete on public.events to authenticated;
grant update (title, description, location, category, starts_at, ends_at)
  on public.events to authenticated;
grant select, insert, delete on public.event_rsvps to authenticated;
grant update (status) on public.event_rsvps to authenticated;

grant select, delete on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

-- Keep RLS enabled even if an earlier manual change disabled it.
alter table public.profiles enable row level security;
alter table public.chapters enable row level security;
alter table public.chapter_invites enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.channel_messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.job_postings enable row level security;
alter table public.mentorship_requests enable row level security;
alter table public.messages enable row level security;
alter table public.content_reports enable row level security;
alter table public.user_blocks enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.notifications enable row level security;
