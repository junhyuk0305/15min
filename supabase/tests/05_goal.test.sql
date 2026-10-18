-- 목표: 생성 검사, 멱등, 달성 선언, 일정 변경 예약, 공개 RPC는 서버 시각만 쓴다
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

create function pg_temp.kst(p text) returns timestamptz language sql as $$
  select p::timestamp at time zone 'Asia/Seoul'
$$;

create function pg_temp.new_user(p_id uuid, p_email text) returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          '{"age_confirmed": true, "ai_consent": true, "timezone": "Asia/Seoul"}', now(), now())
  returning id
$$;

-- 기본값으로 목표 만들기. 인자 하나씩 바꿔 검사한다.
create function pg_temp.mk(
  p_reason text default '출장 가서 카페에서 혼자 주문하고 싶어서 시작합니다',
  p_period int default 7,
  p_weekdays int[] default '{1,2,3,4,5,1}',
  p_start int default 1320,
  p_target int default 10,
  p_situation jsonb default '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}'
) returns public.goals language sql as $$
  select app_private.create_goal('00000000-0000-4000-8000-0000000000a9', '카페 주문', p_reason, p_period, p_weekdays,
    p_start, p_target, p_situation, '["인사","주문","결제"]', pg_temp.kst('2026-03-02 22:00'))
$$;

select pg_temp.new_user('00000000-0000-4000-8000-0000000000a9', 'goal@test.local');

-- 생성 검사(정책 숫자)
select throws_ok($$select pg_temp.mk(p_reason => '   열아홉 글자짜리 이유를 적었습니다.   ')$$, 'P0001', 'reason_short', '이유 20자 미만(앞뒤 공백 제외)');
select throws_ok($$select pg_temp.mk(p_period => 6)$$, 'P0001', 'invalid', '기간 7일 미만 거부');
select throws_ok($$select pg_temp.mk(p_period => 91)$$, 'P0001', 'invalid', '기간 90일 초과 거부');
select throws_ok($$select pg_temp.mk(p_target => 9)$$, 'P0001', 'invalid', '학습 10분 미만 거부');
select throws_ok($$select pg_temp.mk(p_target => 31)$$, 'P0001', 'invalid', '학습 30분 초과 거부');
select throws_ok($$select pg_temp.mk(p_weekdays => '{1,1,2,3,4}')$$, 'P0001', 'invalid', '서로 다른 요일 5개 미만 거부');
select throws_ok($$select pg_temp.mk(p_weekdays => '{1,2,3,4,7}')$$, 'P0001', 'invalid', '요일 0~6 밖 거부');
select throws_ok($$select pg_temp.mk(p_start => 1440)$$, 'P0001', 'invalid', '시작 시각 범위 밖 거부');
select throws_ok($$select pg_temp.mk(p_situation => '{"place":"카페"}')$$, 'P0001', 'invalid', '상황 항목 누락 거부');
select is(char_length('열아홉 글자짜리 이유를 적었습니다.'), 19, '(확인) 위 이유는 19자');

create temp table t (k text primary key, v jsonb);
insert into t select 'g', to_jsonb(pg_temp.mk());
select is((select v ->> 'first_day' from t), '2026-03-03', 'first_day = 하루 키 + 1');
select is((select v ->> 'settled_day' from t), '2026-03-02', 'settled_day = first_day - 1');
select is((select v -> 'weekdays' from t), '[1, 2, 3, 4, 5]'::jsonb, '요일은 중복 제거, 정렬');
select is((select array[(v ->> 'coupons')::int, (v ->> 'coupon_streak_goal_weeks')::int, (v ->> 'coupon_progress_days')::int] from t), array[3, 2, 0], '쿠폰 3장, 기준 2주, 진행 0');
select is((select count(*) from public.episodes where goal_id = (select (v ->> 'id')::uuid from t) and index = 0), 1::bigint, '에피소드 0번 생성');
select is((pg_temp.mk()).id, (select (v ->> 'id')::uuid from t), '같은 요청 다시 오면 같은 목표');
select throws_ok($$select pg_temp.mk(p_reason => '다른 이유로 두 번째 목표를 만들어 보려고 합니다')$$, 'P0001', 'invalid', '활성 목표가 있으면 새 목표 불가');

-- 일정 변경 예약: 내일부터
select is((app_private.change_schedule('00000000-0000-4000-8000-0000000000a9', (select (v ->> 'id')::uuid from t), 1200, 15, '{0,1,2,3,4,5,6}', pg_temp.kst('2026-03-03 12:00'))).pending_change ->> 'from_day',
  '2026-03-04', '일정 변경은 다음 날부터');
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-0000000000a9', (select (v ->> 'id')::uuid from t), '오늘은 옛 일정으로 22시에 시작해야 합니다', pg_temp.kst('2026-03-03 20:00'))$$,
  'P0001', 'too_early', '오늘은 옛 시작 시각(22:00) 적용');
select app_private.settle_all(pg_temp.kst('2026-03-04 05:00'));
select is((select array[start_minutes, target_minutes] from public.goals where id = (select (v ->> 'id')::uuid from t)), array[1200, 15], '다음 날 판정 때 적용');
select is((select pending_change from public.goals where id = (select (v ->> 'id')::uuid from t)), null, '예약 비움');

-- 달성 선언: 기간 7일, first_day 3/3 → 3/10부터
select throws_ok($$select app_private.declare_achievement('00000000-0000-4000-8000-0000000000a9', (select (v ->> 'id')::uuid from t), pg_temp.kst('2026-03-10 03:59'))$$,
  'P0001', 'not_yet', '기간이 지나기 전에는 not_yet(3/10 03:59는 아직 3/9)');
select is((app_private.declare_achievement('00000000-0000-4000-8000-0000000000a9', (select (v ->> 'id')::uuid from t), pg_temp.kst('2026-03-10 04:00'))).status,
  'achieved', '기간이 지나면 달성');
select is((app_private.declare_achievement('00000000-0000-4000-8000-0000000000a9', (select (v ->> 'id')::uuid from t), pg_temp.kst('2026-03-11 10:00'))).ended_at,
  pg_temp.kst('2026-03-10 04:00'), '두 번 선언해도 그대로');

-- 공개 RPC: 시각 인자가 없다(기기 시각을 받지 않는다)
select is((
  select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('set_timezone', 'create_goal', 'settle_me', 'start_day', 'save_progress', 'start_retro',
                      'save_retro_progress', 'complete_day', 'use_coupon', 'request_giveup', 'withdraw_giveup',
                      'declare_achievement', 'change_schedule', 'report_message')
    and exists (select 1 from unnest(p.proargtypes::oid[]) a where a in ('timestamptz'::regtype, 'timestamp'::regtype, 'bigint'::regtype))
), 0::bigint, '공개 RPC는 시각 인자를 받지 않는다');

-- 공개 RPC로 사용자 흐름: 서버 시각 기준
select pg_temp.new_user('00000000-0000-4000-8000-0000000000aa', 'pub@test.local');
insert into public.goals (id, user_id, name, reason, period_days, weekdays, start_minutes, target_minutes, situation, first_day, settled_day)
values ('00000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000aa', '오늘부터', '공개 RPC 테스트용 이유를 스무 글자 넘게 적습니다', 14,
        '{0,1,2,3,4,5,6}', 241, 10, '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}',
        app_private.day_key(now(), 'Asia/Seoul'), app_private.day_key(now(), 'Asia/Seoul') - 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000aa", "role": "authenticated"}', true);
create temp table p (k text primary key, v jsonb);
insert into p select 's1', to_jsonb(public.start_day('00000000-0000-4000-8000-0000000000ab', '공개 RPC로 오늘 학습을 시작하는 이유입니다'));
insert into p select 's2', to_jsonb(public.start_day('00000000-0000-4000-8000-0000000000ab', '공개 RPC로 오늘 학습을 시작하는 이유입니다'));
select is((select v from p where k = 's2'), (select v from p where k = 's1'), '공개 start_day 두 번 = 한 번');
select is((select v ->> 'day' from p where k = 's1')::date, ((now() at time zone 'Asia/Seoul') - interval '4 hours')::date, '하루 키는 서버 시각으로 정한다');
select throws_ok($$select public.complete_day('00000000-0000-4000-8000-0000000000ab', (select (v ->> 'day')::date from p where k = 's1'))$$,
  'P0001', 'not_enough_time', '방금 시작했으면 완료 거부(서버 경과 시간)');
insert into p select 'u1', public.use_coupon('00000000-0000-4000-8000-0000000000ab');
insert into p select 'u2', public.use_coupon('00000000-0000-4000-8000-0000000000ab');
select is((select v from p where k = 'u2'), (select v from p where k = 'u1'), '공개 use_coupon 두 번 = 한 번');
select ok(public.server_now() between now() - interval '1 minute' and now() + interval '1 minute', 'server_now는 서버 시각');
reset role;

select * from finish();
rollback;
