-- V10 acceptance: run ONLY in a confirmed disposable database after V6–V10.
-- Writes fixtures even though it rolls back. Use psql ON_ERROR_STOP.
begin;
set local role postgres;
insert into auth.users (id, email) values
 ('b1000000-0000-4000-8000-000000000001', 'map-a@example.invalid'),
 ('b1000000-0000-4000-8000-000000000002', 'map-b@example.invalid'),
 ('b1000000-0000-4000-8000-000000000003', 'map-cross@example.invalid'),
 ('b1000000-0000-4000-8000-000000000004', 'map-pending@example.invalid');
insert into public.chapters (id, name) values
 ('b2000000-0000-4000-8000-000000000001', 'Map A'),
 ('b2000000-0000-4000-8000-000000000002', 'Map B');
insert into public.profiles (id, user_id, chapter_id, status, membership_type, city) values
 ('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','approved','alumni','Austin'),
 ('b3000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','approved','alumni','Boston'),
 ('b3000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000002','approved','alumni','Chicago'),
 ('b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000001','pending','alumni','Denver');

update public.profiles set map_revision = 'b4000000-0000-4000-8000-000000000001'
where id in ('b3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000003');

select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare p public.profiles%rowtype; r uuid; obsolete uuid; denied boolean; target uuid;
begin
 select * into p from public.profiles where user_id = auth.uid();
 if p.map_sharing_enabled or p.lat is not null or p.lng is not null then
   raise exception 'New profile did not default off';
 end if;
 -- Off city save retains the profile city and never creates a pin.
 r := public.set_profile_map_sharing(p.id, p.map_revision, 'Seattle', false);
 if not exists (select 1 from public.profiles where id = p.id and city = 'Seattle'
   and not map_sharing_enabled and lat is null and lng is null) then
   raise exception 'Off city save failed';
 end if;
 -- Explicit on, city coordinates; all ordinary approved members may read map.
 r := public.set_profile_map_sharing(p.id, r, 'Seattle', true);
 if public.complete_profile_map_location(p.id, r, 47.6, -122.3) is null then
   raise exception 'Explicit opt-in failed';
 end if;
 if not exists (select 1 from public.profiles where id = p.id and map_sharing_enabled
   and lat = 47.6 and lng = -122.3) then raise exception 'Pin did not persist'; end if;
 if public.complete_profile_map_location(p.id, r, 1, 2) is not null then
   raise exception 'Completed revision was reused';
 end if;
 select map_revision into r from public.profiles where id = p.id;
 obsolete := public.set_profile_map_sharing(p.id, r, 'New lookup city', true);
 -- Failed / timed-out lookup performs no phase 2: old pin already gone.
 if exists (select 1 from public.profiles where id = p.id and (lat is not null or lng is not null)) then
   raise exception 'City change retained stale pin';
 end if;
 r := public.set_profile_map_sharing(p.id, obsolete, 'New lookup city', false);
 if public.complete_profile_map_location(p.id, obsolete, 40, -80) is not null then
   raise exception 'Late lookup restored pin after opt-out';
 end if;
 denied := false;
 begin perform public.set_profile_map_sharing(p.id, obsolete, 'Stale save', true);
 exception when raise_exception then denied := true; end;
 if not denied then raise exception 'Late save restored consent'; end if;
 -- Old clients cannot directly write any coordinates or consent.
 denied := false;
 begin update public.profiles set lat = 40, lng = -80 where id = p.id;
 exception when insufficient_privilege then denied := true; end;
 if not denied then raise exception 'Old-client coordinates were accepted'; end if;
 denied := false;
 begin update public.profiles set map_sharing_enabled = true where id = p.id;
 exception when insufficient_privilege then denied := true; end;
 if not denied then raise exception 'Direct consent write was accepted'; end if;
 update public.profiles set name = 'Safe edit', bio = 'Ordinary edit' where id = p.id;
 -- Direct old-client city-only edits invalidate lookups without changing consent.
 r := public.set_profile_map_sharing(p.id, r, 'Lookup A', true);
 update public.profiles set city = 'Lookup B' where id = p.id;
 if public.complete_profile_map_location(p.id, r, 40, -80) is not null then
   raise exception 'Late lookup survived a newer direct city edit';
 end if;
 select map_revision into r from public.profiles where id = p.id;
 r := public.set_profile_map_sharing(p.id, r, '', true);
 if exists (select 1 from public.profiles where id = p.id and
   (city is not null or map_sharing_enabled or lat is not null or lng is not null)) then
   raise exception 'Clearing city left sharing or coordinates';
 end if;
 -- RPCs cannot mutate same-chapter peers or cross-chapter members.
 foreach target in array array['b3000000-0000-4000-8000-000000000002'::uuid,
   'b3000000-0000-4000-8000-000000000003'::uuid] loop
   denied := false;
   begin perform public.set_profile_map_sharing(target, 'b4000000-0000-4000-8000-000000000001', 'Attack', true);
   exception when raise_exception then denied := true; end;
   if not denied then raise exception 'Cross-user sharing update accepted'; end if;
   if public.complete_profile_map_location(target, 'b4000000-0000-4000-8000-000000000001', 1, 2) is not null then
     raise exception 'Cross-user location update accepted'; end if;
 end loop;
 if exists (select 1 from public.profiles where id = 'b3000000-0000-4000-8000-000000000003') then
   raise exception 'Cross-chapter row visible'; end if;
end $$;

-- Populate A's pin to verify RLS and server designation changes.
reset role;
update public.profiles set city = 'Austin', map_sharing_enabled = true
where id = 'b3000000-0000-4000-8000-000000000001';
update public.profiles set lat = 30, lng = -97
where id = 'b3000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
 if not exists (select 1 from public.profiles where id = 'b3000000-0000-4000-8000-000000000001'
   and map_sharing_enabled and lat = 30) then raise exception 'Approved peer cannot see opted-in pin'; end if;
end $$;
insert into public.user_blocks (blocker_id, blocked_id) values
 ('b1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001');
do $$ begin
 if exists (select 1 from public.profiles where id = 'b3000000-0000-4000-8000-000000000001') then
   raise exception 'Blocker sees blocked pin'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ begin
 if exists (select 1 from public.profiles where id = 'b3000000-0000-4000-8000-000000000002') then
   raise exception 'Blocked member sees blocker'; end if;
end $$;
reset role;
update public.profiles set membership_type = 'active' where id = 'b3000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
declare p public.profiles%rowtype;
begin
 select * into p from public.profiles where user_id = auth.uid();
 if public.complete_profile_map_location(p.id, p.map_revision, 30, -97) is not null then
   raise exception 'Active designation published a pin'; end if;
end $$;
reset role;
update public.profiles set membership_type = 'alumni' where id = 'b3000000-0000-4000-8000-000000000001';
do $$ begin
 if exists (select 1 from public.profiles where id = 'b3000000-0000-4000-8000-000000000001' and lat is not null) then
   raise exception 'Designation transition restored pin'; end if;
end $$;
-- Pending/rejected members cannot opt in, even with their current revision.
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
do $$
declare p public.profiles%rowtype; denied boolean := false;
begin
 select * into p from public.profiles where user_id = auth.uid();
 begin perform public.set_profile_map_sharing(p.id, p.map_revision, 'Denver', true);
 exception when raise_exception then denied := true; end;
 if not denied then raise exception 'Pending member opted in'; end if;
 if public.complete_profile_map_location(p.id, p.map_revision, 1, 2) is not null then
   raise exception 'Pending member published coordinates'; end if;
end $$;
reset role;
update public.profiles set status = 'rejected' where id = 'b3000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$
declare p public.profiles%rowtype; denied boolean := false;
begin
 select * into p from public.profiles where user_id = auth.uid();
 begin perform public.set_profile_map_sharing(p.id, p.map_revision, 'Denver', true);
 exception when raise_exception then denied := true; end;
 if not denied then raise exception 'Rejected member opted in'; end if;
end $$;
reset role;
set local role anon;
do $$
declare denied boolean := false;
begin
 begin perform public.set_profile_map_sharing(null, null, 'Denver', true);
 exception when insufficient_privilege then denied := true; end;
 if not denied then raise exception 'Anonymous RPC execution allowed'; end if;
end $$;
rollback;
