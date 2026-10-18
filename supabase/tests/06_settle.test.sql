-- rules.ts settle, 시간 모델 테스트와 같은 사례 (src/lib/__tests__/rules.test.ts)
-- 기본 목표: 월~금, 22:00, 15분, first_day 2026-10-19(월)
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.kst(p text) returns timestamptz language sql as $$
  select p::timestamp at time zone 'Asia/Seoul'
$$;

-- 사용자와 목표를 한 번에 만든다. 목표 id = 사용자 id
create function pg_temp.mk(p_id uuid, p_settled date, p_progress int default 0,
                           p_giveup timestamptz default null, p_pending jsonb default null)
returns uuid language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_id::text || '@test.local',
          '{"age_confirmed": true, "ai_consent": true, "timezone": "Asia/Seoul"}', now(), now());
  insert into public.goals (id, user_id, name, reason, period_days, weekdays, start_minutes, target_minutes, situation,
                            first_day, settled_day, coupon_progress_days, giveup_requested_at, pending_change)
  values (p_id, p_id, '스타벅스에서 막힘없이 주문하기', '외국 손님 앞에서 주문을 막힘없이 하고 싶어서 시작합니다', 14,
          '{1,2,3,4,5}', 1320, 15, '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}',
          '2026-10-19', p_settled, p_progress, p_giveup, p_pending);
  return p_id;
end;
$$;

create function pg_temp.row(p_goal uuid, p_day date, p_status text) returns void language sql as $$
  insert into public.days (goal_id, day, user_id, status, target_minutes) values (p_goal, p_day, p_goal, p_status, 15)
$$;

create function pg_temp.writes(p_goal uuid, p_after date) returns text[] language sql as $$
  select coalesce(array_agg(day::text || ' ' || status order by day), '{}') from public.days where goal_id = p_goal and day > p_after
$$;

-- 판정: 쉬는 요일은 rest로, 진행일을 끊지 않는다
select pg_temp.mk('00000000-0000-4000-8000-000000000501', '2026-10-23', 5);
select pg_temp.row('00000000-0000-4000-8000-000000000501', '2026-10-23', 'done');
select app_private.settle_goal('00000000-0000-4000-8000-000000000501', pg_temp.kst('2026-10-26 12:00'));
select is(pg_temp.writes('00000000-0000-4000-8000-000000000501', '2026-10-23'), array['2026-10-24 rest', '2026-10-25 rest'], '쉬는 요일은 rest');
select is((select coupon_progress_days from public.goals where id = '00000000-0000-4000-8000-000000000501'), 5, 'rest는 진행일을 끊지 않는다');
select is((select settled_day from public.goals where id = '00000000-0000-4000-8000-000000000501'), '2026-10-25'::date, 'settled_day 10-25');

-- 판정: 빈 학습일과 진행 중으로 끝난 날은 실패, 진행일 0
select pg_temp.mk('00000000-0000-4000-8000-000000000502', '2026-10-18', 5);
select pg_temp.row('00000000-0000-4000-8000-000000000502', '2026-10-19', 'done');
select pg_temp.row('00000000-0000-4000-8000-000000000502', '2026-10-20', 'progress');
select app_private.settle_goal('00000000-0000-4000-8000-000000000502', pg_temp.kst('2026-10-22 12:00'));
select is(pg_temp.writes('00000000-0000-4000-8000-000000000502', '2026-10-19'), array['2026-10-20 failed', '2026-10-21 failed'], '빈 날과 progress는 failed');
select is((select status from public.days where goal_id = '00000000-0000-4000-8000-000000000502' and day = '2026-10-19'), 'done', 'done은 그대로');
select is((select coupon_progress_days from public.goals where id = '00000000-0000-4000-8000-000000000502'), 0, '실패하면 진행일 0');
select is((select settled_day from public.goals where id = '00000000-0000-4000-8000-000000000502'), '2026-10-21'::date, 'settled_day 10-21');

-- 판정: first_day 이전은 건너뛴다
select pg_temp.mk('00000000-0000-4000-8000-000000000503', '2026-10-16');
select app_private.settle_goal('00000000-0000-4000-8000-000000000503', pg_temp.kst('2026-10-19 12:00'));
select is(pg_temp.writes('00000000-0000-4000-8000-000000000503', '2026-01-01'), '{}'::text[], 'first_day 전에는 쓰지 않는다');
select is((select settled_day from public.goals where id = '00000000-0000-4000-8000-000000000503'), '2026-10-18'::date, 'settled_day 10-18');

-- 판정: 포기 대기와 겹친 날은 giveup_wait, 진행일은 그대로, done은 그대로
select pg_temp.mk('00000000-0000-4000-8000-000000000504', '2026-10-19', 4, pg_temp.kst('2026-10-20 23:00'));
select pg_temp.row('00000000-0000-4000-8000-000000000504', '2026-10-20', 'done');
select app_private.settle_goal('00000000-0000-4000-8000-000000000504', pg_temp.kst('2026-10-22 12:00'));
select is(pg_temp.writes('00000000-0000-4000-8000-000000000504', '2026-10-19'), array['2026-10-20 done', '2026-10-21 giveup_wait'], '대기 날은 giveup_wait, 신청 당일 done은 그대로');
select is((select coupon_progress_days from public.goals where id = '00000000-0000-4000-8000-000000000504'), 4, '대기 날은 진행일을 끊지 않는다');

-- 판정: 예약 변경은 from_day가 되면 목표에 들어간다
select pg_temp.mk('00000000-0000-4000-8000-000000000505', '2026-10-18', 0, null,
  '{"start_minutes": 60, "target_minutes": 20, "weekdays": [1, 2, 3, 4, 5, 6], "from_day": "2026-10-21"}');
select app_private.settle_goal('00000000-0000-4000-8000-000000000505', pg_temp.kst('2026-10-20 12:00'));
select isnt((select pending_change from public.goals where id = '00000000-0000-4000-8000-000000000505'), null, 'from_day 전에는 예약 유지');
select app_private.settle_goal('00000000-0000-4000-8000-000000000505', pg_temp.kst('2026-10-21 12:00'));
select is((select pending_change from public.goals where id = '00000000-0000-4000-8000-000000000505'), null, 'from_day에 예약 비움');
select is((select start_minutes from public.goals where id = '00000000-0000-4000-8000-000000000505'), 60, '시작 시각 적용');
select is((select weekdays from public.goals where id = '00000000-0000-4000-8000-000000000505'), array[1, 2, 3, 4, 5, 6], '요일 적용');

-- 시간 모델: 04:00 경계, 04:00 이전 시작은 다음 날, LA 서머타임
select is(app_private.day_key(pg_temp.kst('2026-10-08 03:59'), 'Asia/Seoul'), '2026-10-07'::date, '03:59는 전날');
select is(app_private.day_key(pg_temp.kst('2026-10-08 04:00'), 'Asia/Seoul'), '2026-10-08'::date, '04:00부터 그날');
select is(app_private.local_at('2026-10-07', 60, 'Asia/Seoul'), pg_temp.kst('2026-10-08 01:00'), '01:00 시작은 다음 날 01:00');
select is(app_private.local_at('2026-10-07', 240, 'Asia/Seoul'), pg_temp.kst('2026-10-07 04:00'), '04:00 시작은 그날');
select is(app_private.local_at('2026-03-07', 22 * 60, 'America/Los_Angeles'), '2026-03-08 06:00+00'::timestamptz, 'LA 03-07 22:00 PST');
select is(app_private.local_at('2026-03-08', 22 * 60, 'America/Los_Angeles'), '2026-03-09 05:00+00'::timestamptz, 'LA 03-08 22:00 PDT');
-- 없는 시각 02:30(03-08)은 앞으로 밀린다: 03:30 PDT
select is(app_private.local_at('2026-03-07', 150, 'America/Los_Angeles'), '2026-03-08 10:30+00'::timestamptz, 'LA 없는 시각 02:30 → 03:30 PDT');
select is(app_private.day_key('2026-03-08 10:30+00', 'America/Los_Angeles'), '2026-03-07'::date, 'LA 03:30 PDT는 아직 03-07');
-- 겹치는 01:30(11-01)은 표준시(PST)로 본다
select is(app_private.local_at('2026-10-31', 90, 'America/Los_Angeles'), '2026-11-01 09:30+00'::timestamptz, 'LA 겹치는 01:30은 PST');

select * from finish();
rollback;
