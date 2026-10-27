begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, is_anonymous) values
  ('11111111-1111-4111-8111-111111111111', true),
  ('22222222-2222-4222-8222-222222222222', true),
  ('33333333-3333-4333-8333-333333333333', true),
  ('44444444-4444-4444-8444-444444444444', true),
  ('55555555-5555-4555-8555-555555555555', true);

create temporary table fixtures (
  total bigint not null,
  a jsonb, b jsonb, c jsonb, previous jsonb,
  first_id bigint,
  record jsonb not null,
  mistake jsonb not null
);
insert into fixtures (total, record, mistake)
select count(*),
  '{"time":1000,"source":"free","hand":[0,1,2,3,4,5,6,7,8],"player":[[0,1,2],[3,4,5],[6,7,8]],"best":[[0,1,2],[3,4,5],[6,7,8]],"verdict":"mistake","evLoss":1,"gap":1,"playerMean":1,"bestMean":2,"tags":[]}'::jsonb,
  '{"id":"0,1,2,3,4,5,6,7,8","hand":[0,1,2,3,4,5,6,7,8],"addedAt":1000,"box":0,"due":1000,"attempts":1,"lastVerdict":"mistake","lastEvLoss":1,"tags":[]}'::jsonb
from public.character_pool;
grant select, update on fixtures to authenticated;

-- Inject a late failure to prove each multi-table operation rolls back atomically.
create function pg_temp.reject_mistake_delete() returns trigger
language plpgsql as $$
begin
  if current_setting('test.reject_mistake_delete', true) = 'on' then
    raise exception 'injected mistake deletion failure';
  end if;
  return old;
end;
$$;
create trigger reject_mistake_delete before delete on public.training_mistakes
  for each row execute function pg_temp.reject_mistake_delete();

select cmp_ok((select total from fixtures), '>=', 64::bigint, 'the finite server pool contains at least 64 real names');
select is((select count(distinct name) from public.character_pool), (select total from fixtures), 'seed names are unique');
select is((select count(*) from public.character_pool where claimed_at is not null), 0::bigint, 'all initial names are unclaimed');
select ok(not has_table_privilege(role_name, table_name, privilege), role_name || ' cannot ' || privilege || ' ' || table_name)
from (values ('anon'), ('authenticated')) roles(role_name)
cross join (values ('public.character_pool'), ('public.character_sessions')) tables(table_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) privileges(privilege);
select ok(not has_table_privilege('anon', table_name, privilege), 'anon cannot ' || privilege || ' ' || table_name)
from (values ('public.training_records'), ('public.training_mistakes')) tables(table_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) privileges(privilege);
select ok(not has_function_privilege('anon', signature, 'EXECUTE'), 'anon cannot execute ' || signature)
from (values
  ('public.reserve_character(boolean)'), ('public.claim_character(uuid)'),
  ('public.restore_character(text)'), ('public.current_character()'),
  ('public.leave_character(uuid)'), ('public.is_current_character(uuid)'),
  ('public.save_training_attempt(uuid,text,jsonb,jsonb,text)'), ('public.clear_training_data(uuid)')
) rpc(signature);
select ok(p.prosecdef and p.proconfig @> array['search_path=""'], p.proname || ' has definer privileges and an empty search path')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'reserve_character', 'claim_character', 'restore_character', 'current_character',
  'leave_character', 'is_current_character', 'save_training_attempt', 'clear_training_data'
);

set local role anon;
select throws_ok($$select public.reserve_character()$$, '42501', null, 'unauthenticated callers cannot reserve');
select throws_ok($$select * from public.character_pool$$, '42501', null, 'the name pool cannot be enumerated');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is(public.current_character(), null::jsonb, 'anonymous transport auth is not yet a character membership');
select throws_ok($$select * from public.character_sessions$$, '42501', null, 'memberships remain private at execution');
update fixtures set a = public.reserve_character();
select is((select (a ->> 'remaining')::bigint from fixtures), (select total from fixtures), 'preview does not consume a name');
select is(public.reserve_character(), (select a from fixtures), 'reload reuses the current live candidate');
update fixtures set previous = a;
update fixtures set a = public.reserve_character(true);
select isnt((select a ->> 'id' from fixtures), (select previous ->> 'id' from fixtures), 'reroll chooses a different available name');
select is((select (a ->> 'remaining')::bigint from fixtures), (select total from fixtures), 'reroll does not consume a name');
reset role;
select is((select count(*) from public.character_pool where reservation_user_id = '11111111-1111-4111-8111-111111111111'), 1::bigint, 'one session has exactly one lease');
select ok((select reservation_user_id is null from public.character_pool where id = (select (previous ->> 'id')::uuid from fixtures)), 'reroll releases the previous lease');
select ok((select reservation_expires_at between clock_timestamp() + interval '9 minutes' and clock_timestamp() + interval '10 minutes' from public.character_pool where id = (select (a ->> 'id')::uuid from fixtures)), 'lease TTL is ten minutes');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
update fixtures set b = public.reserve_character();
select isnt((select b ->> 'id' from fixtures), (select a ->> 'id' from fixtures), 'another session never receives an already leased name');
select throws_ok($$select public.claim_character((select (a ->> 'id')::uuid from fixtures))$$, '42501', null, 'a session cannot claim another session preview');
select throws_ok($$select public.restore_character((select a ->> 'name' from fixtures))$$, 'P0001', null, 'unclaimed names cannot be recovered by nickname');
select throws_ok($$select public.save_training_attempt((select (b ->> 'id')::uuid from fixtures), 'not-claimed', '{}')$$, '42501', null, 'a reservation alone cannot write training data');
reset role;
update public.character_pool set reservation_expires_at = clock_timestamp() - interval '1 second'
where id = (select (b ->> 'id')::uuid from fixtures);
set local role authenticated;
select throws_ok($$select public.claim_character((select (b ->> 'id')::uuid from fixtures))$$, '42501', null, 'expired leases cannot be claimed');
update fixtures set b = public.reserve_character();
select lives_ok($$select public.claim_character((select (b ->> 'id')::uuid from fixtures))$$, 'a refreshed candidate can be claimed');
select is(public.current_character(), (select b - 'remaining' from fixtures), 'claim attaches the stable character UUID');
reset role;
select is((select count(*) from public.character_pool where claimed_at is null), (select total - 1 from fixtures), 'first successful claim consumes exactly one name');
select ok((select reservation_user_id is null and reservation_expires_at is null from public.character_pool where id = (select (b ->> 'id')::uuid from fixtures)), 'claim clears its lease');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.claim_character((select (a ->> 'id')::uuid from fixtures))$$, 'the original preview remains claimable');
select is(public.claim_character((select (a ->> 'id')::uuid from fixtures)), (select a - 'remaining' from fixtures), 'claim retry is idempotent');
select throws_ok($$select public.reserve_character()$$, '42501', null, 'an attached session must leave before requesting another preview');
select throws_ok($$select public.restore_character((select b ->> 'name' from fixtures))$$, '42501', null, 'restoration cannot switch an active membership');
select throws_ok($$select public.claim_character((select (b ->> 'id')::uuid from fixtures))$$, '42501', null, 'claim cannot switch an active membership');
select ok(public.is_current_character((select (a ->> 'id')::uuid from fixtures)), 'RLS helper recognizes the current character');
select ok(not public.is_current_character((select (b ->> 'id')::uuid from fixtures)), 'RLS helper rejects a different character');
select is((select count(*) from public.training_records), 0::bigint, 'new characters have no imported training records');

update fixtures set first_id = public.save_training_attempt((a ->> 'id')::uuid, 'attempt-1', record, mistake);
select ok((select first_id > 0 from fixtures), 'save returns a generated numeric record id');
select is((select data from public.training_records), (select record from fixtures), 'record JSON is stored unchanged');
select is((select data from public.training_mistakes), (select mistake from fixtures), 'mistake JSON is stored unchanged');
select is(public.save_training_attempt((select (a ->> 'id')::uuid from fixtures), 'attempt-1', (select record from fixtures), (select mistake from fixtures)), (select first_id from fixtures), 'retry returns the same record id');
select is((select count(*) from public.training_records), 1::bigint, 'retry never duplicates a record');
select public.save_training_attempt((a ->> 'id')::uuid, 'attempt-2', record || '{"source":"review","time":2000}'::jsonb, mistake || '{"box":2,"attempts":3,"due":9000}'::jsonb) from fixtures;
select public.save_training_attempt((a ->> 'id')::uuid, 'attempt-1', record, mistake) from fixtures;
select is((select data ->> 'box' from public.training_mistakes), '2', 'old retries do not rewind later review progress');
select public.save_training_attempt((a ->> 'id')::uuid, 'attempt-3', record, null, mistake ->> 'id') from fixtures;
select public.save_training_attempt((a ->> 'id')::uuid, 'attempt-1', record, mistake) from fixtures;
select is((select count(*) from public.training_mistakes), 0::bigint, 'old retry does not resurrect a mastered mistake');
select public.save_training_attempt((a ->> 'id')::uuid, 'attempt-4', record, mistake) from fixtures;
select public.save_training_attempt((a ->> 'id')::uuid, 'attempt-3', record, null, mistake ->> 'id') from fixtures;
select is((select count(*) from public.training_mistakes), 1::bigint, 'old mastery retry does not delete a subsequently reintroduced mistake');

select throws_ok($$select public.save_training_attempt((select (b ->> 'id')::uuid from fixtures), 'wrong-character', '{}')$$, '42501', null, 'save rejects mismatched captured identity');
select throws_ok($$select public.clear_training_data((select (b ->> 'id')::uuid from fixtures))$$, '42501', null, 'clear rejects mismatched captured identity');
select throws_ok($$select public.save_training_attempt(null, 'null-character', '{}')$$, '42501', null, 'save requires a nonnull character');
select throws_ok($$select public.clear_training_data(null)$$, '42501', null, 'clear requires a nonnull character');
select throws_ok($$insert into public.training_records (character_id, record_key, data) select (b ->> 'id')::uuid, 'forged', record from fixtures$$, '42501', null, 'direct inserts cannot target another character');
select throws_ok($$insert into public.training_mistakes (character_id, id, data) select (b ->> 'id')::uuid, mistake ->> 'id', mistake from fixtures$$, '42501', null, 'direct mistake inserts cannot target another character');
select throws_ok($$update public.training_records set character_id = (select (b ->> 'id')::uuid from fixtures)$$, '42501', null, 'direct updates cannot transfer record ownership');
select throws_ok($$update public.training_mistakes set character_id = (select (b ->> 'id')::uuid from fixtures)$$, '42501', null, 'direct updates cannot transfer mistake ownership');
select throws_ok($$select public.save_training_attempt((select (a ->> 'id')::uuid from fixtures), 'bad-identity', '{"id":9}')$$, '22023', null, 'record payload cannot provide a generated id');
select throws_ok($$select public.save_training_attempt((select (a ->> 'id')::uuid from fixtures), 'bad-owner', '{"character_id":"forged"}')$$, '22023', null, 'record payload cannot provide an ownership field');
select throws_ok($$select public.save_training_attempt((select (a ->> 'id')::uuid from fixtures), 'bad-old-owner', '{"user_id":"forged"}')$$, '22023', null, 'obsolete ownership fields are rejected');
select throws_ok($$insert into public.training_records (character_id, record_key, data) select (a ->> 'id')::uuid, 'bad-json', '[]'::jsonb from fixtures$$, '23514', null, 'direct record writes require object JSON');
select throws_ok($$insert into public.training_mistakes (character_id, id, data) select (a ->> 'id')::uuid, 'missing', '{}'::jsonb from fixtures$$, '23514', null, 'missing mistake JSON identity cannot bypass a check through SQL null');
select throws_ok($$insert into public.training_mistakes (character_id, id, data) select (a ->> 'id')::uuid, 'mismatched', mistake from fixtures$$, '23514', null, 'mistake row and JSON identities must match');
select throws_ok($$select public.save_training_attempt((a ->> 'id')::uuid, 'ambiguous', record, mistake, mistake ->> 'id') from fixtures$$, '22023', null, 'one attempt cannot both save and remove a mistake');
select is((select count(*) from public.training_records), 4::bigint, 'rejected attempts leave no partial records');

select set_config('test.reject_mistake_delete', 'on', true);
select throws_ok($$select public.save_training_attempt((a ->> 'id')::uuid, 'failed-mastery', record, null, mistake ->> 'id') from fixtures$$, 'P0001', null, 'a failed mistake mutation aborts the whole save');
select is((select count(*) from public.training_records), 4::bigint, 'failed save rolls back the record insert');
select throws_ok($$select public.clear_training_data((select (a ->> 'id')::uuid from fixtures))$$, 'P0001', null, 'failed clear propagates the second-table failure');
select is((select count(*) from public.training_records), 4::bigint, 'failed clear restores already deleted records');
select is((select count(*) from public.training_mistakes), 1::bigint, 'failed clear preserves mistakes');
select set_config('test.reject_mistake_delete', 'off', true);
reset role;
select is((select count(*) from public.character_pool where claimed_at is null), (select total - 2 from fixtures), 'two claims and all retries consume exactly two names');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.training_records), 0::bigint, 'another membership cannot read the first character records');
select is((select count(*) from public.training_mistakes), 0::bigint, 'another membership cannot read the first character mistakes');
with changed as (update public.training_records set data = '{}' where character_id = (select (a ->> 'id')::uuid from fixtures) returning id)
select is(count(*), 0::bigint, 'cross-character direct updates affect no rows') from changed;
with changed as (delete from public.training_mistakes where character_id = (select (a ->> 'id')::uuid from fixtures) returning id)
select is(count(*), 0::bigint, 'cross-character direct deletes affect no rows') from changed;
select lives_ok($$select public.save_training_attempt((b ->> 'id')::uuid, 'attempt-1', record, mistake) from fixtures$$, 'different characters may reuse attempt keys and mistake ids');
reset role;

-- A fresh device recovers by the claimed name alone and sees the same UUID/data.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
update fixtures set c = public.reserve_character();
select is(public.restore_character('  ' || (select a ->> 'name' from fixtures) || '  '), (select a - 'remaining' from fixtures), 'nickname recovery attaches the same UUID on another device');
select is(public.restore_character((select a ->> 'name' from fixtures)), (select a - 'remaining' from fixtures), 'restoring the same identity is idempotent');
select is((select count(*) from public.training_records), 4::bigint, 'recovered identity shares all existing records');
select is((select count(*) from public.training_mistakes), 1::bigint, 'recovered identity shares existing mistakes');
select is(public.save_training_attempt((select (a ->> 'id')::uuid from fixtures), 'attempt-1', (select record from fixtures), (select mistake from fixtures)), (select first_id from fixtures), 'attempt retry from a recovered device has the same generated id');
reset role;
select is((select count(*) from public.character_sessions where character_id = (select (a ->> 'id')::uuid from fixtures)), 2::bigint, 'two auth users can share one character');
select ok((select reservation_user_id is null from public.character_pool where id = (select (c ->> 'id')::uuid from fixtures)), 'restoration releases the fresh device preview without consuming it');
set local role authenticated;
select lives_ok($$select public.leave_character((select (a ->> 'id')::uuid from fixtures))$$, 'leave detaches only the caller');
select is(public.current_character(), null::jsonb, 'leaving removes the current membership');
select lives_ok($$select public.leave_character((select (a ->> 'id')::uuid from fixtures))$$, 'leave with no membership is idempotent');
select is((select count(*) from public.training_records), 0::bigint, 'a detached session sees no records');
select throws_ok($$select public.save_training_attempt((select (a ->> 'id')::uuid from fixtures), 'late-save', '{}')$$, '42501', null, 'in-flight old-character saves are rejected after leaving');
select throws_ok($$select public.clear_training_data((select (a ->> 'id')::uuid from fixtures))$$, '42501', null, 'old-character clears are rejected after leaving');
select public.restore_character(b ->> 'name') from fixtures;
select throws_ok($$select public.leave_character((select (a ->> 'id')::uuid from fixtures))$$, '42501', null, 'stale leave cannot detach a newly restored character');
select throws_ok($$select public.save_training_attempt((select (a ->> 'id')::uuid from fixtures), 'stale-save', '{}')$$, '42501', null, 'stale save cannot mutate either identity after switching');
select throws_ok($$select public.clear_training_data((select (a ->> 'id')::uuid from fixtures))$$, '42501', null, 'stale clear cannot mutate either identity after switching');
select is(public.current_character(), (select b - 'remaining' from fixtures), 'stale requests preserve the new membership');
select is((select count(*) from public.training_records), 1::bigint, 'new membership retains its independent records');
select public.leave_character((b ->> 'id')::uuid) from fixtures;
reset role;
select is((select count(*) from public.character_sessions where character_id = (select (a ->> 'id')::uuid from fixtures)), 1::bigint, 'leaving a recovered device does not detach the original device');
select is((select count(*) from public.training_records where character_id = (select (a ->> 'id')::uuid from fixtures)), 4::bigint, 'leaving never deletes character history');
select ok((select claimed_at is not null from public.character_pool where id = (select (a ->> 'id')::uuid from fixtures)), 'leaving never returns a claimed name to the pool');

-- Transport user deletion removes membership, not the permanent character/data.
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.character_sessions where user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'auth user deletion cascades to membership');
select is((select count(*) from public.training_records where character_id = (select (a ->> 'id')::uuid from fixtures)), 4::bigint, 'auth user deletion preserves character records');
select is((select count(*) from public.training_mistakes where character_id = (select (a ->> 'id')::uuid from fixtures)), 1::bigint, 'auth user deletion preserves character mistakes');
set local role authenticated;
select lives_ok($$select public.restore_character((select a ->> 'name' from fixtures))$$, 'another device can still recover after the original auth user is deleted');
select lives_ok($$select public.clear_training_data((select (a ->> 'id')::uuid from fixtures))$$, 'a recovered member can clear shared data');
select is((select count(*) from public.training_records), 0::bigint, 'successful clear removes all character records');
select is((select count(*) from public.training_mistakes), 0::bigint, 'successful clear removes all character mistakes');
select lives_ok($$select public.clear_training_data((select (a ->> 'id')::uuid from fixtures))$$, 'clearing empty data is idempotent');
reset role;
select is((select count(*) from public.training_records where character_id = (select (b ->> 'id')::uuid from fixtures)), 1::bigint, 'clearing one character preserves another character records');
select throws_ok($$insert into public.training_records (character_id, record_key, data) values ('00000000-0000-4000-8000-000000000000', 'orphan', '{}')$$, '23503', null, 'records require a real character FK');
select throws_ok($$insert into public.training_mistakes (character_id, id, data) values ('00000000-0000-4000-8000-000000000000', 'orphan', '{"id":"orphan"}')$$, '23503', null, 'mistakes require a real character FK');
select throws_ok($$insert into public.character_sessions (user_id, character_id) select '11111111-1111-4111-8111-111111111111', (a ->> 'id')::uuid from fixtures$$, '23503', null, 'memberships require a live auth user');
select throws_ok($$delete from public.character_pool where id = (select (b ->> 'id')::uuid from fixtures)$$, '23503', null, 'character deletion cannot orphan memberships or history');

-- Reduce the private pool inside this rolled-back test to exercise finite exhaustion.
update public.character_pool set reservation_user_id = null, reservation_expires_at = null where claimed_at is null;
update fixtures set previous = (select jsonb_build_object('id', id, 'name', name) from public.character_pool where claimed_at is null limit 1);
update public.character_pool set claimed_at = clock_timestamp()
where claimed_at is null and id <> (select (previous ->> 'id')::uuid from fixtures);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
update fixtures set c = public.reserve_character();
select is((select (c ->> 'remaining')::bigint from fixtures), 1::bigint, 'remaining includes the sole unclaimed but leased name');
select is(public.reserve_character(true), (select c from fixtures), 'reroll preserves the only valid lease when no alternative exists');
reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.reserve_character()$$, 'P0001', null, 'another user cannot collide with the only live lease');
reset role;
update public.character_pool set reservation_expires_at = clock_timestamp() - interval '1 second'
where id = (select (c ->> 'id')::uuid from fixtures);
set local role authenticated;
update fixtures set previous = public.reserve_character();
select is((select previous ->> 'id' from fixtures), (select c ->> 'id' from fixtures), 'an expired lease becomes available to another session');
reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.claim_character((select (c ->> 'id')::uuid from fixtures))$$, '42501', null, 'a stale preview cannot claim a reassigned lease');
reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select public.claim_character((previous ->> 'id')::uuid) from fixtures;
select public.leave_character((previous ->> 'id')::uuid) from fixtures;
select throws_ok($$select public.reserve_character()$$, 'P0001', null, 'claiming the final name explicitly exhausts allocation');
select is(public.restore_character((select b ->> 'name' from fixtures)), (select b - 'remaining' from fixtures), 'nickname recovery remains available after pool exhaustion');
select is((select count(*) from public.training_records), 1::bigint, 'recovery after exhaustion still shares existing training data');
reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.claim_character((select (c ->> 'id')::uuid from fixtures))$$, '42501', null, 'stale claim never silently restores a name another session claimed');
select is(public.current_character(), null::jsonb, 'rejected stale claim does not attach a membership');
reset role;

-- Deleting a reservation owner releases the name rather than deleting it.
update public.character_pool set claimed_at = null, reservation_user_id = '44444444-4444-4444-8444-444444444444', reservation_expires_at = clock_timestamp() + interval '10 minutes'
where id = (select id from public.character_pool where id not in (select character_id from public.character_sessions) and id not in (select character_id from public.training_records) limit 1);
update fixtures set previous = (select jsonb_build_object('id', id) from public.character_pool where reservation_user_id = '44444444-4444-4444-8444-444444444444');
delete from auth.users where id = '44444444-4444-4444-8444-444444444444';
select ok((select reservation_user_id is null and claimed_at is null from public.character_pool where id = (select (previous ->> 'id')::uuid from fixtures)), 'auth deletion releases its lease without removing the pool entry');

select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select throws_ok($$select public.reserve_character()$$, '42501', null, 'authenticated DB role without auth.uid cannot reserve');
select throws_ok($$select public.claim_character((select (a ->> 'id')::uuid from fixtures))$$, '42501', null, 'missing transport user cannot claim');
select throws_ok($$select public.restore_character((select a ->> 'name' from fixtures))$$, '42501', null, 'missing transport user cannot restore');
select throws_ok($$select public.leave_character((select (a ->> 'id')::uuid from fixtures))$$, '42501', null, 'missing transport user cannot leave');
select throws_ok($$select public.save_training_attempt((select (a ->> 'id')::uuid from fixtures), 'missing-session', '{}')$$, '42501', null, 'missing transport user cannot save');
select throws_ok($$select public.clear_training_data((select (a ->> 'id')::uuid from fixtures))$$, '42501', null, 'missing transport user cannot clear');
select is(public.current_character(), null::jsonb, 'missing transport user has no current character');
select ok(not public.is_current_character((select (a ->> 'id')::uuid from fixtures)), 'missing transport user has no membership');
reset role;

select * from finish();
rollback;
