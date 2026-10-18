-- RLS와 권한: 남의 행은 안 보이고, 클라이언트는 표를 직접 바꾸지 못한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- 준비(postgres)
insert into app_private.config (key, value) values ('review_email', 'review@graego.app')
on conflict (key) do update set value = excluded.value;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'rls1@test.local', '{"age_confirmed": true, "ai_consent": true}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'rls2@test.local', '{"age_confirmed": true, "ai_consent": true}', now(), now());

-- 사용자 1: 활성 목표와 포기 확정된 옛 목표
insert into public.goals (id, user_id, name, reason, period_days, weekdays, start_minutes, target_minutes, situation, first_day, settled_day, status) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', '목표1', '이유는 스무 글자를 넘겨야 하므로 길게 적습니다', 14, '{0,1,2,3,4,5,6}', 1320, 10, '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}', current_date + 1, current_date, 'active'),
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000a1', '옛 목표', '이유는 스무 글자를 넘겨야 하므로 길게 적습니다', 14, '{0,1,2,3,4,5,6}', 1320, 10, '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}', current_date - 10, current_date - 1, 'given_up'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a2', '목표2', '이유는 스무 글자를 넘겨야 하므로 길게 적습니다', 14, '{0,1,2,3,4,5,6}', 1320, 10, '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}', current_date - 1, current_date - 2, 'active');

insert into public.days (goal_id, day, user_id, status, target_minutes) values
  ('00000000-0000-4000-8000-0000000000b0', current_date - 5, '00000000-0000-4000-8000-0000000000a1', 'done', 10),
  ('00000000-0000-4000-8000-0000000000b2', current_date - 1, '00000000-0000-4000-8000-0000000000a2', 'done', 10);
insert into public.messages (user_id, goal_id, day, phase, role, text) values
  ('00000000-0000-4000-8000-0000000000a1', null, null, 'setup', 'user', '목표 설정 대화'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b0', current_date - 5, 'B', 'user', 'old'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b2', current_date - 1, 'B', 'user', 'hi');
insert into public.items (id, user_id, goal_id, kind, base) values
  ('00000000-0000-4000-8000-0000000000c0', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b0', 'word', 'latte'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b2', 'word', 'mocha');
insert into public.item_events (user_id, item_id, day, kind) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c0', current_date - 5, 'taught'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c2', current_date - 1, 'taught');
insert into public.episodes (goal_id, index, user_id) values
  ('00000000-0000-4000-8000-0000000000b1', 0, '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b0', 0, '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b2', 0, '00000000-0000-4000-8000-0000000000a2');
insert into public.reflections (user_id, day, role, text) values
  ('00000000-0000-4000-8000-0000000000a2', current_date, 'user', '반성');
insert into public.ai_usage (user_id, day, fn) values
  ('00000000-0000-4000-8000-0000000000a2', current_date, 'lesson-turn');
insert into public.message_reports (user_id, reason) values
  ('00000000-0000-4000-8000-0000000000a2', '신고');

-- 사용자 1로 접속
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);

select is((select count(*) from public.profiles), 1::bigint, '프로필: 자기 행만 보인다');
select is((select count(*) from public.goals where user_id = '00000000-0000-4000-8000-0000000000a2'), 0::bigint, '목표: 남의 행 안 보임');
select is((select count(*) from public.days where user_id = '00000000-0000-4000-8000-0000000000a2'), 0::bigint, '하루: 남의 행 안 보임');
select is((select count(*) from public.messages where user_id = '00000000-0000-4000-8000-0000000000a2'), 0::bigint, '메시지: 남의 행 안 보임');
select is((select count(*) from public.items where user_id = '00000000-0000-4000-8000-0000000000a2'), 0::bigint, '항목: 남의 행 안 보임');
select is((select count(*) from public.item_events where user_id = '00000000-0000-4000-8000-0000000000a2'), 0::bigint, '항목 기록: 남의 행 안 보임');
select is((select count(*) from public.episodes where user_id = '00000000-0000-4000-8000-0000000000a2'), 0::bigint, '에피소드: 남의 행 안 보임');
select is((select count(*) from public.reflections), 0::bigint, '반성문: 남의 행 안 보임');
select is((select count(*) from public.ai_usage), 0::bigint, 'AI 사용량: 남의 행 안 보임');
select is((select count(*) from public.message_reports), 0::bigint, '신고: 남의 행 안 보임');

-- 포기 확정 목표와 그 기록은 숨는다
select is((select array_agg(id) from public.goals), array['00000000-0000-4000-8000-0000000000b1'::uuid], '목표: given_up 숨김, 활성만 보임');
select is((select count(*) from public.days), 0::bigint, '하루: given_up 목표의 기록 숨김');
select is((select count(*) from public.messages), 1::bigint, '메시지: 목표 설정 대화만 보이고 given_up 목표 대화는 숨김');
select is((select count(*) from public.items), 0::bigint, '항목: given_up 목표 숨김');
select is((select count(*) from public.item_events), 0::bigint, '항목 기록: given_up 목표 숨김');
select is((select count(*) from public.episodes), 1::bigint, '에피소드: 활성 목표 것만');

-- 직접 쓰기 금지
select throws_ok($$update public.profiles set giveup_confirmed_count = 0$$, '42501', null, '포기 횟수를 직접 못 바꾼다');
select throws_ok($$update public.goals set coupons = 99$$, '42501', null, '쿠폰을 직접 못 바꾼다');
select throws_ok(
  $$insert into public.days (goal_id, day, user_id, status, target_minutes)
    values ('00000000-0000-4000-8000-0000000000b1', current_date, '00000000-0000-4000-8000-0000000000a1', 'done', 10)$$,
  '42501', null, '하루 완료를 직접 못 넣는다');
select throws_ok($$delete from public.goals$$, '42501', null, '목표를 직접 못 지운다');
select throws_ok($$select * from public.deleted_accounts$$, '42501', null, '탈퇴 기록은 못 읽는다');
select throws_ok($$select * from app_private.config$$, '42501', null, '내부 설정은 못 읽는다');
select throws_ok($$select app_private.settle_all()$$, '42501', null, '내부 함수는 못 부른다');
select throws_ok($$select public.delete_user_data('00000000-0000-4000-8000-0000000000a2')$$, '42501', null, '탈퇴 래퍼는 service role 전용');
select throws_ok($$select public.request_giveup('00000000-0000-4000-8000-0000000000b2')$$, 'P0001', 'not_found', '남의 목표 RPC는 not_found');

-- 비로그인(anon)
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon은 표를 못 읽는다');
select throws_ok($$select public.start_day('00000000-0000-4000-8000-0000000000b1', 'x')$$, '42501', null, 'anon은 상태 변경 RPC를 못 부른다');
select is(
  array[public.login_method('  Review@Graego.app '), public.login_method('someone@test.local'), public.login_method(null)],
  array['password', 'otp', 'otp'],
  'login_method: 심사 이메일만 password'
);

reset role;
select * from finish();
rollback;
