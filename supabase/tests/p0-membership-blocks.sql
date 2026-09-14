-- P0 acceptance: controlled membership designation + symmetric blocking.
-- Run after every migration through app-v8-security-membership-blocks.sql.

begin;
set local role postgres;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'membership_type'
  ) then
    raise exception 'V8 acceptance: profiles.membership_type is missing';
  end if;
  if has_column_privilege(
    'authenticated', 'public.profiles', 'membership_type', 'update'
  ) then
    raise exception 'V8 acceptance: authenticated can directly update membership_type';
  end if;
  if has_column_privilege(
    'authenticated', 'public.profiles', 'membership_type', 'insert'
  ) then
    raise exception 'V8 acceptance: authenticated can directly insert membership_type';
  end if;
  if not has_column_privilege(
    'authenticated', 'public.profiles', 'role', 'update'
  ) then
    raise exception 'V8 acceptance: professional role display text is no longer editable';
  end if;
end;
$$;

insert into auth.users (id, email)
values
  ('a1000000-0000-4000-8000-000000000001', 'v8-member-a@example.invalid'),
  ('a1000000-0000-4000-8000-000000000002', 'v8-member-b@example.invalid'),
  ('a1000000-0000-4000-8000-000000000003', 'v8-owner@example.invalid'),
  ('a1000000-0000-4000-8000-000000000004', 'v8-cross-chapter@example.invalid'),
  ('a1000000-0000-4000-8000-000000000005', 'v8-pending@example.invalid');

insert into public.chapters (id, name, designation, university)
values
  ('a2000000-0000-4000-8000-000000000001', 'V8 Chapter A', 'Alpha', 'Test U'),
  ('a2000000-0000-4000-8000-000000000002', 'V8 Chapter B', 'Beta', 'Test U');

insert into public.profiles (
  id, user_id, chapter_id, name, role, membership_type, status, admin_role
)
values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Member A', 'Student', 'active', 'approved', null),
  ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'Member B', 'Software Engineer', 'active', 'approved', null),
  ('a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'Owner', 'Chapter volunteer', 'active', 'approved', 'owner'),
  ('a3000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000002', 'Cross Chapter', 'Alumni', 'active', 'approved', null),
  ('a3000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000001', 'Pending', 'Alumni', 'active', 'pending', null);

insert into public.channels (id, chapter_id, name, visibility)
values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'v8-general', 'all'),
  ('a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'v8-alumni', 'alumni_only'),
  ('a4000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'v8-exec', 'exec_only'),
  ('a4000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000002', 'v8-cross', 'all');

-- Explicit membership grants exec/custom access only. It must not be a second
-- path around the controlled alumni designation.
insert into public.channel_members (channel_id, user_id)
values
  ('a4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001'),
  ('a4000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001');

insert into public.channel_messages (id, channel_id, sender_id, content)
values
  ('a5000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'message from a'),
  ('a5000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'message from b');

insert into public.message_reactions (message_id, user_id, emoji)
values
  ('a5000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', '👍');

insert into public.job_postings (id, chapter_id, posted_by, title, company)
values
  ('a6000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'A job', 'Test Co'),
  ('a6000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'B job', 'Test Co');

insert into public.events (
  id, chapter_id, created_by, title, category, starts_at
)
values
  ('a7000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'A event', 'chapter', now() + interval '1 day'),
  ('a7000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'B event', 'chapter', now() + interval '2 days');

insert into public.event_rsvps (event_id, user_id, status)
values
  ('a7000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'going');

insert into public.mentorship_requests (
  id, from_user_id, to_user_id, chapter_id, status, message
)
values (
  'a8000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'accepted',
  'request from b'
);

insert into public.messages (id, request_id, sender_id, content)
values (
  'a9000000-0000-4000-8000-000000000001',
  'a8000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'direct message from b'
);

insert into public.notifications (
  id, user_id, actor_user_id, type, title, url
)
values
  ('aa000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'mentorship_message', 'Notification from B', '/inbox/a8000000-0000-4000-8000-000000000001'),
  ('aa000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'channel_message', 'Notification from A', '/chats/a4000000-0000-4000-8000-000000000001'),
  ('aa000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', null, 'channel_message', 'Legacy actor notification', '/chats/a4000000-0000-4000-8000-000000000001'),
  ('aa000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', null, 'report_update', 'System report update', '/notifications');

-- Ordinary member: professional role remains editable, but neither role text
-- nor explicit alumni-channel membership can grant alumni authorization.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
declare
  denied boolean := false;
begin
  update public.profiles set role = 'Alumni' where user_id = auth.uid();
  if (select role from public.profiles where user_id = auth.uid()) <> 'Alumni' then
    raise exception 'V8 acceptance: ordinary professional role edit failed';
  end if;
  if exists (
    select 1 from public.channels
    where id = 'a4000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'V8 acceptance: free-text role or channel membership granted alumni access';
  end if;
  if not exists (
    select 1 from public.channels
    where id = 'a4000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'V8 acceptance: explicit exec membership stopped working';
  end if;
  if exists (
    select 1 from public.channels
    where id = 'a4000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'V8 acceptance: cross-chapter channel became visible';
  end if;

  begin
    update public.profiles set membership_type = 'alumni' where user_id = auth.uid();
    raise exception 'V8 acceptance: member directly changed membership_type';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.set_chapter_member_membership_type(
      'a3000000-0000-4000-8000-000000000001', 'alumni'
    );
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'V8 acceptance: non-admin used the membership RPC';
  end if;
end;
$$;

-- Approved owner: controlled designation succeeds only in the same chapter.
set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
declare
  denied boolean := false;
begin
  perform public.set_chapter_member_membership_type(
    'a3000000-0000-4000-8000-000000000001', 'alumni'
  );
  if not exists (
    select 1 from public.profiles
    where id = 'a3000000-0000-4000-8000-000000000001'
      and membership_type = 'alumni'
      and role = 'Alumni'
      and status = 'approved'
      and chapter_id = 'a2000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'V8 acceptance: admin designation altered display/approval/chapter data';
  end if;

  begin
    perform public.set_chapter_member_membership_type(
      'a3000000-0000-4000-8000-000000000004', 'alumni'
    );
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'V8 acceptance: admin designated a cross-chapter member';
  end if;
end;
$$;

-- A manager can designate a regular approved member but cannot modify an
-- owner/manager. This verifies the same hierarchy used by the admin UI.
set local role postgres;
update public.profiles
set admin_role = 'manager'
where user_id = 'a1000000-0000-4000-8000-000000000002';
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
declare
  denied boolean := false;
begin
  perform public.set_chapter_member_membership_type(
    'a3000000-0000-4000-8000-000000000001', 'active'
  );
  perform public.set_chapter_member_membership_type(
    'a3000000-0000-4000-8000-000000000001', 'alumni'
  );

  begin
    perform public.set_chapter_member_membership_type(
      'a3000000-0000-4000-8000-000000000003', 'alumni'
    );
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'V8 acceptance: manager changed an owner membership type';
  end if;
end;
$$;

-- The designated member gets alumni access without losing exec membership,
-- and changing professional display text does not remove that access.
set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
begin
  update public.profiles set role = 'Product designer' where user_id = auth.uid();
  if (select count(*) from public.channels) <> 3 then
    raise exception 'V8 acceptance: controlled alumni/exec/all authorization is wrong';
  end if;
  if exists (
    select 1 from public.profiles
    where status <> 'approved' or chapter_id <> 'a2000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'V8 acceptance: approved/chapter profile authorization regressed';
  end if;
end;
$$;

-- Block B. Every B-authored/owned surface becomes invisible, direct actions
-- fail, and the safe blocked-list RPC remains available for unblocking.
insert into public.user_blocks (blocker_id, blocked_id)
values (auth.uid(), 'a1000000-0000-4000-8000-000000000002');

do $$
declare
  denied boolean := false;
  affected_rows integer;
begin
  if exists (select 1 from public.profiles where user_id = 'a1000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.job_postings where posted_by = 'a1000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.events where created_by = 'a1000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.channel_messages where sender_id = 'a1000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.message_reactions where user_id = 'a1000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.event_rsvps where user_id = 'a1000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.mentorship_requests where id = 'a8000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.messages where id = 'a9000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.notifications where actor_user_id = 'a1000000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.notifications where actor_user_id = auth.uid())
     or exists (select 1 from public.notifications where title = 'Legacy actor notification')
     or not exists (select 1 from public.notifications where title = 'System report update') then
    raise exception 'V8 acceptance: blocked content remained visible';
  end if;

  if (select count(*) from public.list_blocked_profiles()) <> 1 then
    raise exception 'V8 acceptance: safe blocked-members list is unavailable';
  end if;

  update public.notifications
  set read = true
  where actor_user_id = 'a1000000-0000-4000-8000-000000000002';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'V8 acceptance: blocked notification remained actionable';
  end if;

  begin
    insert into public.mentorship_requests (
      from_user_id, to_user_id, chapter_id, status, message
    ) values (
      auth.uid(), 'a1000000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000001', 'pending', 'must fail'
    );
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'V8 acceptance: blocker could contact blocked member';
  end if;
end;
$$;

-- B cannot see/contact A either. B can still post in a shared public channel;
-- the subsequent A query must hide that new row, which is the same SELECT-RLS
-- check applied to Postgres Changes realtime delivery.
set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
declare
  denied boolean := false;
begin
  if exists (select 1 from public.profiles where user_id = 'a1000000-0000-4000-8000-000000000001') then
    raise exception 'V8 acceptance: block relationship was not symmetric';
  end if;
  begin
    insert into public.mentorship_requests (
      from_user_id, to_user_id, chapter_id, status, message
    ) values (
      auth.uid(), 'a1000000-0000-4000-8000-000000000001',
      'a2000000-0000-4000-8000-000000000001', 'pending', 'must fail'
    );
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'V8 acceptance: blocked member could contact blocker';
  end if;

  insert into public.channel_messages (channel_id, sender_id, content)
  values (
    'a4000000-0000-4000-8000-000000000001', auth.uid(),
    'realtime message while blocked'
  );
end;
$$;

-- Unblocking restores every surface and makes the realtime-era row visible.
set local role postgres;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
delete from public.user_blocks
where blocker_id = auth.uid()
  and blocked_id = 'a1000000-0000-4000-8000-000000000002';

do $$
begin
  if not exists (select 1 from public.profiles where user_id = 'a1000000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.job_postings where posted_by = 'a1000000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.events where created_by = 'a1000000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.channel_messages where content = 'realtime message while blocked')
     or not exists (select 1 from public.message_reactions where user_id = 'a1000000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.event_rsvps where user_id = 'a1000000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.mentorship_requests where id = 'a8000000-0000-4000-8000-000000000001')
     or not exists (select 1 from public.messages where id = 'a9000000-0000-4000-8000-000000000001')
     or not exists (select 1 from public.notifications where actor_user_id = 'a1000000-0000-4000-8000-000000000002') then
    raise exception 'V8 acceptance: unblocking did not restore visibility';
  end if;
  if exists (select 1 from public.list_blocked_profiles()) then
    raise exception 'V8 acceptance: unblocked member remained in blocked list';
  end if;
end;
$$;

set local role postgres;
rollback;
