-- V11 — retain used message identities across physical deletion.
-- UNAPPLIED DRAFT. Local review only. Apply after V10 with separate approval.
-- Stable client UUIDs already use immutable message primary keys and INSERT
-- grants. Physical deletion releases those keys, however: an ambiguous retry
-- must not resurrect a sender/admin-deleted message. Remember only table + ID,
-- never content, sender, chapter, or recipient. No client access to this ledger.
-- Older clients remain compatible; their server-default UUIDs are recorded too.

begin;

-- Base mentorship schema is not checked into this repository. Fail closed if
-- either actual message table lacks the assumed single-column UUID primary key.
do $$
declare t text;
begin
  foreach t in array array['channel_messages', 'messages'] loop
    if not exists (
      select 1 from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.conrelid = format('public.%I', t)::regclass and c.contype = 'p'
        and array_length(c.conkey, 1) = 1 and a.attname = 'id'
        and a.atttypid = 'uuid'::regtype
    ) then
      raise exception 'V11 aborted: %.id must be a UUID primary key', t;
    end if;
  end loop;
end $$;

-- Serialize backfill + trigger installation with inserts/deletes. Locks live
-- only for this migration transaction; concurrent normal sends resume at commit.
lock table public.channel_messages, public.messages in share row exclusive mode;
create table public.message_retry_identities (
  message_table text not null check (message_table in ('channel_messages', 'messages')),
  message_id uuid not null,
  primary key (message_table, message_id)
);
alter table public.message_retry_identities enable row level security;
revoke all on table public.message_retry_identities from public, anon, authenticated;

insert into public.message_retry_identities (message_table, message_id)
  select 'channel_messages', id from public.channel_messages
  union all select 'messages', id from public.messages;

create function public.reserve_message_retry_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.message_retry_identities (message_table, message_id)
    values (tg_table_name, new.id);
  return new;
end;
$$;
revoke all on function public.reserve_message_retry_identity() from public, anon, authenticated;

-- Receipt reservation and message INSERT are one transaction. A denied insert
-- or other rollback cannot consume the UUID. A committed identity is retained
-- when its message is deleted; there is intentionally no cascading foreign key.
create trigger reserve_channel_message_retry_identity
  before insert on public.channel_messages
  for each row execute function public.reserve_message_retry_identity();
create trigger reserve_mentorship_message_retry_identity
  before insert on public.messages
  for each row execute function public.reserve_message_retry_identity();

-- No changes to message RLS, existing grants, content, or update permissions.
-- A conflict still requires an authorized exact-message read in the client;
-- it is never proof of delivery or permission to inspect an inaccessible row.
commit;
