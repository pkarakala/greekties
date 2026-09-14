-- P0 authorization + invite acceptance checks.
-- Run after app-v6-p0-authorization-invites.sql and app-v7-p0-followup.sql.

begin;
set local role postgres;

do $$
declare
  column_name text;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%rejected%'
  ) then
    raise exception 'P0 acceptance: profiles status lifecycle check is missing';
  end if;
  if has_table_privilege('anon', 'public.chapter_invites', 'select') then
    raise exception 'P0 acceptance: anon can directly select chapter_invites';
  end if;
  if has_table_privilege('authenticated', 'public.chapter_invites', 'select') then
    raise exception 'P0 acceptance: authenticated can directly select chapter_invites';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'insert') then
    raise exception 'P0 acceptance: authenticated has unrestricted profile insert';
  end if;
  foreach column_name in array array[
    'status', 'chapter_id', 'user_id', 'admin_role'
  ]
  loop
    if has_column_privilege(
      'authenticated', 'public.profiles', column_name, 'update'
    ) then
      raise exception 'P0 acceptance: authenticated can directly update protected profiles.%',
        column_name;
    end if;
  end loop;
  foreach column_name in array array[
    'name', 'class_year', 'role', 'industry', 'city', 'company', 'job_title',
    'linkedin_url', 'bio', 'open_to_mentor', 'is_hiring', 'avatar_url', 'lat', 'lng'
  ]
  loop
    if not has_column_privilege(
      'authenticated', 'public.profiles', column_name, 'update'
    ) then
      raise exception 'P0 acceptance: ordinary profiles.% is not updateable', column_name;
    end if;
  end loop;
end;
$$;

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'p0-pending@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'p0-approved-a@example.invalid'),
  ('10000000-0000-4000-8000-000000000003', 'p0-rejected@example.invalid'),
  ('10000000-0000-4000-8000-000000000004', 'p0-owner-a@example.invalid'),
  ('10000000-0000-4000-8000-000000000005', 'p0-approved-b@example.invalid'),
  ('10000000-0000-4000-8000-000000000006', 'p0-owner-b@example.invalid'),
  ('10000000-0000-4000-8000-000000000007', 'p0-fresh-invitee@example.invalid'),
  ('10000000-0000-4000-8000-000000000008', 'p0-second-pending@example.invalid'),
  ('10000000-0000-4000-8000-000000000009', 'p0-rejected-b@example.invalid');

insert into public.chapters (id, name, designation, university)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'P0 Chapter A', 'Alpha', 'Test U'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'P0 Chapter B', 'Beta', 'Test U');

insert into public.profiles (id, user_id, chapter_id, name, status, admin_role)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Pending A', 'pending', null),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Approved A', 'approved', null),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Rejected A', 'rejected', null),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Owner A', 'approved', 'owner'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Approved B', 'approved', null),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Owner B', 'approved', 'owner'),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000008', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Pending A2', 'pending', 'manager'),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000009', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Rejected B', 'rejected', null);

insert into public.chapter_invites (id, chapter_id, code, created_by)
values
  ('70000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secure-code-a', '10000000-0000-4000-8000-000000000004'),
  ('70000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'secure-code-b', '10000000-0000-4000-8000-000000000006');

insert into public.channels (id, chapter_id, name, visibility)
values
  ('30000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'general-a', 'all'),
  ('30000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'exec-a', 'exec_only'),
  ('30000000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'general-b', 'all');

insert into public.channel_messages (id, channel_id, sender_id, content)
values
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'chapter a'),
  ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', 'chapter b');

insert into public.job_postings (id, chapter_id, posted_by, title, company)
values
  ('40000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10000000-0000-4000-8000-000000000002', 'A Job', 'Test Co'),
  ('40000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10000000-0000-4000-8000-000000000005', 'B Job', 'Test Co');

insert into public.mentorship_requests (
  id, from_user_id, to_user_id, chapter_id, status, message
)
values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'accepted', 'A request'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000006', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'accepted', 'B request');

insert into public.messages (id, request_id, sender_id, content)
values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'A message'),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', 'B message');

insert into public.content_reports (
  id, reporter_id, chapter_id, target_type, target_id, reason
)
values
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'profile', '20000000-0000-4000-8000-000000000004', 'test'),
  ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'profile', '20000000-0000-4000-8000-000000000006', 'test');

insert into public.notifications (id, user_id, actor_user_id, type, title, url)
values
  ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null, 'channel_message', 'Pending must not see', '/chats/denied'),
  ('90000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'channel_message', 'Approved can see', '/chats/allowed'),
  ('90000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', null, 'mentorship_message', 'Rejected must not see', '/inbox/denied');

-- Anonymous users can preview a valid code through the RPC, but cannot read
-- the underlying invite table or treat a chapter UUID as a legacy code.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  if (select count(*) from public.resolve_chapter_invite('  SECURE-CODE-A  ')) <> 1 then
    raise exception 'P0 acceptance: legitimate invite preview failed';
  end if;
  if (select count(*) from public.resolve_chapter_invite('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) <> 0 then
    raise exception 'P0 acceptance: raw chapter UUID was accepted as an invite';
  end if;
  begin
    perform 1 from public.chapter_invites limit 1;
    raise exception 'P0 acceptance: anon directly read chapter_invites';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- Pending profile: own-profile visibility remains available, but every
-- chapter-scoped surface and sensitive profile update is denied.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","email":"p0-pending@example.invalid"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'P0 acceptance: pending user did not see exactly their own profile';
  end if;
  if exists (select 1 from public.chapters) or exists (select 1 from public.channels)
     or exists (select 1 from public.channel_messages) or exists (select 1 from public.job_postings)
     or exists (select 1 from public.mentorship_requests) or exists (select 1 from public.messages)
     or exists (select 1 from public.content_reports) or exists (select 1 from public.notifications) then
    raise exception 'P0 acceptance: pending user received chapter-scoped access';
  end if;
  begin
    update public.profiles set status = 'approved'
    where user_id = auth.uid();
    raise exception 'P0 acceptance: pending user self-approved';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.job_postings (chapter_id, posted_by, title, company)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'Denied', 'Denied');
    raise exception 'P0 acceptance: pending user posted a job';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- Rejected profile has the same fail-closed behavior as pending.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","email":"p0-rejected@example.invalid"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'P0 acceptance: rejected user did not see exactly their own profile';
  end if;
  if exists (select 1 from public.chapters) or exists (select 1 from public.channels)
     or exists (select 1 from public.job_postings)
     or exists (select 1 from public.mentorship_requests)
     or exists (select 1 from public.content_reports)
     or exists (select 1 from public.notifications) then
    raise exception 'P0 acceptance: rejected user received chapter-scoped access';
  end if;
  begin
    insert into public.content_reports (reporter_id, chapter_id, target_type, target_id)
    values (auth.uid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'profile', '20000000-0000-4000-8000-000000000004');
    raise exception 'P0 acceptance: rejected user filed a moderation report';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- Approved non-admin: same-chapter member features work; cross-chapter and
-- admin operations fail.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","email":"p0-approved-a@example.invalid"}', true);
set local role authenticated;
do $$
declare
  denied boolean := false;
  affected_rows integer;
begin
  if (select count(*) from public.chapters) <> 1 then
    raise exception 'P0 acceptance: approved user chapter visibility is wrong';
  end if;
  if (select count(*) from public.channels) <> 1 then
    raise exception 'P0 acceptance: approved non-admin channel visibility is wrong';
  end if;
  if (select count(*) from public.job_postings) <> 1 then
    raise exception 'P0 acceptance: approved user job visibility is wrong';
  end if;
  if (select count(*) from public.mentorship_requests) <> 1
     or (select count(*) from public.messages) <> 1 then
    raise exception 'P0 acceptance: approved user mentorship visibility is wrong';
  end if;
  if (select count(*) from public.notifications) <> 1 then
    raise exception 'P0 acceptance: approved user notification visibility is wrong';
  end if;
  if exists (select 1 from public.profiles where id in (
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000005'
  )) then
    raise exception 'P0 acceptance: non-admin saw pending, rejected, or cross-chapter profile';
  end if;

  -- This matches every field written by app/profile/edit.tsx and
  -- app/onboarding/complete-profile.tsx. It must update the caller's row.
  update public.profiles
  set name = 'Edited Approved A',
      class_year = 2028,
      role = 'Active',
      industry = 'Technology',
      city = 'Austin, TX',
      company = 'Test Co',
      job_title = 'Engineer',
      linkedin_url = 'https://linkedin.com/in/p0-approved-a',
      bio = 'Profile edit acceptance',
      open_to_mentor = true,
      is_hiring = true,
      avatar_url = 'https://example.invalid/avatar.jpg',
      lat = 30.2672,
      lng = -97.7431
  where user_id = auth.uid();

  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and name = 'Edited Approved A'
      and class_year = 2028
      and role = 'Active'
      and industry = 'Technology'
      and city = 'Austin, TX'
      and company = 'Test Co'
      and job_title = 'Engineer'
      and linkedin_url = 'https://linkedin.com/in/p0-approved-a'
      and bio = 'Profile edit acceptance'
      and open_to_mentor
      and is_hiring
      and avatar_url = 'https://example.invalid/avatar.jpg'
      and lat = 30.2672
      and lng = -97.7431
  ) then
    raise exception 'P0 acceptance: normal owner profile edit did not persist';
  end if;

  begin
    update public.profiles set status = 'pending' where user_id = auth.uid();
    raise exception 'P0 acceptance: member directly changed profiles.status';
  exception when insufficient_privilege then
    null;
  end;
  begin
    update public.profiles
    set chapter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    where user_id = auth.uid();
    raise exception 'P0 acceptance: member directly changed profiles.chapter_id';
  exception when insufficient_privilege then
    null;
  end;
  begin
    update public.profiles
    set user_id = '10000000-0000-4000-8000-000000000005'
    where user_id = auth.uid();
    raise exception 'P0 acceptance: member directly changed profiles.user_id';
  exception when insufficient_privilege then
    null;
  end;
  begin
    update public.profiles set admin_role = 'manager' where user_id = auth.uid();
    raise exception 'P0 acceptance: member directly changed profiles.admin_role';
  exception when insufficient_privilege then
    null;
  end;

  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and chapter_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and status = 'approved'
      and admin_role is null
  ) then
    raise exception 'P0 acceptance: denied profile changes altered a protected field';
  end if;

  update public.profiles
  set bio = 'Cross-row update must not persist'
  where id = '20000000-0000-4000-8000-000000000004';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'P0 acceptance: member edited another user''s ordinary profile fields';
  end if;

  insert into public.job_postings (chapter_id, posted_by, title, company)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'Allowed A', 'Test Co');
  begin
    insert into public.job_postings (chapter_id, posted_by, title, company)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', auth.uid(), 'Denied B', 'Test Co');
    raise exception 'P0 acceptance: approved user posted cross-chapter job';
  exception when insufficient_privilege then
    null;
  end;

  insert into public.mentorship_requests (
    from_user_id, to_user_id, chapter_id, status, message
  ) values (
    auth.uid(), '10000000-0000-4000-8000-000000000004',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pending', 'allowed'
  );
  begin
    insert into public.mentorship_requests (
      from_user_id, to_user_id, chapter_id, status, message
    ) values (
      auth.uid(), '10000000-0000-4000-8000-000000000005',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pending', 'denied'
    );
    raise exception 'P0 acceptance: approved user created cross-chapter mentorship request';
  exception when insufficient_privilege then
    null;
  end;

  insert into public.messages (request_id, sender_id, content)
  values ('50000000-0000-4000-8000-000000000001', auth.uid(), 'allowed');
  begin
    insert into public.messages (request_id, sender_id, content)
    values ('50000000-0000-4000-8000-000000000002', auth.uid(), 'denied');
    raise exception 'P0 acceptance: approved user sent cross-chapter mentorship message';
  exception when insufficient_privilege then
    null;
  end;

  insert into public.content_reports (reporter_id, chapter_id, target_type, target_id)
  values (auth.uid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'profile', '20000000-0000-4000-8000-000000000004');
  begin
    insert into public.content_reports (reporter_id, chapter_id, target_type, target_id)
    values (auth.uid(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'profile', '20000000-0000-4000-8000-000000000005');
    raise exception 'P0 acceptance: approved user filed cross-chapter report';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.create_chapter_invite('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'P0 acceptance: non-admin created an invite';
  end if;

  denied := false;
  begin
    perform public.set_chapter_member_admin_role(
      '20000000-0000-4000-8000-000000000002', 'manager'
    );
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'P0 acceptance: non-admin changed an admin role';
  end if;
end;
$$;

-- Approved owner: pending/rejected profiles and in-chapter moderation are
-- visible, profile lifecycle RPCs work, and cross-chapter admin access fails.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","email":"p0-owner-a@example.invalid"}', true);
set local role authenticated;
do $$
declare
  code text;
  denied boolean := false;
begin
  if (select count(*) from public.profiles where chapter_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 5 then
    raise exception 'P0 acceptance: owner cannot read all chapter-A profiles';
  end if;
  if exists (select 1 from public.profiles where chapter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'P0 acceptance: owner read cross-chapter profiles';
  end if;
  if (select count(*) from public.content_reports) <> 2
     or exists (
       select 1 from public.content_reports
       where chapter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     ) then
    raise exception 'P0 acceptance: owner moderation visibility is wrong';
  end if;

  code := public.create_chapter_invite('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if code <> 'secure-code-a' then
    raise exception 'P0 acceptance: admin invite RPC did not reuse valid code';
  end if;

  perform public.approve_chapter_member('20000000-0000-4000-8000-000000000008');
  if not exists (
    select 1 from public.profiles
    where id = '20000000-0000-4000-8000-000000000008'
      and status = 'approved' and admin_role is null
  ) then
    raise exception 'P0 acceptance: approval RPC did not approve safely';
  end if;

  perform public.set_chapter_member_admin_role(
    '20000000-0000-4000-8000-000000000002', 'manager'
  );
  if not exists (
    select 1 from public.profiles
    where id = '20000000-0000-4000-8000-000000000002'
      and admin_role = 'manager'
  ) then
    raise exception 'P0 acceptance: owner could not set manager role';
  end if;

  begin
    perform public.reject_chapter_member('20000000-0000-4000-8000-000000000006');
  exception when others then
    denied := true;
  end;
  if not denied then
    raise exception 'P0 acceptance: owner changed a cross-chapter profile';
  end if;

  begin
    perform 1 from public.chapter_invites limit 1;
    raise exception 'P0 acceptance: admin directly read chapter_invites';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- A rejected member may rejoin only with a valid invite for the same chapter.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  joined uuid;
begin
  joined := public.join_chapter('secure-code-a');
  if joined <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
     or (select status from public.profiles where user_id = auth.uid()) <> 'approved' then
    raise exception 'P0 acceptance: rejected same-chapter rejoin was not safely reactivated';
  end if;
end;
$$;

set local role postgres;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  joined boolean := false;
begin
  begin
    perform public.join_chapter('secure-code-a');
    joined := true;
  exception when others then
    null;
  end;
  if joined or (select status from public.profiles where user_id = auth.uid()) <> 'rejected' then
    raise exception 'P0 acceptance: rejected cross-chapter profile rejoined';
  end if;
end;
$$;

-- A fresh authenticated user cannot create a profile directly, but a valid
-- invite succeeds through join_chapter and creates an approved profile.
set local role postgres;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000007","role":"authenticated","email":"p0-fresh-invitee@example.invalid","user_metadata":{"name":"Fresh Invitee"}}', true);
set local role authenticated;
do $$
declare
  joined uuid;
begin
  begin
    insert into public.profiles (user_id, chapter_id, name, status)
    values (auth.uid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Escalated', 'approved');
    raise exception 'P0 acceptance: fresh user directly inserted an approved profile';
  exception when insufficient_privilege then
    null;
  end;

  joined := public.join_chapter('  SECURE-CODE-A  ');
  if joined <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then
    raise exception 'P0 acceptance: legitimate invite did not join chapter A';
  end if;
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and chapter_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and status = 'approved'
  ) then
    raise exception 'P0 acceptance: secure join did not create approved profile';
  end if;
end;
$$;

set local role postgres;
rollback;
