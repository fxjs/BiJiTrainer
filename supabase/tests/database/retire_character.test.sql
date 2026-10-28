begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, is_anonymous) values
  ('a1000000-0000-4000-8000-000000000001', true),
  ('a1000000-0000-4000-8000-000000000002', true),
  ('a1000000-0000-4000-8000-000000000003', true),
  ('a1000000-0000-4000-8000-000000000004', true);
create temporary table retirement_fixtures (
  total bigint, a jsonb, b jsonb, fresh jsonb,
  record jsonb default '{"time":1000,"verdict":"mistake"}',
  mistake jsonb default '{"id":"retirement-mistake","box":0}'
);
insert into retirement_fixtures (total) select count(*) from public.character_pool;
grant select, update on retirement_fixtures to authenticated;

-- Fail after records, mistakes, memberships and the old pool row were deleted.
create function pg_temp.reject_retirement_replacement() returns trigger
language plpgsql as $$
begin
  if current_setting('test.reject_retirement_replacement', true) = 'on' then
    raise exception 'injected retirement replacement failure';
  end if;
  return new;
end;
$$;
create trigger reject_retirement_replacement before insert on public.character_pool
  for each row execute function pg_temp.reject_retirement_replacement();

select ok(not has_function_privilege('anon', 'public.retire_character(uuid)', 'EXECUTE'), 'anon cannot retire a character');
select ok(has_function_privilege('authenticated', 'public.retire_character(uuid)', 'EXECUTE'), 'authenticated sessions may call retirement');
select ok(p.prosecdef and p.proconfig @> array['search_path=""'], 'retirement is security definer with an empty search path')
from pg_proc p where p.oid = 'public.retire_character(uuid)'::regprocedure;
set local role anon;
select throws_ok($$select public.retire_character(gen_random_uuid())$$, '42501', null, 'unauthenticated execution is denied');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.retire_character(gen_random_uuid())$$, '42501', null, 'the role alone without a real auth user cannot retire');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
update retirement_fixtures set a = public.reserve_character();
select public.claim_character((a ->> 'id')::uuid) from retirement_fixtures;
select public.save_training_attempt((a ->> 'id')::uuid, 'old-attempt', record, mistake) from retirement_fixtures;
select throws_ok($$select public.retire_character(null)$$, '42501', null, 'retirement requires a captured nonnull UUID');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
update retirement_fixtures set b = public.reserve_character();
select public.claim_character((b ->> 'id')::uuid) from retirement_fixtures;
select public.save_training_attempt((b ->> 'id')::uuid, 'other-attempt', record, mistake) from retirement_fixtures;
select throws_ok($$select public.retire_character((select (a ->> 'id')::uuid from retirement_fixtures))$$, '42501', null, 'a different bound identity cannot retire another character');
select is(public.current_character(), (select b - 'remaining' from retirement_fixtures), 'denial preserves the caller identity');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.retire_character((select (a ->> 'id')::uuid from retirement_fixtures))$$, '42501', null, 'an unbound authenticated user cannot retire a live identity');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select public.restore_character(a ->> 'name') from retirement_fixtures;
select public.save_training_attempt((a ->> 'id')::uuid, 'shared-device-attempt', record, mistake) from retirement_fixtures;
reset role;
select is((select count(*) from public.character_sessions where character_id = (select (a ->> 'id')::uuid from retirement_fixtures)), 2::bigint, 'the character is shared across two real transport sessions');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('test.reject_retirement_replacement', 'on', true);
select throws_ok($$select public.retire_character((select (a ->> 'id')::uuid from retirement_fixtures))$$, 'P0001', 'injected retirement replacement failure', 'a failure at UUID replacement propagates');
select is(public.current_character(), (select a - 'remaining' from retirement_fixtures), 'failed retirement preserves the original identity');
select is((select count(*) from public.training_records), 2::bigint, 'failed retirement restores all deleted records');
select is((select count(*) from public.training_mistakes), 1::bigint, 'failed retirement restores deleted mistakes');
select set_config('test.reject_retirement_replacement', 'off', true);
reset role;
select is((select count(*) from public.character_sessions where character_id = (select (a ->> 'id')::uuid from retirement_fixtures)), 2::bigint, 'failed retirement restores every shared-device membership');
select ok((select claimed_at is not null from public.character_pool where id = (select (a ->> 'id')::uuid from retirement_fixtures)), 'failed retirement restores the claimed old UUID');
select is((select count(*) from public.character_pool), (select total from retirement_fixtures), 'failed retirement does not alter the pool size');

set local role authenticated;
select lives_ok($$select public.retire_character((select (a ->> 'id')::uuid from retirement_fixtures))$$, 'retry retires the character successfully');
select is(public.current_character(), null::jsonb, 'the initiating device has no identity after retirement');
select lives_ok($$select public.retire_character((select (a ->> 'id')::uuid from retirement_fixtures))$$, 'a detached retry of the removed UUID is idempotent');
select throws_ok($$select public.restore_character((select a ->> 'name' from retirement_fixtures))$$, 'P0001', null, 'a released but unclaimed name cannot restore deleted history');
select throws_ok($$select public.claim_character((select (a ->> 'id')::uuid from retirement_fixtures))$$, '42501', null, 'the removed UUID cannot be claimed or restored as an old preview');
select throws_ok($$select public.save_training_attempt((select (a ->> 'id')::uuid from retirement_fixtures), 'late-old-save', '{}')$$, '42501', null, 'a delayed old UUID save is rejected');
select throws_ok($$select public.clear_training_data((select (a ->> 'id')::uuid from retirement_fixtures))$$, '42501', null, 'a delayed old UUID clear is rejected');
reset role;
select is((select count(*) from public.training_records where character_id = (select (a ->> 'id')::uuid from retirement_fixtures)), 0::bigint, 'all old records are deleted');
select is((select count(*) from public.training_mistakes where character_id = (select (a ->> 'id')::uuid from retirement_fixtures)), 0::bigint, 'all old mistakes are deleted');
select is((select count(*) from public.character_sessions where character_id = (select (a ->> 'id')::uuid from retirement_fixtures)), 0::bigint, 'all shared memberships are deleted');
select is((select count(*) from public.character_pool where id = (select (a ->> 'id')::uuid from retirement_fixtures)), 0::bigint, 'the old UUID itself is removed');
update retirement_fixtures set fresh = (select jsonb_build_object('id', id, 'name', name) from public.character_pool where name = a ->> 'name');
select isnt((select fresh ->> 'id' from retirement_fixtures), (select a ->> 'id' from retirement_fixtures), 'the same name returns with a new UUID');
select ok((select claimed_at is null and reservation_user_id is null and reservation_expires_at is null from public.character_pool where id = (select (fresh ->> 'id')::uuid from retirement_fixtures)), 'the replacement is unclaimed and unleased');
select is((select count(*) from public.character_pool), (select total from retirement_fixtures), 'retirement preserves the finite pool size');
select is((select count(*) from public.training_records where character_id = (select (b ->> 'id')::uuid from retirement_fixtures)), 1::bigint, 'another character retains its records');
select is((select count(*) from public.training_mistakes where character_id = (select (b ->> 'id')::uuid from retirement_fixtures)), 1::bigint, 'another character retains its mistakes');
select throws_ok($$insert into public.character_sessions (user_id, character_id) select 'a1000000-0000-4000-8000-000000000001', (a ->> 'id')::uuid from retirement_fixtures$$, '23503', null, 'even a privileged stale UUID binding cannot resurrect the retired generation');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is(public.current_character(), null::jsonb, 'a second device is detached too');
select is((select count(*) from public.training_records), 0::bigint, 'the old shared device has no RLS access');
select throws_ok($$select public.save_training_attempt((select (a ->> 'id')::uuid from retirement_fixtures), 'shared-late-save', '{}')$$, '42501', null, 'the former shared device cannot write to the old UUID');
select lives_ok($$select public.retire_character((select (a ->> 'id')::uuid from retirement_fixtures))$$, 'a former shared device can safely retry the completed retirement');
reset role;

-- Leave only the released name allocatable, without changing permanent seed data.
update public.character_pool set claimed_at = clock_timestamp(), reservation_user_id = null, reservation_expires_at = null
where claimed_at is null and id <> (select (fresh ->> 'id')::uuid from retirement_fixtures);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(public.reserve_character() - 'remaining', (select fresh from retirement_fixtures), 'a new user can reserve the returned name');
select is(public.claim_character((select (fresh ->> 'id')::uuid from retirement_fixtures)), (select fresh from retirement_fixtures), 'a new user can claim the returned name');
select is((select count(*) from public.training_records), 0::bigint, 'the new generation starts without old records');
select is((select count(*) from public.training_mistakes), 0::bigint, 'the new generation starts without old mistakes');
select throws_ok($$select public.save_training_attempt((select (a ->> 'id')::uuid from retirement_fixtures), 'stale-old-key', '{}')$$, '42501', null, 'even the new owner cannot save against the old UUID');
select throws_ok($$select public.claim_character((select (a ->> 'id')::uuid from retirement_fixtures))$$, '42501', null, 'an old UUID cannot replace the newly claimed generation');
select throws_ok($$select public.retire_character((select (a ->> 'id')::uuid from retirement_fixtures))$$, '42501', null, 'a stale retirement cannot retire the new membership');
select public.save_training_attempt((fresh ->> 'id')::uuid, 'old-attempt', record, mistake) from retirement_fixtures;
select is((select count(*) from public.training_records), 1::bigint, 'the new owner can reuse an old attempt key without old idempotency state');
select public.leave_character((fresh ->> 'id')::uuid) from retirement_fixtures;
select is(public.restore_character((select fresh ->> 'name' from retirement_fixtures)), (select fresh from retirement_fixtures), 'an explicit new name recovery uses only the new generation');
select is((select count(*) from public.training_records), 1::bigint, 'switching still preserves current-generation history');
reset role;

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.retire_character((select (fresh ->> 'id')::uuid from retirement_fixtures))$$, '42501', null, 'a former owner cannot retire the new live UUID without explicitly restoring it');
select throws_ok($$insert into public.training_records (character_id, record_key, data) select (fresh ->> 'id')::uuid, 'old-device-forgery', '{}' from retirement_fixtures$$, '42501', null, 'old-device RLS cannot write into the new generation');
reset role;

select * from finish();
rollback;
