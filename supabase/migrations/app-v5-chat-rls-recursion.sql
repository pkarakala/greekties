-- ============================================================================
-- Greek Ties Mobile App - Migration: Chat RLS recursion fix
-- ============================================================================
-- The original chat policies made channels read channel_members while the
-- admin channel_members policies read channels. PostgreSQL rejects that
-- reciprocal policy evaluation with 42P17 (infinite recursion).
--
-- These SECURITY DEFINER helpers evaluate the access rules against the base
-- tables, then the row policies call the helpers without crossing policy
-- boundaries. The helpers do not accept a user id, so they can only evaluate
-- the currently authenticated user.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

create or replace function public.is_channel_visible(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.channels c
    join public.profiles p on p.user_id = auth.uid()
    where c.id = p_channel_id
      and c.chapter_id = p.chapter_id
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
set search_path = public
as $$
  select exists (
    select 1
    from public.channels c
    join public.profiles p on p.user_id = auth.uid()
    where c.id = p_channel_id
      and c.chapter_id = p.chapter_id
      and c.visibility = 'all'
  );
$$;

create or replace function public.is_chapter_admin_for_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.channels c
    join public.profiles p on p.user_id = auth.uid()
    where c.id = p_channel_id
      and c.chapter_id = p.chapter_id
      and p.admin_role in ('owner', 'manager')
  );
$$;

create or replace function public.is_chapter_admin(p_chapter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.chapter_id = p_chapter_id
      and p.admin_role in ('owner', 'manager')
  );
$$;

revoke all on function public.is_channel_visible(uuid) from public;
revoke all on function public.is_public_chapter_channel(uuid) from public;
revoke all on function public.is_chapter_admin_for_channel(uuid) from public;
revoke all on function public.is_chapter_admin(uuid) from public;
grant execute on function public.is_channel_visible(uuid) to authenticated;
grant execute on function public.is_public_chapter_channel(uuid) to authenticated;
grant execute on function public.is_chapter_admin_for_channel(uuid) to authenticated;
grant execute on function public.is_chapter_admin(uuid) to authenticated;

-- CHANNELS
drop policy if exists "Members see allowed channels" on public.channels;
create policy "Members see allowed channels"
  on public.channels for select
  to authenticated
  using (public.is_channel_visible(id));

drop policy if exists "Admins manage channels" on public.channels;
create policy "Admins manage channels"
  on public.channels for all
  to authenticated
  using (public.is_chapter_admin_for_channel(id))
  with check (public.is_chapter_admin(chapter_id));

-- CHANNEL MESSAGES
drop policy if exists "Read messages in visible channels" on public.channel_messages;
create policy "Read messages in visible channels"
  on public.channel_messages for select
  to authenticated
  using (public.is_channel_visible(channel_id));

drop policy if exists "Send messages to visible channels" on public.channel_messages;
create policy "Send messages to visible channels"
  on public.channel_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_channel_visible(channel_id)
  );

-- CHANNEL MEMBERS
drop policy if exists "Read own membership" on public.channel_members;
create policy "Read own membership"
  on public.channel_members for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Join public chapter channels" on public.channel_members;
create policy "Join public chapter channels"
  on public.channel_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_public_chapter_channel(channel_id)
  );

drop policy if exists "Update own membership" on public.channel_members;
create policy "Update own membership"
  on public.channel_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Leave channels" on public.channel_members;
create policy "Leave channels"
  on public.channel_members for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins read channel membership" on public.channel_members;
create policy "Admins read channel membership"
  on public.channel_members for select
  to authenticated
  using (public.is_chapter_admin_for_channel(channel_id));

drop policy if exists "Admins add channel members" on public.channel_members;
create policy "Admins add channel members"
  on public.channel_members for insert
  to authenticated
  with check (public.is_chapter_admin_for_channel(channel_id));

drop policy if exists "Admins remove channel members" on public.channel_members;
create policy "Admins remove channel members"
  on public.channel_members for delete
  to authenticated
  using (public.is_chapter_admin_for_channel(channel_id));

-- The v4 moderation policy also read channels from inside a policy. Keep its
-- chapter check on the recursion-free helper as well.
drop policy if exists "Admins delete chapter channel messages" on public.channel_messages;
create policy "Admins delete chapter channel messages"
  on public.channel_messages for delete
  to authenticated
  using (public.is_chapter_admin_for_channel(channel_id));
