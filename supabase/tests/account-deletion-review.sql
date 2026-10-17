-- Review followup: safety mitigation and canonical/indexable tombstone lookup.
begin;
create function pg_temp.expect_denied(command text) returns void language plpgsql as $$
begin begin execute command; exception when insufficient_privilege then return; end;
raise exception 'FAIL expected denial: %', command; end $$;
insert into account_deletion.requests(user_id) values('d1500000-0000-4000-8000-000000000001');
select pg_temp.expect_denied($q$insert into storage.objects(bucket_id,name) values('avatars','d1500000-0000-4000-8000-000000000001/new.jpg')$q$);
select pg_temp.expect_denied($q$insert into storage.objects(bucket_id,name) values('avatars','not-a-uuid/avatar.jpg')$q$);
select pg_temp.expect_denied($q$insert into storage.objects(bucket_id,name) values('avatars','/avatar.jpg')$q$);
select pg_temp.expect_denied($q$insert into storage.objects(bucket_id,name) values('avatars','D1500000-0000-4000-8000-000000000001/avatar.jpg')$q$);
select pg_temp.expect_denied($q$insert into storage.objects(bucket_id,name) values('avatars','{d1500000-0000-4000-8000-000000000001}/avatar.jpg')$q$);
-- Valid unfenced UUID stays writable. No real binary file is created in SQL tests.
insert into storage.objects(bucket_id,name) values('avatars','d1500000-0000-4000-8000-000000000002/valid.jpg');
insert into auth.users(id,email) values('d1500000-0000-4000-8000-000000000003','qa-review-sql@example.invalid');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.begin_account_deletion('d1500000-0000-4000-8000-000000000003');
do $$ begin
  begin perform public.finish_account_deletion('d1500000-0000-4000-8000-000000000003');
  exception when object_not_in_prerequisite_state then return; end;
  raise exception 'FAIL: empty metadata was substituted for upload settlement';
end $$;
do $$ begin
  if not exists(select 1 from auth.users where id='d1500000-0000-4000-8000-000000000003') then
    raise exception 'FAIL: account deleted';
  end if;
end $$;
rollback;
