-- 포기: 24시간 대기, 확정 횟수별 정지(7일, 14일, 영구), 철회는 횟수에 안 들어감, 대기일은 실패 아님
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

create function pg_temp.kst(p text) returns timestamptz language sql as $$
  select p::timestamp at time zone 'Asia/Seoul'
$$;

create function pg_temp.new_user(p_id uuid, p_email text) returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          '{"age_confirmed": true, "ai_consent": true, "timezone": "Asia/Seoul"}', now(), now())
  returning id
$$;

create function pg_temp.mk_goal(p_uid uuid, p_now timestamptz) returns uuid language sql as $$
  select (app_private.create_goal(
    p_uid, '카페 주문', '출장 가서 카페에서 혼자 주문하고 싶어서 시작합니다', 14, '{0,1,2,3,4,5,6}', 1320, 10,
    '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}', '["인사","주문"]', p_now)).id
$$;

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

create temp table t (k text primary key, v uuid, at timestamptz);

-- 사용자 1: 포기 3번
select pg_temp.new_user('00000000-0000-4000-8000-0000000000e1', 'give1@test.local');

-- 1회째
insert into t values ('g1', pg_temp.mk_goal('00000000-0000-4000-8000-0000000000e1', pg_temp.kst('2026-03-02 22:00')), null);
insert into t values ('req1', null, (app_private.request_giveup('00000000-0000-4000-8000-0000000000e1', (select v from t where k = 'g1'), pg_temp.kst('2026-03-02 23:00'))).giveup_requested_at);
select is((select at from t where k = 'req1'), pg_temp.kst('2026-03-02 23:00'), '포기 신청 시각 기록');
select is((app_private.request_giveup('00000000-0000-4000-8000-0000000000e1', (select v from t where k = 'g1'), pg_temp.kst('2026-03-03 01:00'))).giveup_requested_at,
  pg_temp.kst('2026-03-02 23:00'), '두 번 신청해도 첫 신청 시각 그대로');

select is(app_private.confirm_giveups(pg_temp.kst('2026-03-03 22:59')), 0, '24시간 전에는 확정하지 않는다');
select is((select status from public.goals where id = (select v from t where k = 'g1')), 'active', '대기 중에는 active');
select is(app_private.confirm_giveups(pg_temp.kst('2026-03-03 23:00')), 1, '24시간이 지나면 확정');
select is((select status from public.goals where id = (select v from t where k = 'g1')), 'given_up', '목표 given_up');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000e1')).giveup_confirmed_count, 1, '확정 횟수 1');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000e1')).suspended_until, pg_temp.kst('2026-03-03 23:00') + interval '7 days', '1회 확정: 7일 정지');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000e1')).suspended_goal_id, (select v from t where k = 'g1'), 'suspended_goal_id = 포기한 목표');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000e1')).banned, false, '1회는 영구 정지 아님');
select is((select status from public.days where goal_id = (select v from t where k = 'g1') and day = '2026-03-03'), null, '확정 당일은 판정 전');

select throws_ok($$select pg_temp.mk_goal('00000000-0000-4000-8000-0000000000e1', pg_temp.kst('2026-03-05 12:00'))$$,
  'P0001', 'suspended', '정지 중에는 새 목표 불가');

-- 정지 중에도 자기 프로필은 읽힌다(정지 화면, 계정 삭제용)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}', true);
select is((select suspended_until is not null from public.profiles), true, '정지 중에도 자기 프로필을 읽는다');
select is((select count(*) from public.goals), 0::bigint, '포기 확정 목표는 화면에서 숨는다');
reset role;

select is(app_private.release_suspensions(pg_temp.kst('2026-03-10 23:00')), 0, '7일이 끝나기 전에는 해제하지 않는다');
select is(app_private.release_suspensions(pg_temp.kst('2026-03-10 23:01')), 1, '7일이 지나면 해제');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000e1')).suspended_until, null, 'suspended_until = null');

-- 2회째
insert into t values ('g2', pg_temp.mk_goal('00000000-0000-4000-8000-0000000000e1', pg_temp.kst('2026-03-11 12:00')), null);
select app_private.request_giveup('00000000-0000-4000-8000-0000000000e1', (select v from t where k = 'g2'), pg_temp.kst('2026-03-11 13:00'));
select app_private.confirm_giveups(pg_temp.kst('2026-03-12 13:05'));
select is((pg_temp.p('00000000-0000-4000-8000-0000000000e1')).giveup_confirmed_count, 2, '확정 횟수 2');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000e1')).suspended_until, pg_temp.kst('2026-03-12 13:05') + interval '14 days', '2회 확정: 14일 정지');

-- 3회째
select app_private.release_suspensions(pg_temp.kst('2026-03-27 00:00'));
insert into t values ('g3', pg_temp.mk_goal('00000000-0000-4000-8000-0000000000e1', pg_temp.kst('2026-03-27 12:00')), null);
select app_private.request_giveup('00000000-0000-4000-8000-0000000000e1', (select v from t where k = 'g3'), pg_temp.kst('2026-03-27 13:00'));
-- settle_user(앱 실행 때 settle_me)도 확정한다
select app_private.settle_user('00000000-0000-4000-8000-0000000000e1', pg_temp.kst('2026-03-28 13:00'));
select is((pg_temp.p('00000000-0000-4000-8000-0000000000e1')).giveup_confirmed_count, 3, '확정 횟수 3');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000e1')).banned, true, '3회째 확정: 영구 정지');
select throws_ok($$select pg_temp.mk_goal('00000000-0000-4000-8000-0000000000e1', pg_temp.kst('2026-05-01 12:00'))$$,
  'P0001', 'banned', '영구 정지면 새 목표 불가');

-- 사용자 2: 철회는 횟수에 안 들어가고, 대기일은 giveup_wait(실패 아님, 쿠폰 진행 유지)
select pg_temp.new_user('00000000-0000-4000-8000-0000000000e2', 'give2@test.local');
insert into t values ('w', pg_temp.mk_goal('00000000-0000-4000-8000-0000000000e2', pg_temp.kst('2026-03-02 22:00')), null);
select pg_temp.do_day('00000000-0000-4000-8000-0000000000e2', (select v from t where k = 'w'), pg_temp.kst('2026-03-03 22:00'));
select app_private.request_giveup('00000000-0000-4000-8000-0000000000e2', (select v from t where k = 'w'), pg_temp.kst('2026-03-04 20:00'));
select is((app_private.withdraw_giveup('00000000-0000-4000-8000-0000000000e2', (select v from t where k = 'w'), pg_temp.kst('2026-03-05 19:00'))).giveup_requested_at,
  null, '24시간 안에 철회');
select is((select status from public.days where goal_id = (select v from t where k = 'w') and day = '2026-03-04'), 'giveup_wait', '대기 중 지난 날은 giveup_wait');
select is((select coupon_progress_days from public.goals where id = (select v from t where k = 'w')), 1, '대기일은 쿠폰 진행을 끊지 않는다');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000e2')).giveup_confirmed_count, 0, '철회는 확정 횟수에 안 들어간다');
select is(app_private.confirm_giveups(pg_temp.kst('2026-03-06 00:00')), 0, '철회 뒤에는 확정되지 않는다');
select is((app_private.withdraw_giveup('00000000-0000-4000-8000-0000000000e2', (select v from t where k = 'w'), pg_temp.kst('2026-03-05 19:01'))).status,
  'active', '철회 두 번도 그대로');

-- 24시간이 지난 신청은 철회할 수 없다(cron 확정 전이라도)
select app_private.request_giveup('00000000-0000-4000-8000-0000000000e2', (select v from t where k = 'w'), pg_temp.kst('2026-03-06 10:00'));
select throws_ok($$select app_private.withdraw_giveup('00000000-0000-4000-8000-0000000000e2', (select v from t where k = 'w'), pg_temp.kst('2026-03-07 10:00'))$$,
  'P0001', 'not_active', '24시간이 지나면 철회 불가');

select * from finish();
rollback;
