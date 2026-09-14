-- Greek Ties V8 — controlled membership designation + consistent blocking.
-- Run after app-v7-p0-followup.sql. This file is intentionally forward-only:
-- it changes no live database until an operator explicitly applies it.

begin;

-- `profiles.role` is professional display text (for example, "Product
-- manager"). It must never be an authorization attribute. Existing values are
-- untrusted because clients could previously write "Alumni" themselves, so
-- every existing row starts fail-closed as `active`. Chapter admins must use
-- the RPC below to re-designate verified alumni before rollout completes.
alter table public.profiles
  add column if not exists membership_type text;

do $$
begin
  if exists (
    select 1
    from public.profiles
    where membership_type is not null
      and membership_type not in ('active', 'alumni')
  ) then
    raise exception 'V8 aborted: profiles.membership_type contains an unsupported value';
  end if;
end $$;

update public.profiles
set membership_type = 'active'
where membership_type is null;

alter table public.profiles
  alter column membership_type set default 'active',
  alter column membership_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%membership_type%active%alumni%'
  ) then
    alter table public.profiles
      add constraint profiles_membership_type_check
      check (membership_type in ('active', 'alumni'));
  end if;
end $$;

comment on column public.profiles.membership_type is
  'Server-controlled chapter membership designation used for authorization. Never use profiles.role for access control.';

-- Column grants are the first authorization boundary. Keep every intentionally
-- editable profile field from V7, but make the new membership field impossible
-- to update through the generic profiles endpoint.
revoke update (membership_type) on table public.profiles
  from public, anon, authenticated;

-- The only client-callable path for changing membership designation. Owners
-- may update any approved member in their chapter. Managers may update regular
-- approved members, but cannot modify owners/managers (including themselves).
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
  limit 1;

  select p.* into target
  from public.profiles p
  where p.id = target_profile_id;

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

-- Alumni-only channels use the controlled designation. Explicit private
-- membership remains valid only for exec/custom channels; an ordinary member
-- can no longer bypass alumni authorization via a channel_members row.
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
        or (c.visibility = 'alumni_only' and p.membership_type = 'alumni')
        or (
          c.visibility in ('exec_only', 'custom')
          and exists (
            select 1
            from public.channel_members cm
            where cm.channel_id = c.id
              and cm.user_id = auth.uid()
          )
        )
      )
  );
$$;

revoke all on function public.is_channel_visible(uuid)
  from public, anon, authenticated;
grant execute on function public.is_channel_visible(uuid)
  to authenticated, service_role;

-- One symmetric predicate backs every block-aware RLS policy. If either party
-- has blocked the other, discovery/content is hidden and direct interaction is
-- denied. SECURITY DEFINER is required because users may read only block rows
-- they created; the function exposes only a boolean involving auth.uid().
create or replace function public.has_block_relationship(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_other_user_id is not null
    and p_other_user_id is distinct from auth.uid()
    and exists (
      select 1
      from public.user_blocks ub
      where (ub.blocker_id = auth.uid() and ub.blocked_id = p_other_user_id)
         or (ub.blocker_id = p_other_user_id and ub.blocked_id = auth.uid())
    );
$$;

revoke all on function public.has_block_relationship(uuid)
  from public, anon, authenticated;
grant execute on function public.has_block_relationship(uuid)
  to authenticated, service_role;

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks(blocked_id, blocker_id);

-- The ordinary profiles SELECT policies hide blocked approved members in both
-- directions. Admins retain access to pending/rejected rows for membership
-- review, but the approved-member directory remains block-aware for admins too.
drop policy if exists "Approved members read approved chapter profiles" on public.profiles;
create policy "Approved members read approved chapter profiles"
  on public.profiles for select to authenticated
  using (
    status = 'approved'
    and public.is_approved_chapter_member(chapter_id)
    and not public.has_block_relationship(user_id)
  );

drop policy if exists "Approved admins read chapter profiles" on public.profiles;
drop policy if exists "Approved admins read non-approved chapter profiles" on public.profiles;
create policy "Approved admins read non-approved chapter profiles"
  on public.profiles for select to authenticated
  using (
    status is distinct from 'approved'
    and public.is_chapter_admin(chapter_id)
  );

-- A tightly scoped RPC keeps the blocked-members settings screen useful even
-- though normal profile SELECT correctly hides these rows.
create or replace function public.list_blocked_profiles()
returns table (
  blocked_id uuid,
  id uuid,
  user_id uuid,
  name text,
  avatar_url text,
  role text,
  company text
)
language sql
stable
security definer
set search_path = ''
as $$
  select ub.blocked_id, p.id, p.user_id, p.name, p.avatar_url, p.role, p.company
  from public.user_blocks ub
  left join public.profiles p on p.user_id = ub.blocked_id
  where ub.blocker_id = auth.uid()
  order by ub.created_at desc;
$$;

revoke all on function public.list_blocked_profiles()
  from public, anon, authenticated;
grant execute on function public.list_blocked_profiles()
  to authenticated, service_role;

-- Chat messages and reactions. Postgres Changes evaluates these same SELECT
-- policies for every subscriber, so blocked realtime inserts are suppressed at
-- the database boundary as well as filtered defensively in the client.
drop policy if exists "Approved members read visible channel messages" on public.channel_messages;
drop policy if exists "Approved members read visible unblocked channel messages" on public.channel_messages;
create policy "Approved members read visible unblocked channel messages"
  on public.channel_messages for select to authenticated
  using (
    public.is_channel_visible(channel_id)
    and not public.has_block_relationship(sender_id)
  );

drop policy if exists "Approved admins delete chapter channel messages" on public.channel_messages;
drop policy if exists "Approved admins delete unblocked chapter channel messages" on public.channel_messages;
create policy "Approved admins delete unblocked chapter channel messages"
  on public.channel_messages for delete to authenticated
  using (
    public.is_chapter_admin_for_channel(channel_id)
    and not public.has_block_relationship(sender_id)
  );

drop policy if exists "Approved members read visible message reactions" on public.message_reactions;
drop policy if exists "Approved members read visible unblocked message reactions" on public.message_reactions;
create policy "Approved members read visible unblocked message reactions"
  on public.message_reactions for select to authenticated
  using (
    not public.has_block_relationship(user_id)
    and exists (
      select 1 from public.channel_messages m
      where m.id = message_reactions.message_id
    )
  );

-- Jobs and events disappear when their creator is in a block relationship.
drop policy if exists "Approved members read chapter jobs" on public.job_postings;
drop policy if exists "Approved members read unblocked chapter jobs" on public.job_postings;
create policy "Approved members read unblocked chapter jobs"
  on public.job_postings for select to authenticated
  using (
    public.is_approved_chapter_member(chapter_id)
    and not public.has_block_relationship(posted_by)
  );

drop policy if exists "Approved admins update chapter jobs" on public.job_postings;
drop policy if exists "Approved admins update unblocked chapter jobs" on public.job_postings;
create policy "Approved admins update unblocked chapter jobs"
  on public.job_postings for update to authenticated
  using (
    public.is_chapter_admin(chapter_id)
    and not public.has_block_relationship(posted_by)
  )
  with check (
    public.is_chapter_admin(chapter_id)
    and not public.has_block_relationship(posted_by)
  );

drop policy if exists "Approved admins delete chapter jobs" on public.job_postings;
drop policy if exists "Approved admins delete unblocked chapter jobs" on public.job_postings;
create policy "Approved admins delete unblocked chapter jobs"
  on public.job_postings for delete to authenticated
  using (
    public.is_chapter_admin(chapter_id)
    and not public.has_block_relationship(posted_by)
  );

drop policy if exists "Approved members read chapter events" on public.events;
drop policy if exists "Approved members read unblocked chapter events" on public.events;
create policy "Approved members read unblocked chapter events"
  on public.events for select to authenticated
  using (
    public.is_approved_chapter_member(chapter_id)
    and not public.has_block_relationship(created_by)
  );

drop policy if exists "Approved admins update chapter events" on public.events;
drop policy if exists "Approved admins update unblocked chapter events" on public.events;
create policy "Approved admins update unblocked chapter events"
  on public.events for update to authenticated
  using (
    public.is_chapter_admin(chapter_id)
    and not public.has_block_relationship(created_by)
  )
  with check (
    public.is_chapter_admin(chapter_id)
    and not public.has_block_relationship(created_by)
  );

drop policy if exists "Approved admins delete chapter events" on public.events;
drop policy if exists "Approved admins delete unblocked chapter events" on public.events;
create policy "Approved admins delete unblocked chapter events"
  on public.events for delete to authenticated
  using (
    public.is_chapter_admin(chapter_id)
    and not public.has_block_relationship(created_by)
  );

drop policy if exists "Approved members read chapter RSVPs" on public.event_rsvps;
drop policy if exists "Approved members read unblocked chapter RSVPs" on public.event_rsvps;
create policy "Approved members read unblocked chapter RSVPs"
  on public.event_rsvps for select to authenticated
  using (
    not public.has_block_relationship(user_id)
    and exists (
      select 1 from public.events e
      where e.id = event_rsvps.event_id
    )
  );

-- Blocking terminates mentorship discovery, existing request visibility, and
-- all future direct actions in either direction.
drop policy if exists "Approved participants read mentorship requests" on public.mentorship_requests;
drop policy if exists "Approved unblocked participants read mentorship requests" on public.mentorship_requests;
create policy "Approved unblocked participants read mentorship requests"
  on public.mentorship_requests for select to authenticated
  using (
    (auth.uid() = from_user_id or auth.uid() = to_user_id)
    and public.is_approved_chapter_member(chapter_id)
    and not public.has_block_relationship(
      case
        when auth.uid() = from_user_id then to_user_id
        else from_user_id
      end
    )
  );

drop policy if exists "Approved members create mentorship requests" on public.mentorship_requests;
drop policy if exists "Approved members create unblocked mentorship requests" on public.mentorship_requests;
create policy "Approved members create unblocked mentorship requests"
  on public.mentorship_requests for insert to authenticated
  with check (
    auth.uid() = from_user_id
    and from_user_id is distinct from to_user_id
    and status = 'pending'
    and public.is_approved_chapter_member(chapter_id)
    and not public.has_block_relationship(to_user_id)
    and exists (
      select 1 from public.profiles recipient
      where recipient.user_id = mentorship_requests.to_user_id
        and recipient.chapter_id = mentorship_requests.chapter_id
        and recipient.status = 'approved'
    )
  );

drop policy if exists "Approved recipients respond to mentorship requests" on public.mentorship_requests;
drop policy if exists "Approved unblocked recipients respond to mentorship requests" on public.mentorship_requests;
create policy "Approved unblocked recipients respond to mentorship requests"
  on public.mentorship_requests for update to authenticated
  using (
    auth.uid() = to_user_id
    and public.is_approved_chapter_member(chapter_id)
    and not public.has_block_relationship(from_user_id)
  )
  with check (
    auth.uid() = to_user_id
    and status in ('accepted', 'declined')
    and public.is_approved_chapter_member(chapter_id)
    and not public.has_block_relationship(from_user_id)
  );

drop policy if exists "Approved participants read accepted mentorship messages" on public.messages;
drop policy if exists "Approved unblocked participants read mentorship messages" on public.messages;
create policy "Approved unblocked participants read mentorship messages"
  on public.messages for select to authenticated
  using (
    not public.has_block_relationship(sender_id)
    and exists (
      select 1 from public.mentorship_requests mr
      where mr.id = messages.request_id
        and mr.status = 'accepted'
        and (mr.from_user_id = auth.uid() or mr.to_user_id = auth.uid())
        and public.is_approved_chapter_member(mr.chapter_id)
        and not public.has_block_relationship(
          case
            when auth.uid() = mr.from_user_id then mr.to_user_id
            else mr.from_user_id
          end
        )
    )
  );

drop policy if exists "Approved participants send accepted mentorship messages" on public.messages;
drop policy if exists "Approved unblocked participants send mentorship messages" on public.messages;
create policy "Approved unblocked participants send mentorship messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.mentorship_requests mr
      where mr.id = messages.request_id
        and mr.status = 'accepted'
        and (mr.from_user_id = auth.uid() or mr.to_user_id = auth.uid())
        and public.is_approved_chapter_member(mr.chapter_id)
        and not public.has_block_relationship(
          case
            when auth.uid() = mr.from_user_id then mr.to_user_id
            else mr.from_user_id
          end
        )
    )
  );

drop policy if exists "Approved participants mark mentorship messages read" on public.messages;
drop policy if exists "Approved unblocked participants mark mentorship messages read" on public.messages;
create policy "Approved unblocked participants mark mentorship messages read"
  on public.messages for update to authenticated
  using (
    exists (
      select 1 from public.mentorship_requests mr
      where mr.id = messages.request_id
        and mr.status = 'accepted'
        and (mr.from_user_id = auth.uid() or mr.to_user_id = auth.uid())
        and public.is_approved_chapter_member(mr.chapter_id)
        and not public.has_block_relationship(
          case
            when auth.uid() = mr.from_user_id then mr.to_user_id
            else mr.from_user_id
          end
        )
    )
  )
  with check (
    exists (
      select 1 from public.mentorship_requests mr
      where mr.id = messages.request_id
        and mr.status = 'accepted'
        and (mr.from_user_id = auth.uid() or mr.to_user_id = auth.uid())
        and public.is_approved_chapter_member(mr.chapter_id)
        and not public.has_block_relationship(
          case
            when auth.uid() = mr.from_user_id then mr.to_user_id
            else mr.from_user_id
          end
        )
    )
  );

-- Store the actor for new durable notifications so later block changes hide
-- those rows and disable their deep links. Legacy actor-driven rows cannot be
-- reconstructed reliably, so the policies below hide them fail-closed;
-- actorless system/report notifications remain available.
alter table public.notifications
  add column if not exists actor_user_id uuid references auth.users(id) on delete cascade;

create index if not exists notifications_actor_user_idx
  on public.notifications(actor_user_id)
  where actor_user_id is not null;

drop policy if exists "Approved members read own notifications" on public.notifications;
drop policy if exists "Approved members read own unblocked notifications" on public.notifications;
create policy "Approved members read own unblocked notifications"
  on public.notifications for select to authenticated
  using (
    user_id = auth.uid()
    and public.is_approved_member()
    and (
      (actor_user_id is null and type in ('event_created', 'report_update'))
      or (
        actor_user_id is not null
        and not public.has_block_relationship(actor_user_id)
      )
    )
  );

drop policy if exists "Approved members update own notifications" on public.notifications;
drop policy if exists "Approved members update own unblocked notifications" on public.notifications;
create policy "Approved members update own unblocked notifications"
  on public.notifications for update to authenticated
  using (
    user_id = auth.uid()
    and public.is_approved_member()
    and (
      (actor_user_id is null and type in ('event_created', 'report_update'))
      or (
        actor_user_id is not null
        and not public.has_block_relationship(actor_user_id)
      )
    )
  )
  with check (
    user_id = auth.uid()
    and public.is_approved_member()
    and (
      (actor_user_id is null and type in ('event_created', 'report_update'))
      or (
        actor_user_id is not null
        and not public.has_block_relationship(actor_user_id)
      )
    )
  );

drop policy if exists "Approved members delete own notifications" on public.notifications;
drop policy if exists "Approved members delete own unblocked notifications" on public.notifications;
create policy "Approved members delete own unblocked notifications"
  on public.notifications for delete to authenticated
  using (
    user_id = auth.uid()
    and public.is_approved_member()
    and (
      (actor_user_id is null and type in ('event_created', 'report_update'))
      or (
        actor_user_id is not null
        and not public.has_block_relationship(actor_user_id)
      )
    )
  );

-- Keep the app's local block cache current across devices. Postgres Changes
-- still evaluates the existing blocker_id = auth.uid() SELECT policy.
alter table public.user_blocks replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'user_blocks'
     ) then
    alter publication supabase_realtime add table public.user_blocks;
  end if;
end $$;

-- Fail the whole transaction if the authorization/grant boundary is not what
-- this release expects.
do $$
begin
  if has_column_privilege(
    'authenticated', 'public.profiles', 'membership_type', 'update'
  ) then
    raise exception 'V8 aborted: authenticated can directly update profiles.membership_type';
  end if;
  if has_column_privilege(
    'authenticated', 'public.profiles', 'membership_type', 'insert'
  ) then
    raise exception 'V8 aborted: authenticated can directly insert profiles.membership_type';
  end if;
  if not has_column_privilege(
    'authenticated', 'public.profiles', 'role', 'update'
  ) then
    raise exception 'V8 aborted: profiles.role display text is no longer editable';
  end if;
  if not has_function_privilege(
    'authenticated', 'public.set_chapter_member_membership_type(uuid, text)', 'execute'
  ) then
    raise exception 'V8 aborted: membership designation RPC is unavailable to authenticated admins';
  end if;
end $$;

commit;
