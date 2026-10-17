-- Local-only transactional authorization regression. Real Storage cleanup and
-- HTTP concurrency are tested separately in the account-deletion QA harness.
begin;
create function pg_temp.assert_true(ok boolean, description text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', description; end if; end $$;
create function pg_temp.expect_denied(command text) returns void language plpgsql as $$
begin
  begin execute command; exception when insufficient_privilege then return; end;
  raise exception 'FAIL: expected denial for %', command;
end $$;
do $$ begin execute format('grant usage on schema %I to authenticated', (select nspname from pg_namespace where oid=pg_my_temp_schema())); end $$;
grant execute on function pg_temp.assert_true(boolean,text), pg_temp.expect_denied(text) to authenticated;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.begin_account_deletion(uuid)','execute'), 'begin is server only');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.finish_account_deletion(uuid)','execute'), 'finish is server only');
select pg_temp.assert_true(not has_function_privilege('anon','public.begin_account_deletion(uuid)','execute'), 'anonymous cannot begin');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.delete_own_account()','execute'), 'legacy RPC unavailable');
select pg_temp.assert_true(not has_schema_privilege('authenticated','account_deletion','usage'), 'fence private');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='account_deletion.requests'::regclass), 'fence RLS enabled');
select pg_temp.assert_true(exists(select 1 from pg_trigger where tgrelid='storage.objects'::regclass and tgname='protect_objects_delete'), 'Storage direct-delete protection retained');
insert into auth.users(id,email) values ('d1400000-0000-4000-8000-000000000001','qa-deletion-sql@example.invalid');
insert into storage.objects(bucket_id,name) values ('avatars','d1400000-0000-4000-8000-000000000001/unrecorded.jpg');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.begin_account_deletion('d1400000-0000-4000-8000-000000000001');
do $$ begin
  begin perform public.finish_account_deletion('d1400000-0000-4000-8000-000000000001');
  exception when object_not_in_prerequisite_state then
    if sqlerrm = 'Account finalization disabled: upload lifecycle settlement is not established' then return; else raise; end if;
  end;
  raise exception 'FAIL: finish allowed unproven upload settlement';
end $$;
select pg_temp.assert_true(exists(select 1 from auth.users where id='d1400000-0000-4000-8000-000000000001'), 'failed finish preserves Auth');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"d1400000-0000-4000-8000-000000000001"}',true);
select pg_temp.expect_denied($q$select public.begin_account_deletion('d1400000-0000-4000-8000-000000000001')$q$);
select pg_temp.expect_denied($q$select public.finish_account_deletion('d1400000-0000-4000-8000-000000000001')$q$);
select pg_temp.expect_denied('select public.delete_own_account()');
select pg_temp.expect_denied($q$insert into storage.objects(bucket_id,name) values('avatars','d1400000-0000-4000-8000-000000000001/late.jpg')$q$);
reset role;
rollback;
