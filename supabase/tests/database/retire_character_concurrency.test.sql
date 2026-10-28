-- Real multi-connection regression: saves, clears, name recovery and another
-- shared device's retirement wait behind a retiring generation, without deadlock.
-- Fixtures must be committed for the other connections; they are isolated by
-- fixed test UUIDs/name and explicitly removed at both ends (also after a rerun).
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;
select no_plan();

create temporary table retirement_connections (name text primary key, pid integer);
create temporary table retirement_connection_string (value text);
insert into retirement_connection_string values (format('dbname=%L user=%L host=%L port=%L',
  current_database(), current_user,
  btrim(split_part(current_setting('unix_socket_directories'), ',', 1)), current_setting('port')));
select dblink_connect('retirement_setup', (select value from retirement_connection_string));
select dblink_exec('retirement_setup', $$
  begin;
  delete from public.training_records where character_id in (select id from public.character_pool where name = '隐退并发回归人物');
  delete from public.training_mistakes where character_id in (select id from public.character_pool where name = '隐退并发回归人物');
  delete from public.character_sessions where character_id in (select id from public.character_pool where name = '隐退并发回归人物');
  delete from public.character_pool where name = '隐退并发回归人物';
  delete from auth.users where id in (
    'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000004',
    'a2000000-0000-4000-8000-000000000005');
  insert into auth.users (id, is_anonymous) values
    ('a2000000-0000-4000-8000-000000000001', true),
    ('a2000000-0000-4000-8000-000000000002', true),
    ('a2000000-0000-4000-8000-000000000003', true),
    ('a2000000-0000-4000-8000-000000000004', true),
    ('a2000000-0000-4000-8000-000000000005', true);
  insert into public.character_pool (id, name, claimed_at)
    values ('a2000000-0000-4000-8000-000000000010', '隐退并发回归人物', clock_timestamp());
  insert into public.character_sessions (user_id, character_id)
    select id, 'a2000000-0000-4000-8000-000000000010'::uuid from auth.users
    where id in ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002',
      'a2000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000005');
  insert into public.training_records (character_id, record_key, data)
    values ('a2000000-0000-4000-8000-000000000010', 'before-retirement', '{}');
  insert into public.training_mistakes (character_id, id, data)
    values ('a2000000-0000-4000-8000-000000000010', 'shared-mistake', '{"id":"shared-mistake"}');
  commit;
$$);
select dblink_disconnect('retirement_setup');

select dblink_connect(name, (select value from retirement_connection_string))
from (values ('retirement_save'), ('retirement_restore'), ('retirement_peer'), ('retirement_clear')) t(name);
insert into retirement_connections
select name, remote.pid from (values ('retirement_save'), ('retirement_restore'), ('retirement_peer'), ('retirement_clear')) t(name)
cross join lateral dblink(name, 'select pg_backend_pid()') as remote(pid integer);
select dblink_exec(name, format('set request.jwt.claims = %L; set role authenticated; set statement_timeout = %L',
  format('{"sub":"a2000000-0000-4000-8000-%s","role":"authenticated"}', suffix), '10s'))
from (values ('retirement_save', '000000000002'), ('retirement_restore', '000000000003'),
  ('retirement_peer', '000000000004'), ('retirement_clear', '000000000005')) t(name, suffix);

create function pg_temp.wait_for_retirement_lock(p_name text) returns boolean
language plpgsql as $$
declare
  v_pid integer := (select pid from retirement_connections where name = p_name);
begin
  for i in 1..200 loop
    if cardinality(pg_blocking_pids(v_pid)) > 0 then
      return true;
    end if;
    perform pg_sleep(0.01);
  end loop;
  return false;
end;
$$;

begin;
-- Hold the exact exclusive row lock used by retirement while all remote RPCs
-- capture the old generation. No sleeping/timing assumption decides the order.
select id from public.character_pool where id = 'a2000000-0000-4000-8000-000000000010' for update;
select dblink_send_query('retirement_save', $$select public.save_training_attempt('a2000000-0000-4000-8000-000000000010', 'late-save', '{}', '{"id":"late-mistake"}')$$);
select dblink_send_query('retirement_restore', $$select public.restore_character('隐退并发回归人物')$$);
select dblink_send_query('retirement_peer', $$select public.retire_character('a2000000-0000-4000-8000-000000000010')$$);
select dblink_send_query('retirement_clear', $$select public.clear_training_data('a2000000-0000-4000-8000-000000000010')$$);
select ok(pg_temp.wait_for_retirement_lock(name), name || ' waits for the old character generation') from retirement_connections;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.retire_character('a2000000-0000-4000-8000-000000000010')$$, 'retirement does not deadlock on the waiting shared devices auth-user locks');
reset role;
commit;

select is((select count(*) from dblink_get_result('retirement_save', false) as r(id bigint)), 0::bigint, 'the queued old-generation save fails rather than reviving data');
select alike(dblink_error_message('retirement_save'), '%The current character does not match the requested character%', 'the queued save fails with the real identity error');
select is((select count(*) from dblink_get_result('retirement_clear', false) as r(result text)), 0::bigint, 'the queued old-generation clear fails');
select alike(dblink_error_message('retirement_clear'), '%The current character does not match the requested character%', 'the queued clear rechecks the retired membership');
select is((select count(*) from dblink_get_result('retirement_restore', false) as r(identity jsonb)), 0::bigint, 'an in-flight name restore cannot cross to the replacement UUID');
select alike(dblink_error_message('retirement_restore'), '%没有找到这个已使用的名号%', 'the queued restore reports that its captured generation disappeared');
select is((select count(*) from dblink_get_result('retirement_peer', false) as r(result text)), 1::bigint, 'a simultaneous shared-device retirement completes idempotently');
select is((select count(*) from public.training_records where character_id = 'a2000000-0000-4000-8000-000000000010'), 0::bigint, 'no queued write resurrects old records');
select is((select count(*) from public.training_mistakes where character_id = 'a2000000-0000-4000-8000-000000000010'), 0::bigint, 'no queued write resurrects old mistakes');
select is((select count(*) from public.character_sessions where character_id = 'a2000000-0000-4000-8000-000000000010'), 0::bigint, 'no queued restore resurrects old membership');
select ok((select id <> 'a2000000-0000-4000-8000-000000000010'::uuid and claimed_at is null from public.character_pool where name = '隐退并发回归人物'), 'retirement leaves only a fresh allocatable generation');
select dblink_disconnect(name) from retirement_connections;

begin;
delete from public.training_records where character_id in (select id from public.character_pool where name = '隐退并发回归人物');
delete from public.training_mistakes where character_id in (select id from public.character_pool where name = '隐退并发回归人物');
delete from public.character_sessions where character_id in (select id from public.character_pool where name = '隐退并发回归人物');
delete from public.character_pool where name = '隐退并发回归人物';
delete from auth.users where id in (
  'a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000004',
  'a2000000-0000-4000-8000-000000000005');
commit;
select * from finish();
