-- 하루 사이클: start_day 검사, 진행 저장 상한, 완료 판정, 쿠폰, 쉬는 요일, 멱등
-- 시각은 내부 함수(app_private.*)에 p_now로 넘긴다. 기준: 2026-03-02(월) 22:00 KST에 목표 생성.
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

create function pg_temp.kst(p text) returns timestamptz language sql as $$
  select p::timestamp at time zone 'Asia/Seoul'
$$;

create function pg_temp.new_user(p_id uuid, p_email text) returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          '{"age_confirmed": true, "ai_consent": true, "timezone": "Asia/Seoul"}', now(), now())
  returning id
$$;

create function pg_temp.mk_goal(p_uid uuid, p_now timestamptz, p_weekdays int[], p_start int default 1320, p_target int default 10)
returns uuid language sql as $$
  select (app_private.create_goal(
    p_uid, '카페 주문', '출장 가서 카페에서 혼자 주문하고 싶어서 시작합니다', 14, p_weekdays, p_start, p_target,
    '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}', '["인사","주문"]', p_now)).id
$$;

-- 학습 분 + 회고 3분을 다 채우고 완료까지 한 번에
create function pg_temp.do_day(p_uid uuid, p_goal uuid, p_at timestamptz) returns jsonb language plpgsql as $$
declare
  r public.days;
  t int;
  v_end timestamptz;
begin
  r := app_private.start_day(p_uid, p_goal, '오늘도 카페 주문 연습을 꼭 끝내겠습니다 ' || p_at::text, p_at);
  t := r.target_minutes;
  perform app_private.save_progress(p_uid, p_goal, r.day, t * 60, 'C', p_at + make_interval(mins => t, secs => 1));
  perform app_private.start_retro(p_uid, p_goal, r.day, p_at + make_interval(mins => t, secs => 1));
  v_end := p_at + make_interval(mins => t + 3, secs => 2);
  perform app_private.save_retro_progress(p_uid, p_goal, r.day, 180, v_end);
  return app_private.complete_day(p_uid, p_goal, r.day, v_end);
end;
$$;

create temp table t (k text primary key, v jsonb);

select pg_temp.new_user('00000000-0000-4000-8000-0000000000d1', 'day1@test.local');
-- 평일만(월~금), 22:00 시작, 10분
select pg_temp.mk_goal('00000000-0000-4000-8000-0000000000d1', pg_temp.kst('2026-03-02 22:00'), '{1,2,3,4,5}');

create function pg_temp.g() returns uuid language sql as $$
  select id from public.goals where user_id = '00000000-0000-4000-8000-0000000000d1' and status = 'active'
$$;
create function pg_temp.d(p_day date) returns public.days language sql as $$
  select * from public.days where goal_id = pg_temp.g() and day = p_day
$$;

select is((select first_day from public.goals where id = pg_temp.g()), '2026-03-03'::date, 'first_day = 생성일 하루 키 + 1');

-- start_day 거부
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '첫날 전에 시작해 보려고 이유를 적어 봅니다', pg_temp.kst('2026-03-02 22:30'))$$,
  'P0001', 'before_first_day', 'first_day 전에는 시작 불가');
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '너무 일찍 시작해 보려고 이유를 적어 봅니다', pg_temp.kst('2026-03-03 21:29'))$$,
  'P0001', 'too_early', '시작 30분 전보다 이르면 too_early');
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '   짧은 이유   ', pg_temp.kst('2026-03-03 21:40'))$$,
  'P0001', 'reason_short', '오늘의 이유 20자 미만(앞뒤 공백 제외)');
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '토요일에 시작해 보려고 이유를 길게 적어 봅니다', pg_temp.kst('2026-03-07 22:00'))$$,
  'P0001', 'not_study_day', '학습 요일이 아니면 not_study_day');

-- 시작과 멱등
insert into t select 's1', to_jsonb(app_private.start_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '오늘은 메뉴 묻는 표현을 꼭 익히고 싶습니다', pg_temp.kst('2026-03-03 21:40')));
insert into t select 's2', to_jsonb(app_private.start_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '다른 이유로 다시 눌러도 같은 행이 나와야 합니다', pg_temp.kst('2026-03-03 21:41')));
select is((select v from t where k = 's2'), (select v from t where k = 's1'), 'start_day 두 번 = 한 번과 같은 행');
select is((pg_temp.d('2026-03-03')).session_started_at, pg_temp.kst('2026-03-03 21:40'), 'session_started_at은 첫 호출 서버 시각');
select is((pg_temp.d('2026-03-03')).status, 'progress', '시작하면 progress');

-- 진행 저장: 서버 경과 시간과 목표 분을 넘지 않고 줄지 않는다
select is((app_private.save_progress('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', 9999, 'B', pg_temp.kst('2026-03-03 21:45'))).active_seconds,
  300, '클라이언트가 9999초를 보내도 서버 경과 300초까지만');
select is((app_private.save_progress('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', 100, 'A', pg_temp.kst('2026-03-03 21:46'))).active_seconds,
  300, '작은 값을 보내도 줄지 않는다');
select is((pg_temp.d('2026-03-03')).phase, 'B', '단계는 앞으로만 간다');

-- 학습 분 미달
select throws_ok($$select app_private.start_retro('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', pg_temp.kst('2026-03-03 21:46'))$$,
  'P0001', 'not_enough_time', '학습 분 미달이면 회고 시작 불가');
select throws_ok($$select app_private.complete_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', pg_temp.kst('2026-03-03 21:46'))$$,
  'P0001', 'not_enough_time', '학습 분 미달이면 완료 거부');

select is((app_private.save_progress('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', 600, 'C', pg_temp.kst('2026-03-03 21:51'))).active_seconds,
  600, '목표 분(600초)까지 채움');
select throws_ok($$select app_private.complete_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', pg_temp.kst('2026-03-03 21:51'))$$,
  'P0001', 'not_enough_time', '회고를 안 하면 완료 거부');

-- 회고
insert into t select 'r1', to_jsonb(app_private.start_retro('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', pg_temp.kst('2026-03-03 21:51')));
select is((app_private.start_retro('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', pg_temp.kst('2026-03-03 21:52'))).retro_started_at,
  pg_temp.kst('2026-03-03 21:51'), 'retro_started_at은 한 번만 정한다');
select is((app_private.save_retro_progress('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', 180, pg_temp.kst('2026-03-03 21:52'))).retro_seconds,
  60, '회고 초도 서버 경과 시간까지만');
select throws_ok($$select app_private.complete_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', pg_temp.kst('2026-03-03 21:52'))$$,
  'P0001', 'not_enough_time', '회고 3분 미달이면 완료 거부');
-- 클라이언트가 180초를 보냈어도 서버 시각으로 3분이 안 지났으면 거부
select is((app_private.save_retro_progress('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', 180, pg_temp.kst('2026-03-03 21:54:30'))).retro_seconds,
  180, '회고 180초 상한');
select throws_ok($$select app_private.complete_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', pg_temp.kst('2026-03-03 21:53'))$$,
  'P0001', 'not_enough_time', '회고 시작 뒤 서버 시각으로 180초가 안 지나면 거부');

-- 완료와 멱등
insert into t select 'c1', app_private.complete_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', pg_temp.kst('2026-03-03 21:55'));
insert into t select 'c2', app_private.complete_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-03', pg_temp.kst('2026-03-03 21:56'));
select is((select v from t where k = 'c2'), (select v from t where k = 'c1'), 'complete_day 두 번 = 한 번과 같은 결과');
select is((select v ->> 'coupon_earned' from t where k = 'c1'), 'false', '첫 완료는 쿠폰 없음');
select is((select (v ->> 'coupons')::int from t where k = 'c1'), 3, '쿠폰 3장 그대로');
select is((select v -> 'day' ->> 'status' from t where k = 'c1'), 'done', '하루 상태 done');
select is((select coupon_progress_days from public.goals where id = pg_temp.g()), 1, '쿠폰 진행은 한 번만 센다');
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '완료한 날 다시 시작해 보려고 이유를 적습니다', pg_temp.kst('2026-03-03 22:10'))$$,
  'P0001', 'already_done', '완료한 날은 다시 시작 불가');
select throws_ok($$select app_private.use_coupon('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), pg_temp.kst('2026-03-03 22:10'))$$,
  'P0001', 'already_done', '완료한 날은 쿠폰 불가');

-- 쿠폰(3/4 수)
insert into t select 'u1', app_private.use_coupon('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), pg_temp.kst('2026-03-04 10:00'));
insert into t select 'u2', app_private.use_coupon('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), pg_temp.kst('2026-03-04 10:01'));
select is((select v from t where k = 'u2'), (select v from t where k = 'u1'), 'use_coupon 두 번 = 한 번과 같은 결과');
select is((select coupons from public.goals where id = pg_temp.g()), 2, '쿠폰은 한 장만 빠진다');
select is((select coupon_progress_days from public.goals where id = pg_temp.g()), 0, '쿠폰을 쓰면 쿠폰 진행 0');
select is((pg_temp.d('2026-03-04')).status, 'coupon', '그날 상태 coupon');
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '쿠폰 쓴 날 다시 시작해 보려고 이유를 적습니다', pg_temp.kst('2026-03-04 22:00'))$$,
  'P0001', 'already_done', '쿠폰 쓴 날은 시작 불가');
select throws_ok($$select app_private.use_coupon('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), pg_temp.kst('2026-03-07 10:00'))$$,
  'P0001', 'not_study_day', '쉬는 요일에는 쿠폰 불가');

-- 판정: 3/5(목) 3/6(금) 미학습 → failed, 3/7(토) 3/8(일) → rest
select app_private.settle_all(pg_temp.kst('2026-03-09 04:30'));
select is((pg_temp.d('2026-03-05')).status, 'failed', '학습 요일 미완료는 failed');
select is((pg_temp.d('2026-03-07')).status, 'rest', '쉬는 요일(토)은 rest');
select is((pg_temp.d('2026-03-08')).status, 'rest', '쉬는 요일(일)은 rest');
select is((select settled_day from public.goals where id = pg_temp.g()), '2026-03-08'::date, 'settled_day = 오늘 - 1');
select is((select count(*) from public.days where goal_id = pg_temp.g() and day = '2026-03-09'), 0::bigint, '오늘은 판정하지 않는다');

-- 판정은 다시 돌려도 같다
select app_private.settle_all(pg_temp.kst('2026-03-09 05:30'));
select is((select count(*) from public.days where goal_id = pg_temp.g()), 6::bigint, '판정 반복해도 행이 늘지 않는다');

-- reason_same: 직전 오늘의 이유와 같으면 거부
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '  오늘은 메뉴 묻는 표현을 꼭 익히고 싶습니다 ', pg_temp.kst('2026-03-09 22:00'))$$,
  'P0001', 'reason_same', '직전 이유와 같으면 reason_same');

-- 지난날 진행 중이던 기록은 판정 뒤 완료 불가
select app_private.start_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '월요일에는 결제 표현을 연습하고 싶습니다', pg_temp.kst('2026-03-09 22:00'));
select throws_ok($$select app_private.complete_day('00000000-0000-4000-8000-0000000000d1', pg_temp.g(), '2026-03-09', pg_temp.kst('2026-03-10 04:30'))$$,
  'P0001', 'invalid', '하루가 지나면(04:00) 지난날 완료 불가');
select app_private.settle_all(pg_temp.kst('2026-03-10 04:30'));
select is((pg_temp.d('2026-03-09')).status, 'failed', '지난날 progress는 판정 때 failed');

-- 쿠폰 획득: 기준 = 2주 × 주 5일 = 10 연속 완료. 쉬는 요일은 진행을 끊지 않는다.
select pg_temp.new_user('00000000-0000-4000-8000-0000000000d2', 'day2@test.local');
select pg_temp.mk_goal('00000000-0000-4000-8000-0000000000d2', pg_temp.kst('2026-03-02 22:00'), '{1,2,3,4,5}');
create function pg_temp.g2() returns uuid language sql as $$
  select id from public.goals where user_id = '00000000-0000-4000-8000-0000000000d2' and status = 'active'
$$;
select pg_temp.do_day('00000000-0000-4000-8000-0000000000d2', pg_temp.g2(), pg_temp.kst(d::text || ' 22:00'))
from unnest(array['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-09']::date[]) d;
select is((select coupon_progress_days from public.goals where id = pg_temp.g2()), 5, '주말(rest)을 지나도 쿠폰 진행 유지');
select is((select array_agg(status order by day) from public.days where goal_id = pg_temp.g2() and day in ('2026-03-07', '2026-03-08')),
  array['rest', 'rest'], '주말은 rest로 판정');
select pg_temp.do_day('00000000-0000-4000-8000-0000000000d2', pg_temp.g2(), pg_temp.kst(d::text || ' 22:00'))
from unnest(array['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13']::date[]) d;
select is((select coupon_progress_days from public.goals where id = pg_temp.g2()), 9, '9일 연속');
insert into t select 'e10', pg_temp.do_day('00000000-0000-4000-8000-0000000000d2', pg_temp.g2(), pg_temp.kst('2026-03-16 22:00'));
select is((select v ->> 'coupon_earned' from t where k = 'e10'), 'true', '10번째 연속 완료에 쿠폰 획득');
select is((select (v ->> 'coupons')::int from t where k = 'e10'), 4, '쿠폰 4장');
select is((select array[coupon_streak_goal_weeks, coupon_progress_days] from public.goals where id = pg_temp.g2()), array[3, 0], '다음 기준 3주, 진행 0');
select is((select coupon_earned from public.days where goal_id = pg_temp.g2() and day = '2026-03-16'), true, '그날 행에 coupon_earned');

-- 실패하면 쿠폰 진행 0
select pg_temp.do_day('00000000-0000-4000-8000-0000000000d2', pg_temp.g2(), pg_temp.kst('2026-03-17 22:00'));
select app_private.settle_all(pg_temp.kst('2026-03-19 05:00'));
select is((select status from public.days where goal_id = pg_temp.g2() and day = '2026-03-18'), 'failed', '3/18 미학습은 failed');
select is((select coupon_progress_days from public.goals where id = pg_temp.g2()), 0, '실패하면 쿠폰 진행 0');

-- 쿠폰 0장이면 no_coupon
update public.goals set coupons = 0 where id = pg_temp.g2();
select throws_ok($$select app_private.use_coupon('00000000-0000-4000-8000-0000000000d2', pg_temp.g2(), pg_temp.kst('2026-03-19 10:00'))$$,
  'P0001', 'no_coupon', '쿠폰이 없으면 no_coupon');

-- 04:00 이전 시작 시각(00:30)은 달력상 다음 날이다
select pg_temp.new_user('00000000-0000-4000-8000-0000000000d3', 'day3@test.local');
select pg_temp.mk_goal('00000000-0000-4000-8000-0000000000d3', pg_temp.kst('2026-03-02 22:00'), '{0,1,2,3,4,5,6}', 30);
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-0000000000d3', (select id from public.goals where user_id = '00000000-0000-4000-8000-0000000000d3'), '자정 넘어 하는 학습의 이유를 길게 적습니다', pg_temp.kst('2026-03-03 23:59'))$$,
  'P0001', 'too_early', '00:30 시작이면 3/3 하루의 사전 시각은 3/4 00:00');
select is((app_private.start_day('00000000-0000-4000-8000-0000000000d3', (select id from public.goals where user_id = '00000000-0000-4000-8000-0000000000d3'), '자정 넘어 하는 학습의 이유를 길게 적습니다', pg_temp.kst('2026-03-04 00:05'))).day,
  '2026-03-03'::date, '3/4 00:05 시작은 3/3 하루로 센다');

select * from finish();
rollback;
