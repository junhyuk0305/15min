-- 사용자 여정 시나리오 S1~S17의 DB 기대 상태(MP 7.2). 사람의 날짜 순서로 걷는다.
-- 시각은 내부 함수(app_private.*)에 p_now로 넘긴다. 기준 주: 2026-03-02(월) ~ 2026-03-11(수), KST.
-- "연속"은 앱이 days로 센다(rules.streakOf). DB에서는 하루 상태와 coupon_progress_days로 확인한다.
-- 사용자 A: 하루 사이클(S1~S10, S15, S17). 사용자 B: 포기 세 번(S11~S14). 사용자 C, D: 탈퇴 뒤 재가입(S16).
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

create function pg_temp.kst(p text) returns timestamptz language sql as $$
  select p::timestamp at time zone 'Asia/Seoul'
$$;

create function pg_temp.new_user(p_id uuid, p_email text) returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          '{"age_confirmed": true, "ai_consent": true, "timezone": "Asia/Seoul"}', now(), now())
  returning id
$$;

-- 월~금, 22:00 시작, 10분, 기간 7일
create function pg_temp.mk_goal(p_uid uuid, p_now timestamptz) returns uuid language sql as $$
  select (app_private.create_goal(
    p_uid, '카페 주문', '출장 가서 카페에서 혼자 주문하고 싶어서 시작합니다', 7, '{1,2,3,4,5}', 1320, 10,
    '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}', '["인사","주문"]', p_now)).id
$$;

-- 학습 분 + 회고 3분을 다 채우고 완료까지
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

create function pg_temp.p(p_uid uuid) returns public.profiles language sql as $$
  select * from public.profiles where user_id = p_uid
$$;
create function pg_temp.ga() returns public.goals language sql as $$
  select * from public.goals where user_id = '00000000-0000-4000-8000-000000000801' order by created_at desc limit 1
$$;
create function pg_temp.da(p_day date) returns public.days language sql as $$
  select * from public.days where goal_id = (pg_temp.ga()).id and day = p_day
$$;

create temp table t (k text primary key, at timestamptz, n int);

-- ───────── 사용자 A ─────────

-- S1: 일요일 20:00 가입, 목표 설정
select pg_temp.new_user('00000000-0000-4000-8000-000000000801', 's1@scenario.test.local');
select pg_temp.mk_goal('00000000-0000-4000-8000-000000000801', pg_temp.kst('2026-03-01 20:00'));
select is((select count(*) from public.goals where user_id = '00000000-0000-4000-8000-000000000801'), 1::bigint, 'S1 goals 1행');
select is((pg_temp.p('00000000-0000-4000-8000-000000000801')).timezone, 'Asia/Seoul', 'S1 profiles.timezone 저장');
select is((pg_temp.ga()).first_day, '2026-03-02'::date, 'S1 첫 학습일은 다음 날(월)');

-- S2: 월요일 12:00, 사전 알림(21:30) 전. 앱 실행(settle_me) 뒤에도 하루 행이 없다
select app_private.settle_user('00000000-0000-4000-8000-000000000801', pg_temp.kst('2026-03-02 12:00'));
select is((select count(*) from public.days where user_id = '00000000-0000-4000-8000-000000000801'), 0::bigint, 'S2 days 없음');
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id,
    '사전 알림 전에 미리 시작해 보려고 적어 봅니다', pg_temp.kst('2026-03-02 21:29'))$$,
  'P0001', 'too_early', 'S2 시작 30분 전보다 이르면 시작 불가');

-- S3: 월요일 22:00 정각 시작, 끝까지 완료
select is((pg_temp.do_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, pg_temp.kst('2026-03-02 22:00')) -> 'day' ->> 'status'),
  'done', 'S3 완료 응답 done');
select is((pg_temp.da('2026-03-02')).status, 'done', 'S3 days.status done');
select is((pg_temp.ga()).coupon_progress_days, 1, 'S3 연속 1(쿠폰 진행 1)');

-- S4: 화요일 22:00 시작, 22:05에 5분 저장 후 앱 이탈, 22:08 복귀
insert into t (k, at) values ('s4_start',
  (app_private.start_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id,
    '어제보다 한 문장 더 말해 보려고 오늘도 시작합니다', pg_temp.kst('2026-03-03 22:00'))).session_started_at);
select app_private.save_progress('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-03', 300, 'B', pg_temp.kst('2026-03-03 22:05'));
-- 복귀: 화면이 start_day를 다시 부르면 같은 행(같은 시작 시각)을 받는다
select is((app_private.start_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id,
    '복귀해서 다시 부를 때 쓰는 이유 문장입니다', pg_temp.kst('2026-03-03 22:08'))).session_started_at,
  (select at from t where k = 's4_start'), 'S4 복귀해도 같은 학습(session_started_at 유지)');
-- 복귀한 기기가 작은 값을 보내도 줄지 않는다
select is((app_private.save_progress('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-03', 120, 'A', pg_temp.kst('2026-03-03 22:08'))).active_seconds,
  300, 'S4 active_seconds 유지');
select is((pg_temp.da('2026-03-03')).phase, 'B', 'S4 단계는 뒤로 가지 않는다');

-- S6: 22:08~22:12 무입력. 앱 타이머가 멈춰 같은 값을 보내면 서버 경과가 늘어도 증가 없음
select is((app_private.save_progress('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-03', 300, 'B', pg_temp.kst('2026-03-03 22:12'))).active_seconds,
  300, 'S6 2분 무입력 동안 active_seconds 증가 없음');

-- S5: 강제 종료 후 재실행. 메시지는 클라이언트 id로 upsert(ignoreDuplicates)한다. 재전송해도 유실·중복 0
insert into public.messages (id, user_id, goal_id, day, phase, role, text)
select v.id, '00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-03', 'B', v.role, v.text
from (values
  ('00000000-0000-4000-8000-0000000a0001'::uuid, 'partner', 'Hi! What can I get for you?'),
  ('00000000-0000-4000-8000-0000000a0002'::uuid, 'user', 'An iced latte, please.'),
  ('00000000-0000-4000-8000-0000000a0003'::uuid, 'partner', 'What size would you like?')
) v(id, role, text);
-- 재실행 뒤 같은 메시지를 다시 보낸다(함수의 upsert와 같은 동작)
insert into public.messages (id, user_id, goal_id, day, phase, role, text)
select v.id, '00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-03', 'B', v.role, v.text
from (values
  ('00000000-0000-4000-8000-0000000a0002'::uuid, 'user', 'An iced latte, please.'),
  ('00000000-0000-4000-8000-0000000a0004'::uuid, 'user', 'A large one, please.')
) v(id, role, text)
on conflict (id) do nothing;
select is((select count(*) from public.messages where goal_id = (pg_temp.ga()).id and day = '2026-03-03'), 4::bigint, 'S5 메시지 유실 0, 중복 0');
select is((app_private.start_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id,
    '재실행 뒤 다시 부를 때 쓰는 이유 문장입니다', pg_temp.kst('2026-03-03 22:13'))).active_seconds,
  300, 'S5 재실행해도 같은 남은 시간(active_seconds 300)');
-- 그날을 마저 끝낸다
select app_private.save_progress('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-03', 600, 'C', pg_temp.kst('2026-03-03 22:20'));
select app_private.start_retro('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-03', pg_temp.kst('2026-03-03 22:20'));
select app_private.save_retro_progress('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-03', 180, pg_temp.kst('2026-03-03 22:23:01'));
select is((app_private.complete_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-03', pg_temp.kst('2026-03-03 22:23:01')) -> 'day' ->> 'status'),
  'done', 'S4-S6 이탈, 재실행, 무입력이 있던 날도 완료');

-- S17: 수요일까지 3일 연속 완료
select pg_temp.do_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, pg_temp.kst('2026-03-04 22:00'));
select is((select count(*) from public.days where goal_id = (pg_temp.ga()).id and status = 'done'), 3::bigint, 'S17 done 3행');
select is((select array_agg(day order by day) from public.days where goal_id = (pg_temp.ga()).id and status = 'done'),
  array['2026-03-02', '2026-03-03', '2026-03-04']::date[], 'S17 done 3행은 연속한 학습일');
select is((pg_temp.ga()).coupon_progress_days, 3, 'S17 연속 3(쿠폰 진행 3)');

-- 목, 금도 완료(주말 쉬는 요일 앞에 연속 5를 만든다)
select pg_temp.do_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, pg_temp.kst('2026-03-05 22:00'));
select pg_temp.do_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, pg_temp.kst('2026-03-06 22:00'));

-- S10: 토, 일은 쉬는 요일. 시작할 수 없고, 판정은 rest, 연속은 유지
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id,
    '쉬는 요일에도 해 보려고 이유를 적어 봅니다', pg_temp.kst('2026-03-07 22:00'))$$,
  'P0001', 'not_study_day', 'S10 쉬는 요일에는 시작 불가');
select app_private.settle_user('00000000-0000-4000-8000-000000000801', pg_temp.kst('2026-03-09 12:00'));
select is(array[(pg_temp.da('2026-03-07')).status, (pg_temp.da('2026-03-08')).status], array['rest', 'rest'], 'S10 토, 일 rest');
select is((pg_temp.ga()).coupon_progress_days, 5, 'S10 쉬는 요일 뒤에도 연속 유지(쿠폰 진행 5)');

-- S7: 월요일 22:20, 독촉 구간(22:10~23:10). 아직 하루 행이 없다(홈 붉은 상태)
select app_private.settle_user('00000000-0000-4000-8000-000000000801', pg_temp.kst('2026-03-09 22:20'));
select is((pg_temp.da('2026-03-09')).status, null, 'S7 독촉 구간에 아직 시작 안 함(행 없음)');

-- S8: 독촉 중 쿠폰 사용
select is((app_private.use_coupon('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, pg_temp.kst('2026-03-09 22:21')) ->> 'coupons')::int,
  2, 'S8 쿠폰 1장 감소(3 → 2)');
select is((pg_temp.da('2026-03-09')).status, 'coupon', 'S8 days.status coupon');
select is((pg_temp.ga()).coupon_progress_days, 0, 'S8 연속 0(쿠폰 진행 0)');
select is((app_private.use_coupon('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, pg_temp.kst('2026-03-09 22:22')) ->> 'coupons')::int,
  2, 'S8 두 번 눌러도 한 장만 감소');

-- S7: 화요일 22:30, 독촉 구간에 지금 시작하기 → 시작은 된다
select is((app_private.start_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id,
    '독촉 알림을 받고 늦게라도 지금 시작해 봅니다', pg_temp.kst('2026-03-10 22:30'))).status,
  'progress', 'S7 독촉 구간에서 지금 시작하기 가능');
select app_private.save_progress('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-10', 240, 'B', pg_temp.kst('2026-03-10 22:34'));

-- S9: 미완료로 수요일 04:00이 지남 → failed, 연속 0
select app_private.settle_user('00000000-0000-4000-8000-000000000801', pg_temp.kst('2026-03-11 03:59'));
select is((pg_temp.da('2026-03-10')).status, 'progress', 'S9 04:00 전에는 판정하지 않음');
select app_private.settle_all(pg_temp.kst('2026-03-11 04:00'));
select is((pg_temp.da('2026-03-10')).status, 'failed', 'S9 04:00 지나면 failed');
select is((pg_temp.ga()).coupon_progress_days, 0, 'S9 연속 0');
select throws_ok($$select app_private.complete_day('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, '2026-03-10', pg_temp.kst('2026-03-11 04:05'))$$,
  'P0001', 'invalid', 'S9 지난날 미완료는 나중에 완료할 수 없음');

-- S15: 기간(7일) 경과 후 달성 선언. first_day 3-02 + 7 = 3-09부터
select throws_ok($$select app_private.declare_achievement('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, pg_temp.kst('2026-03-09 03:59'))$$,
  'P0001', 'not_yet', 'S15 기간 전에는 달성 선언 불가');
select is((app_private.declare_achievement('00000000-0000-4000-8000-000000000801', (pg_temp.ga()).id, pg_temp.kst('2026-03-11 12:00'))).status,
  'achieved', 'S15 달성 선언 → achieved');
select is((pg_temp.ga()).ended_at, pg_temp.kst('2026-03-11 12:00'), 'S15 ended_at 기록');
-- 새 목표 만들기
select lives_ok($$select pg_temp.mk_goal('00000000-0000-4000-8000-000000000801', pg_temp.kst('2026-03-11 12:10'))$$, 'S15 달성 뒤 새 목표 만들기 가능');

-- ───────── 사용자 B: 포기 ─────────
select pg_temp.new_user('00000000-0000-4000-8000-000000000802', 's11@scenario.test.local');
create function pg_temp.gb() returns uuid language sql as $$
  select id from public.goals where user_id = '00000000-0000-4000-8000-000000000802' and status = 'active'
$$;

-- S11: 포기 신청 후 24시간 안에 철회
select pg_temp.mk_goal('00000000-0000-4000-8000-000000000802', pg_temp.kst('2026-03-01 20:00'));
select app_private.request_giveup('00000000-0000-4000-8000-000000000802', pg_temp.gb(), pg_temp.kst('2026-03-02 09:00'));
select isnt((select giveup_requested_at from public.goals where id = pg_temp.gb()), null, 'S11 대기 상태(giveup_requested_at)');
select is((app_private.withdraw_giveup('00000000-0000-4000-8000-000000000802', pg_temp.gb(), pg_temp.kst('2026-03-02 20:00'))).giveup_requested_at,
  null, 'S11 철회 → 원래 목표');
select app_private.confirm_giveups(pg_temp.kst('2026-03-03 10:00'));
select is((pg_temp.p('00000000-0000-4000-8000-000000000802')).giveup_confirmed_count, 0, 'S11 확정 횟수 그대로(0)');
select is((select status from public.goals where user_id = '00000000-0000-4000-8000-000000000802'), 'active', 'S11 목표 active 유지');

-- S12: 포기 확정 1회 → 7일 정지(반성문 화면)
select app_private.request_giveup('00000000-0000-4000-8000-000000000802', pg_temp.gb(), pg_temp.kst('2026-03-04 09:00'));
select app_private.settle_user('00000000-0000-4000-8000-000000000802', pg_temp.kst('2026-03-05 09:00'));
select is((pg_temp.p('00000000-0000-4000-8000-000000000802')).giveup_confirmed_count, 1, 'S12 확정 횟수 1');
select is((pg_temp.p('00000000-0000-4000-8000-000000000802')).suspended_until, pg_temp.kst('2026-03-05 09:00') + interval '7 days', 'S12 suspended_until = +7일');
select is((pg_temp.p('00000000-0000-4000-8000-000000000802')).banned, false, 'S12 영구 정지 아님');
select throws_ok($$select pg_temp.mk_goal('00000000-0000-4000-8000-000000000802', pg_temp.kst('2026-03-08 12:00'))$$,
  'P0001', 'suspended', 'S12 정지 중에는 새 목표 불가');

-- S13: 정지 해제 → 새 목표 만들기
select app_private.settle_user('00000000-0000-4000-8000-000000000802', pg_temp.kst('2026-03-12 09:01'));
select is((pg_temp.p('00000000-0000-4000-8000-000000000802')).suspended_until, null, 'S13 suspended_until 지나 해제');
select lives_ok($$select pg_temp.mk_goal('00000000-0000-4000-8000-000000000802', pg_temp.kst('2026-03-12 09:02'))$$, 'S13 해제 뒤 새 목표 만들기 가능');

-- 2회째: 14일 정지
select app_private.request_giveup('00000000-0000-4000-8000-000000000802', pg_temp.gb(), pg_temp.kst('2026-03-12 10:00'));
select app_private.confirm_giveups(pg_temp.kst('2026-03-13 10:00'));
select is((pg_temp.p('00000000-0000-4000-8000-000000000802')).suspended_until, pg_temp.kst('2026-03-13 10:00') + interval '14 days', 'S14 전 2회째 확정은 14일 정지');

-- S14: 3회째 확정 → 영구 정지
select app_private.release_suspensions(pg_temp.kst('2026-03-27 10:01'));
select pg_temp.mk_goal('00000000-0000-4000-8000-000000000802', pg_temp.kst('2026-03-27 10:02'));
select app_private.request_giveup('00000000-0000-4000-8000-000000000802', pg_temp.gb(), pg_temp.kst('2026-03-27 11:00'));
select app_private.confirm_giveups(pg_temp.kst('2026-03-28 11:00'));
select is((pg_temp.p('00000000-0000-4000-8000-000000000802')).giveup_confirmed_count, 3, 'S14 확정 횟수 3');
select is((pg_temp.p('00000000-0000-4000-8000-000000000802')).banned, true, 'S14 banned');
select throws_ok($$select pg_temp.mk_goal('00000000-0000-4000-8000-000000000802', pg_temp.kst('2026-06-01 12:00'))$$,
  'P0001', 'banned', 'S14 영구 정지면 새 목표 불가');

-- ───────── 사용자 C, D: 계정 삭제 후 같은 이메일로 재가입(S16) ─────────
-- 가입 트리거는 실제 now()로 정지가 남았는지 본다. 그래서 이 구간은 now() 기준 시각을 쓴다.
insert into t (k, at) values ('now', now());

-- C: 포기 확정 1회(7일 정지) 중에 탈퇴 → 재가입
select pg_temp.new_user('00000000-0000-4000-8000-000000000803', 's16@scenario.test.local');
select pg_temp.mk_goal('00000000-0000-4000-8000-000000000803', now() - interval '3 days');
select app_private.request_giveup('00000000-0000-4000-8000-000000000803',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000803'), now() - interval '2 days');
select app_private.confirm_giveups(now() - interval '1 day');
select app_private.delete_user_data('00000000-0000-4000-8000-000000000803', now());
delete from auth.users where id = '00000000-0000-4000-8000-000000000803';
select is((select array[giveup_confirmed_count::text, suspended_until::text] from public.deleted_accounts where email_hash = app_private.email_hash('s16@scenario.test.local')),
  array['1', (now() - interval '1 day' + interval '7 days')::text], 'S16 deleted_accounts에 횟수 1과 정지 종료일');
select pg_temp.new_user('00000000-0000-4000-8000-000000000813', 'S16@scenario.test.local');
select is((pg_temp.p('00000000-0000-4000-8000-000000000813')).giveup_confirmed_count, 1, 'S16 재가입: 확정 횟수 승계');
select is((pg_temp.p('00000000-0000-4000-8000-000000000813')).suspended_until, now() - interval '1 day' + interval '7 days', 'S16 재가입: 정지 승계');

-- D: 포기 대기 중 탈퇴는 확정으로 센다(결정로그 "P1 포기 대기 중 탈퇴")
select pg_temp.new_user('00000000-0000-4000-8000-000000000804', 's16b@scenario.test.local');
select pg_temp.mk_goal('00000000-0000-4000-8000-000000000804', now() - interval '3 days');
select app_private.request_giveup('00000000-0000-4000-8000-000000000804',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000804'), now() - interval '1 hour');
select app_private.delete_user_data('00000000-0000-4000-8000-000000000804', now());
delete from auth.users where id = '00000000-0000-4000-8000-000000000804';
select pg_temp.new_user('00000000-0000-4000-8000-000000000814', 's16b@scenario.test.local');
select is((pg_temp.p('00000000-0000-4000-8000-000000000814')).suspended_until, now() + interval '7 days', 'S16 대기 중 탈퇴 → 재가입하면 7일 정지');

select * from finish();
rollback;
