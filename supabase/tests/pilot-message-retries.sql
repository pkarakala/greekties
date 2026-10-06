-- Slice 3 acceptance. UNEXECUTED: use only a confirmed disposable local DB.
-- Requires the actual base schema and V1–V11 in order. Fixtures roll back.
-- Before applying V11, seed at least one legacy message in each table to also
-- verify backfill; this suite checks ledger coverage of every extant message.
-- Run existing authorization/invite, membership/block, and map suites as well.
-- Two simultaneous connections retrying one UUID still require separate QA.

begin;
set local role postgres;

create function pg_temp.assert_true(ok boolean, description text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', description; end if;
end $$;
create function pg_temp.expect_denied(command text) returns void
language plpgsql as $$
begin
  begin
    execute command;
  exception when insufficient_privilege then return;
  end;
  raise exception 'FAIL: expected permission denial for %', command;
end $$;
create function pg_temp.expect_duplicate(command text) returns void
language plpgsql as $$
begin
  begin
    execute command;
  exception when unique_violation then return;
  end;
  raise exception 'FAIL: expected duplicate identity rejection for %', command;
end $$;

-- Helpers run as the invoking test role, never as SECURITY DEFINER. Grant
-- access only inside this transaction's temporary schema before switching roles.
do $$
begin
  execute format('grant usage on schema %I to authenticated',
    (select nspname from pg_namespace where oid = pg_my_temp_schema()));
end $$;
grant execute on function pg_temp.assert_true(boolean, text),
  pg_temp.expect_denied(text), pg_temp.expect_duplicate(text) to authenticated;

select pg_temp.assert_true(not has_table_privilege('authenticated', 'public.message_retry_identities', 'select'), 'ledger is not client-readable');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'public.message_retry_identities', 'insert,update,delete'), 'ledger is not client-writable');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.message_retry_identities', 'select,insert,update,delete'), 'ledger unavailable to anon');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.reserve_message_retry_identity()', 'execute'), 'trigger function cannot be called directly');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid = 'public.message_retry_identities'::regclass), 'ledger RLS enabled');
select pg_temp.assert_true(not exists (
  select 1 from public.channel_messages m where not exists (
    select 1 from public.message_retry_identities r where r.message_table = 'channel_messages' and r.message_id = m.id
  )
), 'channel legacy/current identities recorded');
select pg_temp.assert_true(not exists (
  select 1 from public.messages m where not exists (
    select 1 from public.message_retry_identities r where r.message_table = 'messages' and r.message_id = m.id
  )
), 'mentorship legacy/current identities recorded');

insert into auth.users (id, email) values
 ('b1000000-0000-4000-8000-000000000001', 'v11-member@example.invalid'),
 ('b1000000-0000-4000-8000-000000000002', 'v11-peer@example.invalid'),
 ('b1000000-0000-4000-8000-000000000003', 'v11-owner@example.invalid'),
 ('b1000000-0000-4000-8000-000000000004', 'v11-outsider@example.invalid');
insert into public.chapters (id, name, university) values
 ('b2000000-0000-4000-8000-000000000001', 'Retry Chapter A', 'Test U'),
 ('b2000000-0000-4000-8000-000000000002', 'Retry Chapter B', 'Test U');
insert into public.profiles (id, user_id, chapter_id, name, membership_type, status, admin_role) values
 ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Member', 'active', 'approved', null),
 ('b3000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'Peer', 'active', 'approved', null),
 ('b3000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'Owner', 'active', 'approved', 'owner'),
 ('b3000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000002', 'Outsider', 'active', 'approved', null);
insert into public.channels (id, chapter_id, name, visibility) values
 ('b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'retry-general', 'all'),
 ('b4000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'retry-alumni', 'alumni_only'),
 ('b4000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000002', 'retry-other', 'all');
insert into public.mentorship_requests (id, from_user_id, to_user_id, chapter_id, status) values
 ('b6000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'accepted'),
 ('b6000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'pending');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
-- Old clients omitting IDs remain compatible; generated keys get receipts too.
insert into public.channel_messages (channel_id, sender_id, content) values
 ('b4000000-0000-4000-8000-000000000001', auth.uid(), 'old client default ID');
insert into public.messages (request_id, sender_id, content) values
 ('b6000000-0000-4000-8000-000000000001', auth.uid(), 'old client default ID');

-- channel_messages: a stable identity confirms via authorized read; a new ID is distinct.
insert into public.channel_messages (id, channel_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', auth.uid(), 'same text');
select pg_temp.expect_duplicate($q$insert into public.channel_messages (id, channel_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', auth.uid(), 'same text')$q$);
select pg_temp.assert_true((select count(*) = 1 from public.channel_messages where id = 'b5000000-0000-4000-8000-000000000001' and sender_id = auth.uid() and channel_id = 'b4000000-0000-4000-8000-000000000001' and content = 'same text'), 'exact channel_messages confirmation');
insert into public.channel_messages (id, channel_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001', auth.uid(), 'same text');
select pg_temp.expect_denied($q$update public.channel_messages set content = 'overwritten' where id = 'b5000000-0000-4000-8000-000000000001'$q$);
select pg_temp.expect_denied($q$update public.channel_messages set id = 'b5000000-0000-4000-8000-000000000099' where id = 'b5000000-0000-4000-8000-000000000001'$q$);

-- messages: a stable identity confirms via authorized read; a new ID is distinct.
insert into public.messages (id, request_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', auth.uid(), 'same text');
select pg_temp.expect_duplicate($q$insert into public.messages (id, request_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', auth.uid(), 'same text')$q$);
select pg_temp.assert_true((select count(*) = 1 from public.messages where id = 'b5000000-0000-4000-8000-000000000001' and sender_id = auth.uid() and request_id = 'b6000000-0000-4000-8000-000000000001' and content = 'same text'), 'exact messages confirmation');
insert into public.messages (id, request_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', auth.uid(), 'same text');
select pg_temp.expect_denied($q$update public.messages set content = 'overwritten' where id = 'b5000000-0000-4000-8000-000000000001'$q$);
select pg_temp.expect_denied($q$update public.messages set id = 'b5000000-0000-4000-8000-000000000099' where id = 'b5000000-0000-4000-8000-000000000001'$q$);
select pg_temp.expect_denied($q$insert into public.channel_messages (id, channel_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000010', 'b4000000-0000-4000-8000-000000000002', auth.uid(), 'denied')$q$);
select pg_temp.expect_denied($q$insert into public.channel_messages (id, channel_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000011', 'b4000000-0000-4000-8000-000000000003', auth.uid(), 'denied')$q$);
select pg_temp.expect_denied($q$insert into public.messages (id, request_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000012', 'b6000000-0000-4000-8000-000000000002', auth.uid(), 'denied')$q$);

-- Own deletion remains permitted, but its UUID cannot resurrect the message.
delete from public.channel_messages where id = 'b5000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*) = 0 from public.channel_messages where id = 'b5000000-0000-4000-8000-000000000001'), 'own delete still works');
select pg_temp.expect_duplicate($q$insert into public.channel_messages (id, channel_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', auth.uid(), 'same text')$q$);
-- Admin moderation still works and is also terminal for that send identity.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000003', true);
delete from public.channel_messages where id = 'b5000000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select count(*) = 0 from public.channel_messages where id = 'b5000000-0000-4000-8000-000000000002'), 'admin delete still works');
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select pg_temp.expect_duplicate($q$insert into public.channel_messages (id, channel_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001', auth.uid(), 'same text')$q$);

-- Symmetric blocking hides exact-ID reconciliation and denies mentorship sends.
set local role postgres;
insert into public.user_blocks (blocker_id, blocked_id) values
 ('b1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.messages where id = 'b5000000-0000-4000-8000-000000000001'), 'reverse block hides confirmed message');
select pg_temp.expect_denied($q$insert into public.messages (id, request_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000013', 'b6000000-0000-4000-8000-000000000001', auth.uid(), 'blocked')$q$);
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true((select count(*) = 0 from public.messages where id = 'b5000000-0000-4000-8000-000000000001'), 'forward block hides confirmed message');
select pg_temp.expect_denied($q$insert into public.messages (id, request_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000014', 'b6000000-0000-4000-8000-000000000001', auth.uid(), 'blocked')$q$);

-- A nonparticipant cannot use retry/read to enter the mentorship conversation.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000004', true);
select pg_temp.assert_true((select count(*) = 0 from public.messages where id = 'b5000000-0000-4000-8000-000000000001'), 'nonparticipant reconciliation returns no row');
select pg_temp.expect_denied($q$insert into public.messages (id, request_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000015', 'b6000000-0000-4000-8000-000000000001', auth.uid(), 'outsider')$q$);

set local role postgres;
delete from public.user_blocks where blocker_id = 'b1000000-0000-4000-8000-000000000002' and blocked_id = 'b1000000-0000-4000-8000-000000000001';
update public.profiles set status = 'rejected' where user_id = 'b1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true((select count(*) = 0 from public.messages where id = 'b5000000-0000-4000-8000-000000000001'), 'membership revocation hides exact ID');
select pg_temp.expect_denied($q$insert into public.channel_messages (id, channel_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000016', 'b4000000-0000-4000-8000-000000000001', auth.uid(), 'revoked')$q$);
select pg_temp.expect_denied($q$insert into public.messages (id, request_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000017', 'b6000000-0000-4000-8000-000000000001', auth.uid(), 'revoked')$q$);

set local role postgres;
select pg_temp.assert_true(not exists (
  select 1 from public.message_retry_identities where message_id in (
   'b5000000-0000-4000-8000-000000000010', 'b5000000-0000-4000-8000-000000000011',
   'b5000000-0000-4000-8000-000000000012', 'b5000000-0000-4000-8000-000000000013',
   'b5000000-0000-4000-8000-000000000014', 'b5000000-0000-4000-8000-000000000015',
   'b5000000-0000-4000-8000-000000000016', 'b5000000-0000-4000-8000-000000000017'
  )
), 'denied inserts rolled back all reservations');
select pg_temp.assert_true((select count(*) = 4 from public.message_retry_identities
 where message_id in ('b5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000002')), 'identities retained after deletion, scoped by table');
-- No client DELETE grant is added to mentorship messages. Test a service-side
-- deletion to establish that cleanup also cannot permit identity resurrection.
delete from public.messages where id = 'b5000000-0000-4000-8000-000000000001';
select pg_temp.expect_duplicate($q$insert into public.messages (id, request_id, sender_id, content) values ('b5000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'same text')$q$);
rollback;
