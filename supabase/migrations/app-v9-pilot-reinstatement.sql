-- V9 pilot policy correction — DRAFT, UNAPPLIED.
-- Requires V6, V7, V8 in order. No RLS, block, or membership-type changes.
-- Shared invites cannot undo removal, including for older clients.
begin;

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
