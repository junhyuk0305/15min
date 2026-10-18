-- 계정: 가입 동의 검사, 탈퇴 기록 승계, 탈퇴 데이터 삭제, 신고, 보관 기간 삭제, 시간대 예약
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create function pg_temp.kst(p text) returns timestamptz language sql as $$
  select p::timestamp at time zone 'Asia/Seoul'
$$;

create function pg_temp.new_user(p_id uuid, p_email text, p_meta jsonb default '{"age_confirmed": true, "ai_consent": true}')
returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, p_meta, now(), now())
  returning id
$$;

create function pg_temp.p(p_uid uuid) returns public.profiles language sql as $$
  select * from public.profiles where user_id = p_uid
$$;

-- 가입 동의
select throws_ok($$select pg_temp.new_user(gen_random_uuid(), 'noage@test.local', '{"ai_consent": true}')$$,
  'P0001', 'age_not_confirmed', '만 18세 이상 확인이 없으면 가입 불가');
select throws_ok($$select pg_temp.new_user(gen_random_uuid(), 'noage2@test.local', '{"age_confirmed": "true", "ai_consent": true}')$$,
  'P0001', 'age_not_confirmed', 'age_confirmed는 불리언 true만 인정');
select throws_ok($$select pg_temp.new_user(gen_random_uuid(), 'noai@test.local', '{"age_confirmed": true}')$$,
  'P0001', 'ai_consent_required', 'AI 처리·국외 이전 동의가 없으면 가입 불가');
select throws_ok($$select pg_temp.new_user(gen_random_uuid(), 'noai2@test.local', '{"age_confirmed": true, "ai_consent": false}')$$,
  'P0001', 'ai_consent_required', 'ai_consent false도 가입 불가');

select pg_temp.new_user('00000000-0000-4000-8000-0000000000f1', 'Ny@Test.local',
  '{"age_confirmed": true, "ai_consent": true, "timezone": "America/New_York", "terms_version": "v1"}');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000f1')).timezone, 'America/New_York', '메타데이터 시간대 저장');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000f1')).terms_version, 'v1', '약관 버전 저장');
select isnt((pg_temp.p('00000000-0000-4000-8000-0000000000f1')).age_confirmed_at, null, 'age_confirmed_at 기록');
select isnt((pg_temp.p('00000000-0000-4000-8000-0000000000f1')).ai_consent_at, null, 'ai_consent_at 기록');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000f1')).email_hash,
  encode(extensions.hmac('ny@test.local', (select value from app_private.config where key = 'email_hash_pepper'), 'sha256'), 'hex'),
  'email_hash = HMAC-SHA256(정규화한 이메일, pepper)');
select pg_temp.new_user('00000000-0000-4000-8000-0000000000f2', 'badtz@test.local',
  '{"age_confirmed": true, "ai_consent": true, "timezone": "Mars/Olympus"}');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000f2')).timezone, 'Asia/Seoul', '잘못된 시간대는 Asia/Seoul');

-- 탈퇴와 재가입: 포기 횟수와 정지를 이어 붙인다
select pg_temp.new_user('00000000-0000-4000-8000-0000000000f3', 'again@test.local');
update public.profiles set giveup_confirmed_count = 2, suspended_until = now() + interval '10 days'
where user_id = '00000000-0000-4000-8000-0000000000f3';
-- 개인 데이터 채우기(정지 중이라 RPC로는 목표를 못 만들어 직접 넣는다)
insert into public.goals (id, user_id, name, reason, period_days, weekdays, start_minutes, target_minutes, situation, first_day, settled_day, status)
values ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000f3', '목표', '탈퇴 테스트용 이유를 스무 글자 넘게 적습니다', 14, '{0,1,2,3,4,5,6}', 1320, 10,
        '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}', current_date - 5, current_date - 6, 'given_up');
insert into public.days (goal_id, day, user_id, status, target_minutes)
values ('00000000-0000-4000-8000-0000000000f9', current_date - 5, '00000000-0000-4000-8000-0000000000f3', 'done', 10);
insert into public.messages (id, user_id, goal_id, day, phase, role, text) values
  ('00000000-0000-4000-8000-00000000f301', '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f9', current_date - 5, 'B', 'partner', 'Hello'),
  ('00000000-0000-4000-8000-00000000f302', '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f9', current_date - 5, 'B', 'user', 'Hi');
insert into public.items (id, user_id, goal_id, kind, base)
values ('00000000-0000-4000-8000-00000000f3a1', '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f9', 'word', 'latte');
insert into public.item_events (user_id, item_id, day, kind)
values ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-00000000f3a1', current_date - 5, 'taught');
insert into public.episodes (goal_id, index, user_id) values ('00000000-0000-4000-8000-0000000000f9', 0, '00000000-0000-4000-8000-0000000000f3');
insert into public.reflections (id, user_id, day, role, text) values
  ('00000000-0000-4000-8000-00000000f3b1', '00000000-0000-4000-8000-0000000000f3', current_date, 'coach', '왜 포기하셨습니까?'),
  ('00000000-0000-4000-8000-00000000f3b2', '00000000-0000-4000-8000-0000000000f3', current_date, 'user', '바빠서');
insert into public.ai_usage (user_id, day, fn) values ('00000000-0000-4000-8000-0000000000f3', current_date, 'reflection');

-- 신고(정지 중에도 가능)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f3", "role": "authenticated"}', true);
select is((public.report_message('00000000-0000-4000-8000-00000000f301', '  부적절한 내용  ')).reason, '부적절한 내용', 'AI 메시지 신고');
select is((public.report_message('00000000-0000-4000-8000-00000000f301', '다른 사유')).reason, '부적절한 내용', '같은 메시지 두 번 신고해도 한 건(첫 사유 유지)');
select isnt((public.report_message('00000000-0000-4000-8000-00000000f3b1', null)).reflection_id, null, '반성문 코치 답 신고');
select is((select count(*) from public.message_reports), 2::bigint, '내 신고 2건이 보인다');
select throws_ok($$select public.report_message('00000000-0000-4000-8000-00000000f302', 'x')$$, 'P0001', 'not_found', '내가 쓴 메시지는 신고 대상 아님');
select throws_ok($$select public.report_message('00000000-0000-4000-8000-00000000f3b2', 'x')$$, 'P0001', 'not_found', '내가 쓴 반성문은 신고 대상 아님');
select throws_ok($$insert into public.message_reports (user_id, reason) values ('00000000-0000-4000-8000-0000000000f3', 'x')$$, '42501', null, '신고 표에 직접 쓰기 불가');
reset role;

-- 남의 메시지는 신고 불가
select pg_temp.new_user('00000000-0000-4000-8000-0000000000f4', 'other@test.local');
select throws_ok($$select app_private.report_message('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-00000000f301', 'x')$$,
  'P0001', 'not_found', '남의 메시지는 신고 불가');

-- 탈퇴
select app_private.delete_user_data('00000000-0000-4000-8000-0000000000f3');
select is((select giveup_confirmed_count from public.deleted_accounts where email_hash = app_private.email_hash('again@test.local')),
  2, '탈퇴 기록에 포기 횟수 보관');
select is(
  (select count(*) from public.profiles where user_id = '00000000-0000-4000-8000-0000000000f3')
  + (select count(*) from public.goals where user_id = '00000000-0000-4000-8000-0000000000f3')
  + (select count(*) from public.days where user_id = '00000000-0000-4000-8000-0000000000f3')
  + (select count(*) from public.messages where user_id = '00000000-0000-4000-8000-0000000000f3')
  + (select count(*) from public.items where user_id = '00000000-0000-4000-8000-0000000000f3')
  + (select count(*) from public.item_events where user_id = '00000000-0000-4000-8000-0000000000f3')
  + (select count(*) from public.episodes where user_id = '00000000-0000-4000-8000-0000000000f3')
  + (select count(*) from public.reflections where user_id = '00000000-0000-4000-8000-0000000000f3'),
  0::bigint, '개인 데이터 삭제');
select is((select count(*) from public.ai_usage where user_id = '00000000-0000-4000-8000-0000000000f3'), 0::bigint, 'AI 사용 기록 삭제');
select is((select count(*) from public.message_reports where user_id = '00000000-0000-4000-8000-0000000000f3'), 0::bigint, '신고 기록 삭제');

delete from auth.users where id = '00000000-0000-4000-8000-0000000000f3';
-- 같은 이메일(대소문자, 공백 달라도)로 재가입
select pg_temp.new_user('00000000-0000-4000-8000-0000000000f5', ' AGAIN@test.local ');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000f5')).giveup_confirmed_count, 2, '재가입하면 포기 횟수 승계');
select ok((pg_temp.p('00000000-0000-4000-8000-0000000000f5')).suspended_until > now() + interval '9 days', '재가입하면 정지 종료일 승계');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000f5')).banned, false, '2회는 영구 정지 아님');

-- 3회 확정 계정은 재가입해도 영구 정지
insert into public.deleted_accounts (email_hash, giveup_confirmed_count) values (app_private.email_hash('three@test.local'), 3);
select pg_temp.new_user('00000000-0000-4000-8000-0000000000f6', 'Three@test.local');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000f6')).banned, true, '3회 확정 계정은 재가입해도 banned');

-- 보관 기간 삭제: AI 사용 기록 90일, 탈퇴 기록 1년
insert into public.ai_usage (user_id, day, fn, created_at) values
  ('00000000-0000-4000-8000-0000000000f4', current_date - 91, 'lesson-turn', now() - interval '91 days'),
  ('00000000-0000-4000-8000-0000000000f4', current_date - 89, 'lesson-turn', now() - interval '89 days');
insert into public.deleted_accounts (email_hash, giveup_confirmed_count, deleted_at) values
  ('old-hash', 1, now() - interval '366 days'),
  ('recent-hash', 1, now() - interval '364 days');
select app_private.purge_old_data(now());
select is((select count(*) from public.ai_usage where user_id = '00000000-0000-4000-8000-0000000000f4'), 1::bigint, '90일 지난 AI 사용 기록 삭제');
select is((select array_agg(email_hash order by email_hash) from public.deleted_accounts where email_hash in ('old-hash', 'recent-hash')),
  array['recent-hash'], '1년 지난 탈퇴 기록 삭제');

-- 시간대 예약: 옛 시간대 기준 내일부터
select pg_temp.new_user('00000000-0000-4000-8000-0000000000f7', 'tz@test.local', '{"age_confirmed": true, "ai_consent": true, "timezone": "Asia/Seoul"}');
select is((app_private.set_timezone('00000000-0000-4000-8000-0000000000f7', 'America/New_York', pg_temp.kst('2026-03-02 22:00'))).pending_timezone_from,
  '2026-03-03'::date, '시간대 변경은 내일부터 예약');
select is((pg_temp.p('00000000-0000-4000-8000-0000000000f7')).timezone, 'Asia/Seoul', '오늘은 옛 시간대 유지');
select app_private.settle_user('00000000-0000-4000-8000-0000000000f7', pg_temp.kst('2026-03-03 05:00'));
select is((pg_temp.p('00000000-0000-4000-8000-0000000000f7')).timezone, 'Asia/Seoul', '새 시간대(뉴욕)가 아직 그날이 아니면 옛 시간대 유지');
select app_private.settle_user('00000000-0000-4000-8000-0000000000f7', pg_temp.kst('2026-03-03 19:00'));
select is((pg_temp.p('00000000-0000-4000-8000-0000000000f7')).timezone, 'America/New_York', '두 시간대 모두 그날이 되면 적용');
select throws_ok($$select app_private.set_timezone('00000000-0000-4000-8000-0000000000f7', 'Not/AZone', now())$$, 'P0001', 'invalid', '잘못된 시간대 거부');

select * from finish();
rollback;
