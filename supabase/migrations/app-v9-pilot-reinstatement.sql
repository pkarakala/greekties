-- V9 pilot policy correction — DRAFT, UNAPPLIED.
-- Requires V6, V7, V8 in order. No RLS or block-policy changes.
-- Serializes existing admin RPC authorization and prevents invite reactivation.
-- Shared invites cannot undo removal, including for older clients.
begin;

-- Serialize the server-only admin lifecycle with role/status changes. A
-- manager must not use a stale target role to reject a newly promoted manager.
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
  limit 1
  for share;

  select p.* into target
  from public.profiles p
  where p.id = target_profile_id
  for update;

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
  limit 1
  for share;

  select p.* into target
  from public.profiles p
  where p.id = target_profile_id
  for update;

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
  limit 1
  for share;

  select p.* into target
  from public.profiles p
  where p.id = target_profile_id
  for update;

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

-- Recheck membership authority under row locks. Without these locks, a
-- manager's stale target read could race an owner's promotion/demotion and
-- still update the target after its admin role changed.
create or replace function public.set_chapter_member_membership_type(
  target_profile_id uuid,
  target_membership_type text
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
  if target_membership_type is null
     or target_membership_type not in ('active', 'alumni') then
    raise exception 'The requested membership type is not allowed.';
  end if;

  select p.* into actor
  from public.profiles p
  where p.user_id = auth.uid()
    and p.status = 'approved'
    and p.admin_role in ('owner', 'manager')
  limit 1
  for share;

  select p.* into target
  from public.profiles p
  where p.id = target_profile_id
  for update;

  if actor.id is null
     or target.id is null
     or actor.chapter_id is distinct from target.chapter_id then
    raise exception 'Only approved chapter admins can change membership type.';
  end if;
  if target.status is distinct from 'approved' then
    raise exception 'Only approved members can receive a membership designation.';
  end if;
  if actor.admin_role = 'manager' and target.admin_role is not null then
    raise exception 'Managers cannot change another chapter admin''s membership type.';
  end if;

  update public.profiles
  set membership_type = target_membership_type
  where id = target_profile_id;
end;
$$;

revoke all on function public.set_chapter_member_membership_type(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_chapter_member_membership_type(uuid, text)
  to authenticated, service_role;

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
  limit 1
  for update;
  if found then
    if existing_profile.status = 'rejected' then
      raise exception 'A chapter admin must reinstate your membership. Invitations cannot restore removed access.';
    end if;
    if existing_profile.chapter_id = invite.chapter_id then
      if existing_profile.status = 'approved' then
        return invite.chapter_id;
      end if;
      if existing_profile.status = 'pending' then
        raise exception 'Your membership is pending chapter admin approval.';
      end if;
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

create or replace function public.reinstate_chapter_member(target_profile_id uuid)
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
    and p.chapter_id is not null
    and p.admin_role in ('owner', 'manager')
  limit 1
  for share;

  if actor.id is null then
    raise exception 'Only approved chapter admins can reinstate this member.';
  end if;

  select p.* into target
  from public.profiles p
  where p.id = target_profile_id
  for update;

  if target.id is null or actor.chapter_id is distinct from target.chapter_id then
    raise exception 'Only approved chapter admins can reinstate this member.';
  end if;
  if target.status is distinct from 'rejected' then
    raise exception 'Only removed or rejected members can be reinstated.';
  end if;

  -- Reinstatement never restores admin privileges. The controlled membership
  -- designation and block relationships remain exactly as they were.
  update public.profiles
  set status = 'approved', admin_role = null
  where id = target_profile_id;
end;
$$;

revoke all on function public.join_chapter(text) from public, anon, authenticated;
revoke all on function public.reinstate_chapter_member(uuid) from public, anon, authenticated;
grant execute on function public.join_chapter(text) to authenticated, service_role;
grant execute on function public.reinstate_chapter_member(uuid) to authenticated, service_role;

commit;
