-- Character names are finite, private credentials; transport auth users own memberships,
-- not training history. A claimed character survives leaving or deleting an auth user.
create table public.character_pool (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  claimed_at timestamptz,
  reservation_user_id uuid references auth.users (id) on delete set null,
  reservation_expires_at timestamptz,
  constraint character_pool_lease_expiry check (
    reservation_user_id is null or reservation_expires_at is not null
  ),
  constraint character_pool_claim_without_lease check (
    claimed_at is null or (reservation_user_id is null and reservation_expires_at is null)
  )
);
create unique index character_pool_one_reservation_per_user
  on public.character_pool (reservation_user_id) where reservation_user_id is not null;

create table public.character_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  character_id uuid not null references public.character_pool (id) on delete restrict
);
create index character_sessions_character_id_idx on public.character_sessions (character_id);

-- Real characters from Jin Yong's novels. No generated suffixes or client-side pool.
insert into public.character_pool (name) values
  ('郭靖'), ('黄蓉'), ('杨康'), ('穆念慈'), ('洪七公'),
  ('黄药师'), ('欧阳锋'), ('周伯通'), ('一灯大师'), ('裘千仞'),
  ('梅超风'), ('陈玄风'), ('柯镇恶'), ('朱聪'), ('韩宝驹'),
  ('南希仁'), ('张阿生'), ('全金发'), ('韩小莹'), ('丘处机'),
  ('马钰'), ('王处一'), ('谭处端'), ('刘处玄'), ('孙不二'),
  ('杨过'), ('小龙女'), ('李莫愁'), ('陆无双'), ('程英'),
  ('公孙绿萼'), ('公孙止'), ('裘千尺'), ('金轮法王'), ('郭芙'),
  ('郭襄'), ('郭破虏'), ('耶律齐'), ('耶律燕'), ('完颜萍'),
  ('武敦儒'), ('武修文'), ('武三通'), ('瑛姑'), ('傻姑'),
  ('张无忌'), ('赵敏'), ('周芷若'), ('小昭'), ('殷离'),
  ('谢逊'), ('殷天正'), ('韦一笑'), ('杨逍'), ('范遥'),
  ('张三丰'), ('张翠山'), ('殷素素'), ('宋远桥'), ('俞莲舟'),
  ('俞岱岩'), ('张松溪'), ('殷梨亭'), ('莫声谷'), ('成昆'),
  ('乔峰'), ('段誉'), ('虚竹'), ('王语嫣'), ('阿朱'),
  ('阿紫'), ('木婉清'), ('钟灵'), ('慕容复'), ('鸠摩智'),
  ('段正淳'), ('段正明'), ('天山童姥'), ('李秋水'), ('无崖子'),
  ('令狐冲'), ('任盈盈'), ('岳灵珊'), ('林平之'), ('岳不群'),
  ('宁中则'), ('东方不败'), ('任我行'), ('向问天'), ('田伯光'),
  ('胡斐'), ('苗若兰'), ('程灵素'), ('袁紫衣'), ('胡一刀'),
  ('苗人凤'), ('狄云'), ('戚芳'), ('水笙'), ('丁典');

create table public.training_records (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.character_pool (id) on delete restrict,
  record_key text not null check (length(btrim(record_key)) > 0),
  data jsonb not null,
  constraint training_records_character_record_key unique (character_id, record_key),
  constraint training_records_data_identity check (
    jsonb_typeof(data) = 'object'
    and not (data ? 'id')
    and not (data ? 'character_id')
    and not (data ? 'user_id')
  )
);
create table public.training_mistakes (
  character_id uuid not null references public.character_pool (id) on delete restrict,
  id text not null check (length(btrim(id)) > 0),
  data jsonb not null,
  primary key (character_id, id),
  constraint training_mistakes_data_identity check (
    jsonb_typeof(data) = 'object'
    and coalesce(jsonb_typeof(data -> 'id') = 'string' and data ->> 'id' = id, false)
    and not (data ? 'character_id')
    and not (data ? 'user_id')
  )
);
create index training_records_character_id_id_idx on public.training_records (character_id, id);

alter table public.character_pool enable row level security;
alter table public.character_sessions enable row level security;
alter table public.training_records enable row level security;
alter table public.training_mistakes enable row level security;

create function public.is_current_character(p_character_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.character_sessions
    where user_id = (select auth.uid()) and character_id = p_character_id
  );
$$;

create policy training_records_character_only on public.training_records
  for all to authenticated
  using (public.is_current_character(character_id))
  with check (public.is_current_character(character_id));
create policy training_mistakes_character_only on public.training_mistakes
  for all to authenticated
  using (public.is_current_character(character_id))
  with check (public.is_current_character(character_id));

revoke all on public.character_pool, public.character_sessions,
  public.training_records, public.training_mistakes from public, anon, authenticated;
grant all on public.character_pool, public.character_sessions,
  public.training_records, public.training_mistakes to service_role;
grant select, insert, update, delete on public.training_records, public.training_mistakes to authenticated;
revoke all on sequence public.training_records_id_seq from public, anon, authenticated;
grant usage, select on sequence public.training_records_id_seq to authenticated, service_role;

create function public.current_character() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'name', c.name)
  from public.character_sessions s join public.character_pool c on c.id = s.character_id
  where s.user_id = (select auth.uid());
$$;

create function public.reserve_character(p_replace boolean default false) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.character_pool%rowtype;
  v_next public.character_pool%rowtype;
  v_remaining bigint;
begin
  -- Every membership mutation and training RPC takes this same per-session lock.
  perform 1 from auth.users where id = v_user_id for update;
  if not found then
    raise exception 'An authenticated session is required' using errcode = '42501';
  end if;
  if exists (select 1 from public.character_sessions where user_id = v_user_id) then
    raise exception 'Leave the current character before reserving another' using errcode = '42501';
  end if;

  select * into v_old from public.character_pool
    where reservation_user_id = v_user_id for update;
  if v_old.id is not null and v_old.reservation_expires_at > clock_timestamp()
     and not coalesce(p_replace, false) then
    v_next := v_old;
  else
    -- Holding a candidate does not consume it. Skip leases/row locks owned by
    -- other sessions, including when two devices request their previews together.
    select * into v_next from public.character_pool
      where claimed_at is null
        and (reservation_user_id is null or reservation_expires_at <= clock_timestamp())
        and (v_old.id is null or id <> v_old.id)
      order by random()
      limit 1 for update skip locked;
    if v_next.id is null then
      if v_old.id is null then
        raise exception '暂时没有可用名号，请输入原名号或稍后重试' using errcode = 'P0001';
      end if;
      -- With no alternative, preserve (or renew) the existing unclaimed lease.
      v_next := v_old;
    end if;
    if v_old.id is not null and v_old.id <> v_next.id then
      update public.character_pool set reservation_user_id = null, reservation_expires_at = null
        where id = v_old.id;
    end if;
    update public.character_pool
      set reservation_user_id = v_user_id,
          reservation_expires_at = clock_timestamp() + interval '10 minutes'
      where id = v_next.id;
  end if;

  select count(*) into v_remaining from public.character_pool where claimed_at is null;
  return jsonb_build_object('id', v_next.id, 'name', v_next.name, 'remaining', v_remaining);
end;
$$;

create function public.claim_character(p_character_id uuid) returns jsonb
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
  select character_id into v_current from public.character_sessions where user_id = v_user_id;
  if v_current is not null then
    if v_current = p_character_id then
      return public.current_character();
    end if;
    raise exception 'Leave the current character before claiming another' using errcode = '42501';
  end if;
  select * into v_character from public.character_pool where id = p_character_id for update;
  if v_character.id is null or v_character.claimed_at is not null
     or v_character.reservation_user_id is distinct from v_user_id
     or v_character.reservation_expires_at <= clock_timestamp() then
    raise exception '这个名号已失效，请掷骰重新选择' using errcode = '42501';
  end if;
  update public.character_pool
    set claimed_at = clock_timestamp(), reservation_user_id = null, reservation_expires_at = null
    where id = v_character.id;
  insert into public.character_sessions (user_id, character_id) values (v_user_id, v_character.id);
  return jsonb_build_object('id', v_character.id, 'name', v_character.name);
end;
$$;

create function public.restore_character(p_name text) returns jsonb
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
    where name = btrim(p_name) and claimed_at is not null;
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

create function public.leave_character(p_character_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current uuid;
begin
  perform 1 from auth.users where id = v_user_id for update;
  if not found then
    raise exception 'An authenticated session is required' using errcode = '42501';
  end if;
  select character_id into v_current from public.character_sessions where user_id = v_user_id;
  if v_current is null then
    return;
  end if;
  if v_current is distinct from p_character_id then
    raise exception 'The current character does not match the requested character' using errcode = '42501';
  end if;
  delete from public.character_sessions where user_id = v_user_id;
end;
$$;

create function public.save_training_attempt(
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
    -- A separate statement sees a concurrent device's committed insert. Retrying
    -- an old attempt must never replay its old mistake/SRS state.
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

create function public.clear_training_data(p_character_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  perform 1 from auth.users where id = v_user_id for update;
  if not found or not public.is_current_character(p_character_id) then
    raise exception 'The current character does not match the requested character' using errcode = '42501';
  end if;
  delete from public.training_records where character_id = p_character_id;
  delete from public.training_mistakes where character_id = p_character_id;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default; every exposed function is
-- authenticated-only, including the narrowly scoped SECURITY DEFINER RLS helper.
revoke all on function public.is_current_character(uuid), public.current_character(),
  public.reserve_character(boolean), public.claim_character(uuid), public.restore_character(text),
  public.leave_character(uuid), public.save_training_attempt(uuid, text, jsonb, jsonb, text),
  public.clear_training_data(uuid) from public, anon, authenticated;
grant execute on function public.is_current_character(uuid), public.current_character(),
  public.reserve_character(boolean), public.claim_character(uuid), public.restore_character(text),
  public.leave_character(uuid), public.save_training_attempt(uuid, text, jsonb, jsonb, text),
  public.clear_training_data(uuid) to authenticated;
