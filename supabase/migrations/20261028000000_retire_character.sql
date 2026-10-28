-- Leaving keeps a claimed identity. Retirement is the separate destructive operation:
-- all memberships/history disappear and the name returns with a fresh UUID.
-- Lock order remains caller auth.users -> character_pool -> history/memberships.
-- Never lock other members' auth.users: two shared devices may retire together.
-- Shared character locks make save/clear/restore finish before retirement, or
-- re-check membership after it. An in-flight restore must not follow a reused name.
create or replace function public.restore_character(p_name text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current uuid;
  v_character public.character_pool%rowtype;
begin
  perform 1 from auth.users where id = v_user_id for update;
  if not found then
    raise exception 'An authenticated session is required' using errcode = '42501';
  end if;
  select * into v_character from public.character_pool
    where name = btrim(p_name) and claimed_at is not null for key share;
  if v_character.id is null then
    raise exception '没有找到这个已使用的名号' using errcode = 'P0001';
  end if;
  select character_id into v_current from public.character_sessions where user_id = v_user_id;
  if v_current is not null and v_current <> v_character.id then
    raise exception 'Leave the current character before restoring another' using errcode = '42501';
  end if;
  update public.character_pool set reservation_user_id = null, reservation_expires_at = null
    where reservation_user_id = v_user_id;
  insert into public.character_sessions (user_id, character_id) values (v_user_id, v_character.id)
    on conflict (user_id) do nothing;
  return jsonb_build_object('id', v_character.id, 'name', v_character.name);
end;
$$;

create or replace function public.save_training_attempt(
  p_character_id uuid,
  p_key text,
  p_record jsonb,
  p_mistake jsonb default null,
  p_delete_mistake text default null
) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id bigint;
begin
  perform 1 from auth.users where id = v_user_id for update;
  if not found then
    raise exception 'The current character does not match the requested character' using errcode = '42501';
  end if;
  perform 1 from public.character_pool where id = p_character_id for key share;
  if not found or not public.is_current_character(p_character_id) then
    raise exception 'The current character does not match the requested character' using errcode = '42501';
  end if;
  if p_key is null or length(btrim(p_key)) = 0 then
    raise exception 'A nonempty attempt key is required' using errcode = '22023';
  end if;
  if p_record is null or jsonb_typeof(p_record) <> 'object'
     or p_record ? 'id' or p_record ? 'character_id' or p_record ? 'user_id' then
    raise exception 'The record must be an object without identity fields' using errcode = '22023';
  end if;
  if p_mistake is not null and p_delete_mistake is not null then
    raise exception 'A mistake cannot be saved and deleted in the same attempt' using errcode = '22023';
  end if;
  if p_mistake is not null and (
    jsonb_typeof(p_mistake) <> 'object'
    or coalesce(jsonb_typeof(p_mistake -> 'id') <> 'string', true)
    or coalesce(length(btrim(p_mistake ->> 'id')) = 0, true)
    or p_mistake ? 'character_id' or p_mistake ? 'user_id'
  ) then
    raise exception 'The mistake must be an object with a nonempty string id' using errcode = '22023';
  end if;
  if p_delete_mistake is not null and length(btrim(p_delete_mistake)) = 0 then
    raise exception 'A nonempty mistake id is required' using errcode = '22023';
  end if;

  insert into public.training_records (character_id, record_key, data)
    values (p_character_id, p_key, p_record)
    on conflict (character_id, record_key) do nothing
    returning id into v_id;
  if v_id is null then
    -- A retry must not replay an old mistake/SRS state.
    select id into strict v_id from public.training_records
      where character_id = p_character_id and record_key = p_key;
    return v_id;
  end if;
  if p_mistake is not null then
    insert into public.training_mistakes (character_id, id, data)
      values (p_character_id, p_mistake ->> 'id', p_mistake)
      on conflict (character_id, id) do update set data = excluded.data;
  elsif p_delete_mistake is not null then
    delete from public.training_mistakes where character_id = p_character_id and id = p_delete_mistake;
  end if;
  return v_id;
end;
$$;

create or replace function public.clear_training_data(p_character_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  perform 1 from auth.users where id = v_user_id for update;
  if not found then
    raise exception 'The current character does not match the requested character' using errcode = '42501';
  end if;
  perform 1 from public.character_pool where id = p_character_id for key share;
  if not found or not public.is_current_character(p_character_id) then
    raise exception 'The current character does not match the requested character' using errcode = '42501';
  end if;
  delete from public.training_records where character_id = p_character_id;
  delete from public.training_mistakes where character_id = p_character_id;
end;
$$;

create function public.retire_character(p_character_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
begin
  perform 1 from auth.users where id = v_user_id for update;
  if not found then
    raise exception 'An authenticated session is required' using errcode = '42501';
  end if;
  if p_character_id is null then
    raise exception 'The current character does not match the requested character' using errcode = '42501';
  end if;
  select name into v_name from public.character_pool where id = p_character_id for update;
  if not found then
    -- A committed retirement removed this generation. A detached caller may
    -- retry safely; an old request must never operate on a new membership.
    if not exists (select 1 from public.character_sessions where user_id = v_user_id) then
      return;
    end if;
    raise exception 'The current character does not match the requested character' using errcode = '42501';
  end if;
  if not public.is_current_character(p_character_id) then
    raise exception 'The current character does not match the requested character' using errcode = '42501';
  end if;

  delete from public.training_records where character_id = p_character_id;
  delete from public.training_mistakes where character_id = p_character_id;
  delete from public.character_sessions where character_id = p_character_id;
  delete from public.character_pool where id = p_character_id;
  -- Never reset claimed_at in place: captured old UUIDs must remain unusable,
  -- including old previews, delayed writes and former shared-device bindings.
  insert into public.character_pool (name) values (v_name);
end;
$$;

revoke all on function public.retire_character(uuid) from public, anon, authenticated;
grant execute on function public.retire_character(uuid) to authenticated;
