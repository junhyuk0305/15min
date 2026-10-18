-- 내부 함수(app_private): 시간 계산, 판정(settle), 포기 확정, 정지 해제, 가입 트리거, 탈퇴 데이터 삭제
-- 시각은 모두 p_now 인자로 받는다. 공개 RPC와 cron은 now()를 넘기고, 테스트는 원하는 시각을 넘긴다.

-- 실패 코드. 앱은 message를 code로 읽는다.
create function app_private.err(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code;
end;
$$;

-- 앞뒤 공백 제거
create function app_private.clean(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g');
$$;

-- 하루 키: 현지 시각에서 4시간을 뺀 날짜
create function app_private.day_key(p_now timestamptz, p_tz text)
returns date
language sql
stable
set search_path = ''
as $$
  select ((p_now at time zone p_tz) - interval '4 hours')::date;
$$;

-- 하루 d의 시작(현지 d일 04:00)
create function app_private.day_start(p_day date, p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_day::timestamp + interval '4 hours') at time zone p_tz;
$$;

-- 하루 d의 p_minutes 시각. 04:00 이전(0~239)은 달력상 다음 날이다.
create function app_private.local_at(p_day date, p_minutes int, p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_day + case when p_minutes < 240 then 1 else 0 end)::timestamp
          + make_interval(mins => p_minutes)) at time zone p_tz;
$$;

-- 요일: 0=일 ~ 6=토 (JS getDay와 같음)
create function app_private.is_study_day(p_day date, p_weekdays int[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extract(dow from p_day)::int = any (p_weekdays);
$$;

-- 요일 배열 정리: 중복 제거, 정렬. 0~6 밖 값이 있거나 5개 미만이면 null
create function app_private.norm_weekdays(p_weekdays int[])
returns int[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_weekdays is null then null
    when exists (select 1 from unnest(p_weekdays) w where w is null or w < 0 or w > 6) then null
    when (select count(distinct w) from unnest(p_weekdays) w) < 5 then null
    else (select array_agg(distinct w order by w) from unnest(p_weekdays) w)
  end;
$$;

create function app_private.valid_tz(p_tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz);
$$;

-- 그날 적용되는 설정. pending_change.from_day 이후 날짜는 예약된 값을 쓴다.
create function app_private.settings_for(
  g public.goals,
  p_day date,
  out start_minutes int,
  out target_minutes int,
  out weekdays int[]
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if g.pending_change is not null and p_day >= (g.pending_change ->> 'from_day')::date then
    start_minutes := (g.pending_change ->> 'start_minutes')::int;
    target_minutes := (g.pending_change ->> 'target_minutes')::int;
    weekdays := array(select jsonb_array_elements_text(g.pending_change -> 'weekdays')::int);
  else
    start_minutes := g.start_minutes;
    target_minutes := g.target_minutes;
    weekdays := g.weekdays;
  end if;
end;
$$;

-- 시간대 예약 적용: 옛 시간대 기준 하루 키가 pending_timezone_from 이상이면 바꾼다.
create function app_private.apply_timezone(p_uid uuid, p_now timestamptz)
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
    and app_private.day_key(p_now, timezone) >= pending_timezone_from;
$$;

-- 판정 한 칸 쓰기(행이 있으면 상태만 바꾼다)
create function app_private.put_day(p_goal public.goals, p_day date, p_status text, p_target int)
returns void
language sql
set search_path = ''
as $$
  insert into public.days (goal_id, day, user_id, status, target_minutes)
  values (p_goal.id, p_day, p_goal.user_id, p_status, p_target)
  on conflict (goal_id, day) do update set status = excluded.status;
$$;

-- 목표 하나를 오늘 전날까지 판정한다.
-- 순서: first_day 이전 건너뜀 → done/coupon 그대로 → 포기 대기와 겹친 날 giveup_wait
--       → 학습 요일 아님 rest → 나머지 failed(쿠폰 진행 0)
-- 끝나면 settled_day를 옮기고, 날이 된 일정 변경 예약을 적용한다.
create function app_private.settle_goal(p_goal uuid, p_now timestamptz default now())
returns void
language plpgsql
set search_path = ''
as $$
declare
  g public.goals;
  v_tz text;
  v_today date;
  v_day date;
  v_set record;
  v_status text;
  v_progress int;
begin
  select * into g from public.goals where id = p_goal for update;
  if not found or g.status <> 'active' then
    return;
  end if;

  select coalesce(p.timezone, 'Asia/Seoul') into v_tz from public.profiles p where p.user_id = g.user_id;
  v_tz := coalesce(v_tz, 'Asia/Seoul');
  v_today := app_private.day_key(p_now, v_tz);
  v_progress := g.coupon_progress_days;

  v_day := g.settled_day + 1;
  while v_day < v_today loop
    if v_day >= g.first_day then
      select * into v_set from app_private.settings_for(g, v_day);
      select d.status into v_status from public.days d where d.goal_id = g.id and d.day = v_day;

      if v_status in ('done', 'coupon') then
        null; -- 완료와 쿠폰은 그대로
      elsif g.giveup_requested_at is not null
            and app_private.day_start(v_day + 1, v_tz) > g.giveup_requested_at then
        perform app_private.put_day(g, v_day, 'giveup_wait', v_set.target_minutes);
      elsif not app_private.is_study_day(v_day, v_set.weekdays) then
        perform app_private.put_day(g, v_day, 'rest', v_set.target_minutes);
      else
        perform app_private.put_day(g, v_day, 'failed', v_set.target_minutes);
        v_progress := 0;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;

  update public.goals
  set settled_day = greatest(settled_day, v_today - 1),
      coupon_progress_days = v_progress,
      start_minutes = case when pending_change is not null and (pending_change ->> 'from_day')::date <= v_today
                           then (pending_change ->> 'start_minutes')::int else start_minutes end,
      target_minutes = case when pending_change is not null and (pending_change ->> 'from_day')::date <= v_today
                            then (pending_change ->> 'target_minutes')::int else target_minutes end,
      weekdays = case when pending_change is not null and (pending_change ->> 'from_day')::date <= v_today
                      then array(select jsonb_array_elements_text(pending_change -> 'weekdays')::int) else weekdays end,
      pending_change = case when pending_change is not null and (pending_change ->> 'from_day')::date <= v_today
                            then null else pending_change end
  where id = g.id;
end;
$$;

-- 포기 확정 한 건. 24시간이 지났을 때만. 대기 중 날들은 먼저 giveup_wait로 판정한다.
-- 확정 횟수 1 → 7일 정지, 2 → 14일 정지, 3 이상 → 영구 정지
create function app_private.confirm_goal_giveup(p_goal uuid, p_now timestamptz default now())
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  perform app_private.settle_goal(p_goal, p_now);

  update public.goals
  set status = 'given_up', ended_at = p_now
  where id = p_goal
    and status = 'active'
    and giveup_requested_at is not null
    and giveup_requested_at + interval '24 hours' <= p_now
  returning user_id into v_uid;

  if v_uid is null then
    return false;
  end if;

  update public.profiles p
  set giveup_confirmed_count = p.giveup_confirmed_count + 1,
      banned = p.banned or p.giveup_confirmed_count + 1 >= 3,
      suspended_until = case p.giveup_confirmed_count + 1
                          when 1 then p_now + interval '7 days'
                          when 2 then p_now + interval '14 days'
                          else null
                        end,
      suspended_goal_id = p_goal
  where p.user_id = v_uid;

  return true;
end;
$$;

-- cron: 24시간 지난 포기 신청을 모두 확정
create function app_private.confirm_giveups(p_now timestamptz default now())
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in
    select id from public.goals
    where status = 'active'
      and giveup_requested_at is not null
      and giveup_requested_at + interval '24 hours' <= p_now
    order by giveup_requested_at
  loop
    if app_private.confirm_goal_giveup(v_id, p_now) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- cron: 기간이 끝난 정지 해제. p_uid가 있으면 그 사용자만.
create function app_private.release_suspensions(p_now timestamptz default now(), p_uid uuid default null)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.profiles
  set suspended_until = null, suspended_goal_id = null
  where suspended_until is not null
    and suspended_until < p_now
    and (p_uid is null or user_id = p_uid);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- 한 사용자 정리: 시간대 예약, 포기 확정, 정지 해제, 활성 목표 판정
create function app_private.settle_user(p_uid uuid, p_now timestamptz default now())
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app_private.apply_timezone(p_uid, p_now);
  for v_id in
    select id from public.goals
    where user_id = p_uid and status = 'active'
      and giveup_requested_at is not null
      and giveup_requested_at + interval '24 hours' <= p_now
  loop
    perform app_private.confirm_goal_giveup(v_id, p_now);
  end loop;
  perform app_private.release_suspensions(p_now, p_uid);
  for v_id in select id from public.goals where user_id = p_uid and status = 'active' loop
    perform app_private.settle_goal(v_id, p_now);
  end loop;
end;
$$;

-- cron: 모든 사용자의 시간대 예약 적용과 활성 목표 판정
create function app_private.settle_all(p_now timestamptz default now())
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
    and app_private.day_key(p_now, timezone) >= pending_timezone_from;

  for v_id in select id from public.goals where status = 'active' loop
    perform app_private.settle_goal(v_id, p_now);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- 이메일 해시: sha256(lower(trim(email)))
create function app_private.email_hash(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_email is null then null
              else encode(extensions.digest(lower(btrim(p_email)), 'sha256'), 'hex') end;
$$;

-- 가입 트리거: 만 18세 이상 확인(age_confirmed)과 AI 처리·국외 이전 동의(ai_consent)가 없으면 가입을 막는다. 탈퇴 기록이 있으면 포기 횟수와 정지를 이어 붙인다.
create function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_tz text := v_meta ->> 'timezone';
  v_hash text := app_private.email_hash(new.email);
  v_prev public.deleted_accounts;
begin
  if (v_meta -> 'age_confirmed') is distinct from 'true'::jsonb then
    perform app_private.err('age_not_confirmed');
  end if;
  if (v_meta -> 'ai_consent') is distinct from 'true'::jsonb then
    perform app_private.err('ai_consent_required');
  end if;

  if not app_private.valid_tz(v_tz) then
    v_tz := 'Asia/Seoul';
  end if;

  if v_hash is not null then
    select * into v_prev from public.deleted_accounts where email_hash = v_hash;
  end if;

  insert into public.profiles (
    user_id, email_hash, timezone, giveup_confirmed_count, suspended_until, banned,
    age_confirmed_at, ai_consent_at, terms_version
  ) values (
    new.id,
    v_hash,
    v_tz,
    coalesce(v_prev.giveup_confirmed_count, 0),
    case when v_prev.suspended_until > now() then v_prev.suspended_until end,
    coalesce(v_prev.giveup_confirmed_count, 0) >= 3,
    now(),
    now(),
    v_meta ->> 'terms_version'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- 탈퇴: deleted_accounts에 해시, 포기 횟수, 정지 종료일만 남기고 개인 데이터를 지운다.
-- auth.users 삭제는 Edge Function(delete-account)이 auth.admin.deleteUser로 한다.
create function app_private.delete_user_data(p_uid uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where user_id = p_uid for update;

  if found and p.email_hash is not null then
    insert into public.deleted_accounts (email_hash, giveup_confirmed_count, suspended_until, deleted_at)
    values (p.email_hash, p.giveup_confirmed_count, p.suspended_until, now())
    on conflict (email_hash) do update
      set giveup_confirmed_count = greatest(public.deleted_accounts.giveup_confirmed_count, excluded.giveup_confirmed_count),
          suspended_until = greatest(public.deleted_accounts.suspended_until, excluded.suspended_until),
          deleted_at = excluded.deleted_at;
  end if;

  delete from public.message_reports where user_id = p_uid;
  delete from public.item_events where user_id = p_uid;
  delete from public.items where user_id = p_uid;
  delete from public.messages where user_id = p_uid;
  delete from public.episodes where user_id = p_uid;
  delete from public.days where user_id = p_uid;
  delete from public.reflections where user_id = p_uid;
  delete from public.ai_usage where user_id = p_uid;
  update public.profiles set suspended_goal_id = null where user_id = p_uid;
  delete from public.goals where user_id = p_uid;
  delete from public.profiles where user_id = p_uid;
end;
$$;

-- cron(매일): 보관 기간이 지난 기록 삭제. AI 사용 기록 90일, 탈퇴 기록 1년.
create function app_private.purge_old_data(p_now timestamptz default now())
returns void
language sql
set search_path = ''
as $$
  delete from public.ai_usage where created_at < p_now - interval '90 days';
  delete from public.deleted_accounts where deleted_at < p_now - interval '1 year';
$$;

-- 내부 함수는 클라이언트 역할이 실행할 수 없다.
revoke all on all functions in schema app_private from public, anon, authenticated;
