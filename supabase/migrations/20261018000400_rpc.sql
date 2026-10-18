-- 상태 변경 RPC
-- 구조: app_private.<이름>(p_uid, ..., p_now) 에 판정 로직을 두고,
--       public.<이름>(...) 은 auth.uid()와 now()를 넘기기만 한다. 클라이언트 시각은 받지 않는다.
-- 실패: errcode P0001, message = 코드(not_found, not_active, suspended, banned, not_study_day,
--       before_first_day, too_early, reason_short, reason_same, already_done, not_enough_time,
--       no_coupon, already_requested, not_requested, not_yet, invalid)

-- ───────── 내부 공통 ─────────

-- 내 프로필. 영구 정지와 기간 정지를 막는다.
create function app_private.check_profile(p_uid uuid, p_now timestamptz)
returns public.profiles
language plpgsql
set search_path = ''
as $$
declare
  p public.profiles;
begin
  if p_uid is null then
    perform app_private.err('invalid');
  end if;
  select * into p from public.profiles where user_id = p_uid;
  if not found then
    perform app_private.err('not_found');
  end if;
  if p.banned then
    perform app_private.err('banned');
  end if;
  if p.suspended_until is not null and p.suspended_until >= p_now then
    perform app_private.err('suspended');
  end if;
  return p;
end;
$$;

-- 내 목표를 잠그고, 시간대 예약과 지난 날 판정을 먼저 반영한 뒤 돌려준다.
-- 24시간이 지난 포기 신청은 cron이 확정하기 전이라도 활성으로 보지 않는다.
create function app_private.own_goal(p_uid uuid, p_goal uuid, p_now timestamptz)
returns public.goals
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
begin
  if p_uid is null then
    perform app_private.err('invalid');
  end if;
  perform 1 from public.goals where id = p_goal and user_id = p_uid for update;
  if not found then
    perform app_private.err('not_found');
  end if;
  perform app_private.apply_timezone(p_uid, p_now);
  perform app_private.settle_goal(p_goal, p_now);
  select * into g from public.goals where id = p_goal;
  if g.status = 'given_up' then
    perform app_private.err('not_found');
  end if;
  return g;
end;
$$;

create function app_private.require_active(g public.goals, p_now timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if g.status <> 'active'
     or (g.giveup_requested_at is not null and g.giveup_requested_at + interval '24 hours' <= p_now) then
    perform app_private.err('not_active');
  end if;
end;
$$;

create function app_private.tz_of(p_uid uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select timezone from public.profiles where user_id = p_uid), 'Asia/Seoul');
$$;

create function app_private.phase_rank(p_phase text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_phase when 'A' then 1 when 'B' then 2 when 'C' then 3 when 'retro' then 4 else 0 end;
$$;

-- ───────── 프로필 ─────────

-- 시간대 변경 예약. 옛 시간대 기준 내일부터 적용한다.
create function app_private.set_timezone(p_uid uuid, p_tz text, p_now timestamptz)
returns public.profiles
language plpgsql
set search_path = ''
as $$
declare
  p public.profiles;
begin
  if p_uid is null or not app_private.valid_tz(p_tz) then
    perform app_private.err('invalid');
  end if;
  perform app_private.apply_timezone(p_uid, p_now);
  select * into p from public.profiles where user_id = p_uid for update;
  if not found then
    perform app_private.err('not_found');
  end if;

  if p.timezone = p_tz then
    update public.profiles
    set pending_timezone = null, pending_timezone_from = null
    where user_id = p_uid
    returning * into p;
  else
    update public.profiles
    set pending_timezone = p_tz,
        pending_timezone_from = app_private.day_key(p_now, p.timezone) + 1
    where user_id = p_uid
    returning * into p;
  end if;
  return p;
end;
$$;

-- ───────── 목표 ─────────

create function app_private.create_goal(
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
  if char_length(v_name) not between 1 and 100
     or p_period_days is null or p_period_days not between 7 and 90
     or v_weekdays is null
     or p_start_minutes is null or p_start_minutes not between 0 and 1439
     or p_target_minutes is null or p_target_minutes not between 10 and 30
     or p_situation is null or jsonb_typeof(p_situation) <> 'object'
     or app_private.clean(p_situation ->> 'place') = ''
     or app_private.clean(p_situation ->> 'my_role') = ''
     or app_private.clean(p_situation ->> 'partner') = ''
     or app_private.clean(p_situation ->> 'task') = ''
     or jsonb_typeof(v_subs) <> 'array' then
    perform app_private.err('invalid');
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

-- 일정 변경 예약. 내일(하루 키 + 1)부터 적용한다.
create function app_private.change_schedule(
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

-- ───────── 하루 ─────────

create function app_private.start_day(p_uid uuid, p_goal uuid, p_reason text, p_now timestamptz)
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

-- 그날 행을 잠가 가져온다.
create function app_private.own_day(g public.goals, p_day date)
returns public.days
language plpgsql
set search_path = ''
as $$
declare
  r public.days;
begin
  select * into r from public.days where goal_id = g.id and day = p_day for update;
  if not found then
    perform app_private.err('not_found');
  end if;
  return r;
end;
$$;

-- 학습 진행 저장. 서버 경과 시간과 목표 분을 넘지 않고, 줄어들지 않는다. 단계는 앞으로만 간다.
-- 진행 중이 아닌 날(완료, 판정 끝)은 바꾸지 않고 그대로 돌려준다.
create function app_private.save_progress(
  p_uid uuid,
  p_goal uuid,
  p_day date,
  p_active_seconds int,
  p_phase text,
  p_now timestamptz
)
returns public.days
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
  r public.days;
  v_elapsed int;
begin
  g := app_private.own_goal(p_uid, p_goal, p_now);
  r := app_private.own_day(g, p_day);
  if r.status <> 'progress' then
    return r;
  end if;
  perform app_private.require_active(g, p_now);
  if p_phase is not null and p_phase not in ('A', 'B', 'C') then
    perform app_private.err('invalid');
  end if;

  v_elapsed := greatest(0, floor(extract(epoch from p_now - r.session_started_at))::int);
  update public.days
  set active_seconds = least(r.target_minutes * 60, v_elapsed, greatest(r.active_seconds, coalesce(p_active_seconds, 0))),
      phase = case when app_private.phase_rank(p_phase) > app_private.phase_rank(r.phase) then p_phase else r.phase end
  where goal_id = g.id and day = p_day
  returning * into r;
  return r;
end;
$$;

-- 회고 시작. 학습 분을 채워야 한다. retro_started_at은 한 번만 정한다.
create function app_private.start_retro(p_uid uuid, p_goal uuid, p_day date, p_now timestamptz)
returns public.days
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
  r public.days;
begin
  g := app_private.own_goal(p_uid, p_goal, p_now);
  r := app_private.own_day(g, p_day);
  if r.status <> 'progress' then
    return r;
  end if;
  perform app_private.require_active(g, p_now);
  if r.active_seconds < r.target_minutes * 60 then
    perform app_private.err('not_enough_time');
  end if;

  update public.days
  set retro_started_at = coalesce(retro_started_at, p_now),
      phase = 'retro'
  where goal_id = g.id and day = p_day
  returning * into r;
  return r;
end;
$$;

-- 회고 진행 저장. 180초와 서버 경과 시간을 넘지 않는다.
create function app_private.save_retro_progress(p_uid uuid, p_goal uuid, p_day date, p_seconds int, p_now timestamptz)
returns public.days
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
  r public.days;
  v_elapsed int;
begin
  g := app_private.own_goal(p_uid, p_goal, p_now);
  r := app_private.own_day(g, p_day);
  if r.status <> 'progress' then
    return r;
  end if;
  perform app_private.require_active(g, p_now);
  if r.retro_started_at is null then
    perform app_private.err('invalid');
  end if;

  v_elapsed := greatest(0, floor(extract(epoch from p_now - r.retro_started_at))::int);
  update public.days
  set retro_seconds = least(180, v_elapsed, greatest(r.retro_seconds, coalesce(p_seconds, 0)))
  where goal_id = g.id and day = p_day
  returning * into r;
  return r;
end;
$$;

-- 하루 완료. 학습 분과 회고 3분을 서버 시각으로 확인한다.
-- 쿠폰 진행 +1, 기준(주 수 × 주당 학습 요일 수)에 닿으면 쿠폰 +1, 주 수 +1, 진행 0.
-- 이미 done이면 같은 결과를 돌려준다(두 번 세지 않음).
create function app_private.complete_day(p_uid uuid, p_goal uuid, p_day date, p_now timestamptz)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
  r public.days;
  v_progress int;
  v_earned boolean := false;
begin
  g := app_private.own_goal(p_uid, p_goal, p_now);
  r := app_private.own_day(g, p_day);

  if r.status = 'done' then
    return jsonb_build_object('day', to_jsonb(r), 'coupon_earned', r.coupon_earned, 'coupons', g.coupons);
  elsif r.status = 'coupon' then
    perform app_private.err('already_done');
  elsif r.status <> 'progress' then
    perform app_private.err('invalid');
  end if;
  perform app_private.require_active(g, p_now);

  if r.active_seconds < r.target_minutes * 60
     or p_now - r.session_started_at < make_interval(mins => r.target_minutes)
     or r.retro_started_at is null
     or r.retro_seconds < 180
     or p_now - r.retro_started_at < interval '180 seconds' then
    perform app_private.err('not_enough_time');
  end if;

  v_progress := g.coupon_progress_days + 1;
  if v_progress >= g.coupon_streak_goal_weeks * cardinality(g.weekdays) then
    v_earned := true;
    update public.goals
    set coupons = coupons + 1,
        coupon_streak_goal_weeks = coupon_streak_goal_weeks + 1,
        coupon_progress_days = 0
    where id = g.id
    returning * into g;
  else
    update public.goals
    set coupon_progress_days = v_progress
    where id = g.id
    returning * into g;
  end if;

  update public.days
  set status = 'done', completed_at = p_now, coupon_earned = v_earned
  where goal_id = g.id and day = p_day
  returning * into r;

  return jsonb_build_object('day', to_jsonb(r), 'coupon_earned', v_earned, 'coupons', g.coupons);
end;
$$;

-- 쿠폰 사용(오늘). 실패로 세지 않지만 쿠폰 진행은 0이 된다.
create function app_private.use_coupon(p_uid uuid, p_goal uuid, p_now timestamptz)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
  r public.days;
  v_set record;
  v_today date;
begin
  g := app_private.own_goal(p_uid, p_goal, p_now);
  perform app_private.require_active(g, p_now);
  v_today := app_private.day_key(p_now, app_private.tz_of(p_uid));
  if v_today < g.first_day then
    perform app_private.err('before_first_day');
  end if;
  select * into v_set from app_private.settings_for(g, v_today);
  if not app_private.is_study_day(v_today, v_set.weekdays) then
    perform app_private.err('not_study_day');
  end if;

  select * into r from public.days where goal_id = g.id and day = v_today for update;
  if found then
    if r.status = 'coupon' then
      return jsonb_build_object('coupons', g.coupons);
    elsif r.status = 'done' then
      perform app_private.err('already_done');
    end if;
  end if;
  if g.coupons <= 0 then
    perform app_private.err('no_coupon');
  end if;

  insert into public.days (goal_id, day, user_id, status, target_minutes)
  values (g.id, v_today, p_uid, 'coupon', v_set.target_minutes)
  on conflict (goal_id, day) do update set status = 'coupon';

  update public.goals
  set coupons = coupons - 1, coupon_progress_days = 0
  where id = g.id
  returning * into g;

  return jsonb_build_object('coupons', g.coupons);
end;
$$;

-- ───────── 포기와 달성 ─────────

create function app_private.request_giveup(p_uid uuid, p_goal uuid, p_now timestamptz)
returns public.goals
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
begin
  g := app_private.own_goal(p_uid, p_goal, p_now);
  if g.status <> 'active' then
    perform app_private.err('not_active');
  end if;
  if g.giveup_requested_at is not null then
    return g;
  end if;
  update public.goals set giveup_requested_at = p_now where id = g.id returning * into g;
  return g;
end;
$$;

-- 포기 철회. own_goal의 판정이 대기 중 지난 날을 giveup_wait로 먼저 남긴다.
-- 신청이 없으면 그대로 돌려준다. 24시간이 지났으면 철회할 수 없다(not_active).
create function app_private.withdraw_giveup(p_uid uuid, p_goal uuid, p_now timestamptz)
returns public.goals
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
begin
  g := app_private.own_goal(p_uid, p_goal, p_now);
  if g.status <> 'active' then
    perform app_private.err('not_active');
  end if;
  if g.giveup_requested_at is null then
    return g;
  end if;
  perform app_private.require_active(g, p_now);
  update public.goals set giveup_requested_at = null where id = g.id returning * into g;
  return g;
end;
$$;

-- 달성 선언. 하루 키 >= first_day + period_days 일 때만.
create function app_private.declare_achievement(p_uid uuid, p_goal uuid, p_now timestamptz)
returns public.goals
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
begin
  g := app_private.own_goal(p_uid, p_goal, p_now);
  if g.status = 'achieved' then
    return g;
  end if;
  perform app_private.require_active(g, p_now);
  if app_private.day_key(p_now, app_private.tz_of(p_uid)) < g.first_day + g.period_days then
    perform app_private.err('not_yet');
  end if;
  update public.goals set status = 'achieved', ended_at = p_now where id = g.id returning * into g;
  return g;
end;
$$;

-- ───────── 신고 ─────────

-- AI가 만든 메시지(상대, 코치, 시스템)나 반성문 코치 답을 신고한다. 자기 행만. 같은 건은 한 번만 남는다.
-- p_message_id는 messages.id 또는 reflections.id다. 정지 중에도 신고할 수 있다.
create function app_private.report_message(p_uid uuid, p_message_id uuid, p_reason text)
returns public.message_reports
language plpgsql
set search_path = ''
as $$
declare
  r public.message_reports;
  v_reason text := nullif(app_private.clean(p_reason), '');
begin
  if p_uid is null or p_message_id is null or char_length(coalesce(v_reason, '')) > 500 then
    perform app_private.err('invalid');
  end if;

  select * into r from public.message_reports
  where user_id = p_uid and (message_id = p_message_id or reflection_id = p_message_id);
  if found then
    return r;
  end if;

  if exists (select 1 from public.messages m
             where m.id = p_message_id and m.user_id = p_uid and m.role in ('partner', 'coach', 'system')) then
    insert into public.message_reports (user_id, message_id, reason)
    values (p_uid, p_message_id, v_reason)
    returning * into r;
  elsif exists (select 1 from public.reflections f
                where f.id = p_message_id and f.user_id = p_uid and f.role = 'coach') then
    insert into public.message_reports (user_id, reflection_id, reason)
    values (p_uid, p_message_id, v_reason)
    returning * into r;
  else
    perform app_private.err('not_found');
  end if;
  return r;
end;
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;

-- ───────── 공개 RPC (auth.uid(), now()만 넘긴다) ─────────

create function public.server_now()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select now();
$$;

-- 심사용 데모 계정만 비밀번호 로그인. 나머지는 이메일 OTP.
create function public.login_method(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from app_private.config c
      where c.key = 'review_email'
        and lower(btrim(c.value)) = lower(btrim(coalesce(p_email, '')))
        and btrim(c.value) <> ''
    ) then 'password'
    else 'otp'
  end;
$$;

create function public.set_timezone(p_tz text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.set_timezone(auth.uid(), p_tz, now());
end;
$$;

create function public.create_goal(
  p_name text,
  p_reason text,
  p_period_days int,
  p_weekdays int[],
  p_start_minutes int,
  p_target_minutes int,
  p_situation jsonb,
  p_subsituations jsonb
)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.create_goal(
    auth.uid(), p_name, p_reason, p_period_days, p_weekdays, p_start_minutes, p_target_minutes,
    p_situation, p_subsituations, now()
  );
end;
$$;

create function public.settle_me()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform app_private.err('invalid');
  end if;
  perform app_private.settle_user(auth.uid(), now());
end;
$$;

create function public.start_day(p_goal uuid, p_reason text)
returns public.days
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.start_day(auth.uid(), p_goal, p_reason, now());
end;
$$;

create function public.save_progress(p_goal uuid, p_day date, p_active_seconds int, p_phase text)
returns public.days
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.save_progress(auth.uid(), p_goal, p_day, p_active_seconds, p_phase, now());
end;
$$;

create function public.start_retro(p_goal uuid, p_day date)
returns public.days
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.start_retro(auth.uid(), p_goal, p_day, now());
end;
$$;

create function public.save_retro_progress(p_goal uuid, p_day date, p_seconds int)
returns public.days
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.save_retro_progress(auth.uid(), p_goal, p_day, p_seconds, now());
end;
$$;

create function public.complete_day(p_goal uuid, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.complete_day(auth.uid(), p_goal, p_day, now());
end;
$$;

create function public.use_coupon(p_goal uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.use_coupon(auth.uid(), p_goal, now());
end;
$$;

create function public.request_giveup(p_goal uuid)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.request_giveup(auth.uid(), p_goal, now());
end;
$$;

create function public.withdraw_giveup(p_goal uuid)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.withdraw_giveup(auth.uid(), p_goal, now());
end;
$$;

create function public.declare_achievement(p_goal uuid)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.declare_achievement(auth.uid(), p_goal, now());
end;
$$;

create function public.change_schedule(p_goal uuid, p_start_minutes int, p_target_minutes int, p_weekdays int[])
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.change_schedule(auth.uid(), p_goal, p_start_minutes, p_target_minutes, p_weekdays, now());
end;
$$;

create function public.report_message(p_message_id uuid, p_reason text)
returns public.message_reports
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.report_message(auth.uid(), p_message_id, p_reason);
end;
$$;

-- 탈퇴용. Edge Function(service role)만 실행한다. app_private는 API에 노출되지 않아 공개 래퍼를 둔다.
create function public.delete_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.delete_user_data(p_user_id);
end;
$$;

-- 실행 권한: 기본(public, anon)을 걷고 필요한 역할에만 준다.
revoke execute on function
  public.server_now(),
  public.login_method(text),
  public.set_timezone(text),
  public.create_goal(text, text, int, int[], int, int, jsonb, jsonb),
  public.settle_me(),
  public.start_day(uuid, text),
  public.save_progress(uuid, date, int, text),
  public.start_retro(uuid, date),
  public.save_retro_progress(uuid, date, int),
  public.complete_day(uuid, date),
  public.use_coupon(uuid),
  public.request_giveup(uuid),
  public.withdraw_giveup(uuid),
  public.declare_achievement(uuid),
  public.change_schedule(uuid, int, int, int[]),
  public.report_message(uuid, text),
  public.delete_user_data(uuid)
from public, anon, authenticated;

grant execute on function
  public.server_now(),
  public.login_method(text)
to anon, authenticated;

grant execute on function
  public.set_timezone(text),
  public.create_goal(text, text, int, int[], int, int, jsonb, jsonb),
  public.settle_me(),
  public.start_day(uuid, text),
  public.save_progress(uuid, date, int, text),
  public.start_retro(uuid, date),
  public.save_retro_progress(uuid, date, int),
  public.complete_day(uuid, date),
  public.use_coupon(uuid),
  public.request_giveup(uuid),
  public.withdraw_giveup(uuid),
  public.declare_achievement(uuid),
  public.change_schedule(uuid, int, int, int[]),
  public.report_message(uuid, text)
to authenticated;

grant execute on function public.delete_user_data(uuid) to service_role;
