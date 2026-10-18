-- 보안 보강 2: 입력 길이와 개수, 04:00 경계를 넘는 일정, 서쪽 시간대 변경
-- 1. 목표 이름 1~60자, 처음 이유 20~1000자, 오늘의 이유 20~500자.
--    상황은 place, my_role, partner, task 네 문자열(각 1~100자). 하위 상황은 3~8개(각 1~40자).
--    RPC가 먼저 검사해 코드(invalid, reason_long)로 답하고, 표 CHECK가 마지막으로 막는다.
--    표 CHECK의 하위 상황은 0~8개다. 기본값 '[]'와 RPC를 거치지 않는 행(시드, 테스트)을 위해서다.
-- 2. 학습과 회고(3분)가 하루 경계 04:00을 넘는 일정은 만들거나 바꿀 수 없다(crosses_boundary).
-- 3. 시간대 예약은 옛 시간대와 새 시간대 모두에서 하루 키가 적용일 이상일 때 바꾼다.
--    서쪽으로 크게 옮길 때(+14 → -12) 지난 날을 다시 받는 일을 막는다.

-- ───────── 1. 모양 검사 함수 ─────────

create function app_private.valid_situation(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p) k) is distinct from array['my_role', 'partner', 'place', 'task'] then
    return false;
  end if;
  return not exists (
    select 1 from jsonb_each(p) e
    where jsonb_typeof(e.value) <> 'string'
       or char_length(e.value #>> '{}') > 100
       or app_private.clean(e.value #>> '{}') = ''
  );
end;
$$;

create function app_private.valid_subsituations(p jsonb, p_min int)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between p_min and 8 then
    return false;
  end if;
  return not exists (
    select 1 from jsonb_array_elements(p) e
    where jsonb_typeof(e) <> 'string'
       or char_length(e #>> '{}') > 40
       or app_private.clean(e #>> '{}') = ''
  );
end;
$$;

-- 학습 시작이 00:00~03:59이고 학습 분 + 회고 3분이 04:00을 넘으면 참
create function app_private.crosses_boundary(p_start_minutes int, p_target_minutes int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_start_minutes < 240 and p_start_minutes + p_target_minutes + 3 > 240;
$$;

alter table public.goals
  add constraint goals_name_max check (char_length(name) <= 60),
  add constraint goals_reason_max check (char_length(reason) <= 1000),
  add constraint goals_situation_shape check (app_private.valid_situation(situation)),
  add constraint goals_subsituations_shape check (app_private.valid_subsituations(subsituations, 0));

alter table public.days
  add constraint days_today_reason_max check (char_length(today_reason) <= 500);

-- ───────── 2. 목표 만들기와 일정 변경 ─────────

create or replace function app_private.create_goal(
  p_uid uuid,
  p_name text,
  p_reason text,
  p_period_days int,
  p_weekdays int[],
  p_start_minutes int,
  p_target_minutes int,
  p_situation jsonb,
  p_subsituations jsonb,
  p_now timestamptz
)
returns public.goals
language plpgsql
set search_path = ''
as $$
declare
  p public.profiles;
  g public.goals;
  v_name text := app_private.clean(p_name);
  v_reason text := app_private.clean(p_reason);
  v_weekdays int[] := app_private.norm_weekdays(p_weekdays);
  v_subs jsonb := coalesce(p_subsituations, '[]'::jsonb);
  v_first date;
begin
  perform app_private.settle_user(p_uid, p_now);
  p := app_private.check_profile(p_uid, p_now);

  -- 같은 요청이 다시 오면(이름과 이유가 같으면) 이미 만든 목표를 돌려준다.
  select * into g from public.goals where user_id = p_uid and status = 'active';
  if found then
    if g.name = v_name and g.reason = v_reason then
      return g;
    end if;
    perform app_private.err('invalid');
  end if;

  if char_length(v_reason) < 20 then
    perform app_private.err('reason_short');
  end if;
  if char_length(v_reason) > 1000 then
    perform app_private.err('reason_long');
  end if;
  if char_length(v_name) not between 1 and 60
     or p_period_days is null or p_period_days not between 7 and 90
     or v_weekdays is null
     or p_start_minutes is null or p_start_minutes not between 0 and 1439
     or p_target_minutes is null or p_target_minutes not between 10 and 30
     or not app_private.valid_situation(p_situation)
     or not app_private.valid_subsituations(v_subs, 3) then
    perform app_private.err('invalid');
  end if;
  if app_private.crosses_boundary(p_start_minutes, p_target_minutes) then
    perform app_private.err('crosses_boundary');
  end if;

  v_first := app_private.day_key(p_now, p.timezone) + 1;

  insert into public.goals (
    user_id, name, reason, period_days, weekdays, start_minutes, target_minutes,
    situation, subsituations, first_day, settled_day, created_at
  ) values (
    p_uid, v_name, v_reason, p_period_days, v_weekdays, p_start_minutes, p_target_minutes,
    p_situation, v_subs, v_first, v_first - 1, p_now
  )
  returning * into g;

  insert into public.episodes (goal_id, index, user_id, subsituations)
  values (g.id, 0, p_uid, v_subs);

  return g;
end;
$$;

create or replace function app_private.change_schedule(
  p_uid uuid,
  p_goal uuid,
  p_start_minutes int,
  p_target_minutes int,
  p_weekdays int[],
  p_now timestamptz
)
returns public.goals
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
  v_weekdays int[] := app_private.norm_weekdays(p_weekdays);
  v_today date;
begin
  g := app_private.own_goal(p_uid, p_goal, p_now);
  perform app_private.require_active(g, p_now);
  if v_weekdays is null
     or p_start_minutes is null or p_start_minutes not between 0 and 1439
     or p_target_minutes is null or p_target_minutes not between 10 and 30 then
    perform app_private.err('invalid');
  end if;
  if app_private.crosses_boundary(p_start_minutes, p_target_minutes) then
    perform app_private.err('crosses_boundary');
  end if;
  v_today := app_private.day_key(p_now, app_private.tz_of(p_uid));

  update public.goals
  set pending_change = jsonb_build_object(
        'start_minutes', p_start_minutes,
        'target_minutes', p_target_minutes,
        'weekdays', to_jsonb(v_weekdays),
        'from_day', v_today + 1
      )
  where id = g.id
  returning * into g;
  return g;
end;
$$;

-- ───────── 오늘의 이유 길이 ─────────

create or replace function app_private.start_day(p_uid uuid, p_goal uuid, p_reason text, p_now timestamptz)
returns public.days
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
  p public.profiles;
  r public.days;
  v_set record;
  v_today date;
  v_reason text := app_private.clean(p_reason);
  v_prev text;
begin
  g := app_private.own_goal(p_uid, p_goal, p_now);
  p := app_private.check_profile(p_uid, p_now);
  perform app_private.require_active(g, p_now);

  v_today := app_private.day_key(p_now, p.timezone);
  if v_today < g.first_day then
    perform app_private.err('before_first_day');
  end if;
  select * into v_set from app_private.settings_for(g, v_today);
  if not app_private.is_study_day(v_today, v_set.weekdays) then
    perform app_private.err('not_study_day');
  end if;

  -- 이미 시작했으면 그 행을 그대로 돌려준다(session_started_at 유지).
  select * into r from public.days where goal_id = g.id and day = v_today;
  if found then
    if r.status = 'progress' then
      return r;
    elsif r.status in ('done', 'coupon') then
      perform app_private.err('already_done');
    end if;
    perform app_private.err('invalid');
  end if;

  if p_now < app_private.local_at(v_today, v_set.start_minutes, p.timezone) - interval '30 minutes' then
    perform app_private.err('too_early');
  end if;
  if char_length(v_reason) < 20 then
    perform app_private.err('reason_short');
  end if;
  if char_length(v_reason) > 500 then
    perform app_private.err('reason_long');
  end if;
  -- 직전에 쓴 오늘의 이유와 같으면 안 된다.
  select d.today_reason into v_prev
  from public.days d
  where d.goal_id = g.id and d.day < v_today and d.today_reason is not null
  order by d.day desc
  limit 1;
  if v_prev is not null and v_prev = v_reason then
    perform app_private.err('reason_same');
  end if;

  insert into public.days (goal_id, day, user_id, status, today_reason, phase, target_minutes, session_started_at)
  values (g.id, v_today, p_uid, 'progress', v_reason, 'A', v_set.target_minutes, p_now)
  returning * into r;
  return r;
end;
$$;

-- ───────── 3. 시간대 예약 적용 ─────────

create or replace function app_private.apply_timezone(p_uid uuid, p_now timestamptz)
returns void
language sql
set search_path = ''
as $$
  update public.profiles
  set timezone = pending_timezone,
      pending_timezone = null,
      pending_timezone_from = null
  where user_id = p_uid
    and pending_timezone is not null
    and app_private.day_key(p_now, timezone) >= pending_timezone_from
    and app_private.day_key(p_now, pending_timezone) >= pending_timezone_from;
$$;

create or replace function app_private.settle_all(p_now timestamptz default now())
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  update public.profiles
  set timezone = pending_timezone,
      pending_timezone = null,
      pending_timezone_from = null
  where pending_timezone is not null
    and app_private.day_key(p_now, timezone) >= pending_timezone_from
    and app_private.day_key(p_now, pending_timezone) >= pending_timezone_from;

  for v_id in select id from public.goals where status = 'active' loop
    perform app_private.settle_goal(v_id, p_now);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;
