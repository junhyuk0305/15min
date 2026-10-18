-- 보안 보강: 비밀번호는 심사용 계정만, 이메일 별칭 정규화와 HMAC 해시, 입력 길이와 개수, 04:00 경계 일정,
-- 서쪽 시간대 변경, AI 호출 자리 잡기, 신고 보존과 AI 글 신고, 인증 기록 보관 기간, 기본 권한
begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

create function pg_temp.at(p text, p_tz text) returns timestamptz language sql as $$
  select p::timestamp at time zone p_tz
$$;

create function pg_temp.new_user(p_id uuid, p_email text, p_tz text default 'Asia/Seoul', p_pw text default null)
returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          case when p_pw is null then null else extensions.crypt(p_pw, extensions.gen_salt('bf')) end,
          jsonb_build_object('age_confirmed', true, 'ai_consent', true, 'timezone', p_tz), now(), now())
  returning id
$$;

create function pg_temp.pw(p_id uuid) returns text language sql as $$
  select coalesce(encrypted_password, '') from auth.users where id = p_id
$$;

create function pg_temp.p(p_uid uuid) returns public.profiles language sql as $$
  select * from public.profiles where user_id = p_uid
$$;

-- 목표 만들기. 인자 하나씩 바꿔 검사한다.
create function pg_temp.mk(
  p_uid uuid,
  p_name text default '카페 주문',
  p_reason text default '출장 가서 카페에서 혼자 주문하고 싶어서 시작합니다',
  p_start int default 1320,
  p_target int default 10,
  p_situation jsonb default '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}',
  p_subs jsonb default '["인사","주문","결제"]',
  p_now timestamptz default pg_temp.at('2026-03-02 22:00', 'Asia/Seoul')
) returns public.goals language sql as $$
  select app_private.create_goal(p_uid, p_name, p_reason, 14, '{0,1,2,3,4,5,6}', p_start, p_target,
    p_situation, p_subs, p_now)
$$;

-- ───────── H1. 비밀번호는 심사용 계정만 ─────────

update app_private.config set value = 'Rev9@Test.local' where key = 'review_email';
select pg_temp.new_user('00000000-0000-4000-8000-000000000901', 'victim9@test.local', 'Asia/Seoul', 'AttackerPass1!');
select is(pg_temp.pw('00000000-0000-4000-8000-000000000901'), '', '심사용이 아닌 이메일은 가입 때 비밀번호가 저장되지 않는다');
update auth.users set encrypted_password = extensions.crypt('NewPassw0rd!!', extensions.gen_salt('bf'))
where id = '00000000-0000-4000-8000-000000000901';
select is(pg_temp.pw('00000000-0000-4000-8000-000000000901'), '', '심사용이 아닌 계정은 비밀번호를 바꿔도 저장되지 않는다');
select pg_temp.new_user('00000000-0000-4000-8000-000000000902', 'rev9@test.local', 'Asia/Seoul', 'ReviewPass123!');
select ok(extensions.crypt('ReviewPass123!', pg_temp.pw('00000000-0000-4000-8000-000000000902')) = pg_temp.pw('00000000-0000-4000-8000-000000000902'),
  '심사용 이메일(대소문자 무시)은 비밀번호가 저장되고 맞는다');
update auth.users set encrypted_password = extensions.crypt('ReviewPass456!', extensions.gen_salt('bf'))
where id = '00000000-0000-4000-8000-000000000902';
select ok(extensions.crypt('ReviewPass456!', pg_temp.pw('00000000-0000-4000-8000-000000000902')) = pg_temp.pw('00000000-0000-4000-8000-000000000902'),
  '심사용 계정은 비밀번호를 바꿀 수 있다');
select pg_temp.new_user('00000000-0000-4000-8000-000000000903', 'otp9@test.local');
select is(pg_temp.pw('00000000-0000-4000-8000-000000000903'), '', '비밀번호 없는 가입(OTP)은 그대로');
select ok(exists (select 1 from public.profiles where user_id = '00000000-0000-4000-8000-000000000901'), '비밀번호를 비워도 가입 트리거는 프로필을 만든다');

-- ───────── M2, L3. 이메일 정규화와 해시 ─────────

select is(app_private.normalize_email(' Me+x@GoogleMail.com '), 'me@gmail.com', 'googlemail → gmail, +태그 제거, 소문자');
select is(app_private.normalize_email('m.e@gmail.com'), 'me@gmail.com', 'gmail은 점 제거');
select is(app_private.normalize_email('First.Last+news@Example.com'), 'first.last@example.com', 'gmail이 아니면 점은 둔다');
select is(app_private.normalize_email('plain'), 'plain', '@ 없는 값은 소문자, 공백 정리만');
select is(app_private.email_hash('M.E+1@gmail.com'), app_private.email_hash('me@googlemail.com'), '별칭은 같은 해시');
select isnt(app_private.email_hash('me@gmail.com'), encode(extensions.digest('me@gmail.com', 'sha256'), 'hex'), '해시는 소금 없는 sha256이 아니다');

-- 포기 대기 중 탈퇴 → 별칭으로 재가입해도 횟수와 정지가 이어진다
select pg_temp.new_user('00000000-0000-4000-8000-000000000904', 'me9@gmail.com');
select pg_temp.mk('00000000-0000-4000-8000-000000000904', p_now => now());
select app_private.request_giveup('00000000-0000-4000-8000-000000000904',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000904'), now());
select app_private.delete_user_data('00000000-0000-4000-8000-000000000904', now());
delete from auth.users where id = '00000000-0000-4000-8000-000000000904';
select pg_temp.new_user('00000000-0000-4000-8000-000000000905', 'me9+1@gmail.com');
select is((pg_temp.p('00000000-0000-4000-8000-000000000905')).giveup_confirmed_count, 1, '+태그 별칭 재가입: 포기 횟수 승계');
select ok((pg_temp.p('00000000-0000-4000-8000-000000000905')).suspended_until > now() + interval '6 days', '+태그 별칭 재가입: 정지 승계');
select pg_temp.new_user('00000000-0000-4000-8000-000000000906', 'm.e9@gmail.com');
select is((pg_temp.p('00000000-0000-4000-8000-000000000906')).giveup_confirmed_count, 1, '점 별칭 재가입: 포기 횟수 승계');
select ok((pg_temp.p('00000000-0000-4000-8000-000000000906')).suspended_until > now() + interval '6 days', '점 별칭 재가입: 정지 승계');

-- 이메일을 바꾼 뒤 탈퇴하면 옛 이메일과 새 이메일 모두 이어진다
select pg_temp.new_user('00000000-0000-4000-8000-000000000907', 'before9@test.local');
update public.profiles set giveup_confirmed_count = 2 where user_id = '00000000-0000-4000-8000-000000000907';
update auth.users set email = 'after9@test.local' where id = '00000000-0000-4000-8000-000000000907';
select app_private.delete_user_data('00000000-0000-4000-8000-000000000907', now());
select is((select array_agg(giveup_confirmed_count order by giveup_confirmed_count) from public.deleted_accounts
           where email_hash in (app_private.email_hash('before9@test.local'), app_private.email_hash('after9@test.local'))),
  array[2, 2], '가입 이메일과 현재 이메일 해시를 모두 남긴다');

-- ───────── M1. 입력 길이와 개수 ─────────

select pg_temp.new_user('00000000-0000-4000-8000-000000000910', 'limits9@test.local');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910', p_name => repeat('가', 61))$$, 'P0001', 'invalid', '목표 이름 61자 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910', p_name => '   ')$$, 'P0001', 'invalid', '빈 목표 이름 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910', p_reason => repeat('가', 1001))$$, 'P0001', 'reason_long', '처음 이유 1001자 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910',
  p_situation => '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문","extra":"x"}')$$, 'P0001', 'invalid', '상황 키가 4개가 아니면 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910',
  p_situation => jsonb_build_object('place', repeat('가', 101), 'my_role', '손님', 'partner', '바리스타', 'task', '주문'))$$, 'P0001', 'invalid', '상황 값 101자 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910',
  p_situation => '{"place":1,"my_role":"손님","partner":"바리스타","task":"주문"}')$$, 'P0001', 'invalid', '상황 값이 문자열이 아니면 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910', p_subs => '[]')$$, 'P0001', 'invalid', '하위 상황 빈 배열 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910', p_subs => '["a","b"]')$$, 'P0001', 'invalid', '하위 상황 2개 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910', p_subs => '["1","2","3","4","5","6","7","8","9"]')$$, 'P0001', 'invalid', '하위 상황 9개 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910', p_subs => jsonb_build_array('a', 'b', repeat('가', 41)))$$, 'P0001', 'invalid', '하위 상황 41자 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910', p_subs => '["a","b","  "]')$$, 'P0001', 'invalid', '빈 하위 상황 거부');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910', p_subs => '["a","b",3]')$$, 'P0001', 'invalid', '문자열 아닌 하위 상황 거부');
select lives_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000910', p_name => repeat('가', 60), p_reason => repeat('가', 1000),
  p_subs => '["인사", "요청하기", "질문하기", "문제 해결", "마무리"]')$$, '이름 60자, 이유 1000자, 하위 상황 5개(앱 직접 쓰기 기본값)는 통과');
select throws_ok($$insert into public.goals (user_id, name, reason, period_days, weekdays, start_minutes, target_minutes, situation, first_day, settled_day)
  values ('00000000-0000-4000-8000-000000000903', '목표', repeat('가', 1001), 14, '{0,1,2,3,4,5,6}', 1320, 10,
          '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}', current_date, current_date - 1)$$,
  '23514', null, '표 CHECK: 이유 1001자');
select throws_ok($$insert into public.goals (user_id, name, reason, period_days, weekdays, start_minutes, target_minutes, situation, first_day, settled_day)
  values ('00000000-0000-4000-8000-000000000903', '목표', repeat('가', 30), 14, '{0,1,2,3,4,5,6}', 1320, 10,
          '{"place":"카페"}', current_date, current_date - 1)$$,
  '23514', null, '표 CHECK: 상황 모양');

-- 오늘의 이유 500자
select throws_ok($$select app_private.start_day('00000000-0000-4000-8000-000000000910',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000910' and status = 'active'),
  repeat('가', 501), pg_temp.at('2026-03-03 22:00', 'Asia/Seoul'))$$, 'P0001', 'reason_long', '오늘의 이유 501자 거부');
select is((app_private.start_day('00000000-0000-4000-8000-000000000910',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000910' and status = 'active'),
  repeat('가', 500), pg_temp.at('2026-03-03 22:00', 'Asia/Seoul'))).status, 'progress', '오늘의 이유 500자는 통과');

-- ───────── Q2. 04:00 경계를 넘는 일정 ─────────

select pg_temp.new_user('00000000-0000-4000-8000-000000000911', 'boundary9@test.local');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000911', p_start => 230, p_target => 10)$$,
  'P0001', 'crosses_boundary', '03:50 시작 10분 + 회고 3분은 04:00을 넘는다');
select throws_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000911', p_start => 210, p_target => 30)$$,
  'P0001', 'crosses_boundary', '03:30 시작 30분 + 회고 3분은 04:00을 넘는다');
select lives_ok($$select pg_temp.mk('00000000-0000-4000-8000-000000000911', p_start => 227, p_target => 10)$$, '03:47 시작 10분 + 3분은 04:00에 끝나 통과');
select throws_ok($$select app_private.change_schedule('00000000-0000-4000-8000-000000000911',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000911' and status = 'active'),
  220, 20, '{0,1,2,3,4,5,6}', pg_temp.at('2026-03-03 12:00', 'Asia/Seoul'))$$, 'P0001', 'crosses_boundary', '일정 변경도 경계를 넘으면 거부');
select is((app_private.change_schedule('00000000-0000-4000-8000-000000000911',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000911' and status = 'active'),
  1430, 30, '{0,1,2,3,4,5,6}', pg_temp.at('2026-03-03 12:00', 'Asia/Seoul'))).pending_change ->> 'start_minutes', '1430', '23:50 시작 30분은 04:00 전에 끝나 통과');

-- ───────── L1. 서쪽으로 크게 옮기는 시간대 변경 ─────────

select pg_temp.new_user('00000000-0000-4000-8000-000000000912', 'tzwest9@test.local', 'Pacific/Kiritimati');
select is((app_private.set_timezone('00000000-0000-4000-8000-000000000912', 'Etc/GMT+12', pg_temp.at('2026-03-02 22:00', 'Pacific/Kiritimati'))).pending_timezone_from,
  '2026-03-03'::date, '+14에서 -12로 변경 예약(옛 시간대 기준 내일)');
-- 옛 시간대로는 03-03 05:00이지만 새 시간대(-12)로는 03-02 03:00(하루 키 03-01)
select app_private.settle_user('00000000-0000-4000-8000-000000000912', pg_temp.at('2026-03-03 05:00', 'Pacific/Kiritimati'));
select is((pg_temp.p('00000000-0000-4000-8000-000000000912')).timezone, 'Pacific/Kiritimati', '새 시간대가 아직 적용일 전이면 바꾸지 않는다(지난 날을 다시 받지 않음)');
select app_private.settle_user('00000000-0000-4000-8000-000000000912', pg_temp.at('2026-03-03 05:00', 'Etc/GMT+12'));
select is((pg_temp.p('00000000-0000-4000-8000-000000000912')).timezone, 'Etc/GMT+12', '새 시간대로도 적용일이 되면 바꾼다');

select pg_temp.new_user('00000000-0000-4000-8000-000000000913', 'tzwest9b@test.local', 'Pacific/Kiritimati');
select app_private.set_timezone('00000000-0000-4000-8000-000000000913', 'Etc/GMT+12', pg_temp.at('2026-03-02 22:00', 'Pacific/Kiritimati'));
select app_private.settle_all(pg_temp.at('2026-03-03 05:00', 'Pacific/Kiritimati'));
select is((pg_temp.p('00000000-0000-4000-8000-000000000913')).timezone, 'Pacific/Kiritimati', 'cron(settle_all)도 같은 조건');

-- ───────── H2. AI 호출 자리 잡기 ─────────

select pg_temp.new_user('00000000-0000-4000-8000-000000000914', 'ai9@test.local');
select is(app_private.reserve_ai_call('00000000-0000-4000-8000-000000000914', '2026-03-03', 'goal-setup', 'v1', 'm', 2, 1, 1000000) ->> 'ok', 'true', '첫 호출은 자리를 잡는다');
select is((select array[fn, ok::text, prompt_version, model] from public.ai_usage where user_id = '00000000-0000-4000-8000-000000000914'),
  array['goal-setup', 'false', 'v1', 'm'], '잡은 줄은 ok=false로 시작');
select is(app_private.reserve_ai_call('00000000-0000-4000-8000-000000000914', '2026-03-03', 'goal-setup', 'v1', 'm', 2, 1, 1000000),
  '{"ok": false, "limit": "goal-setup"}'::jsonb, '목표 설정 상한');
select is(app_private.reserve_ai_call('00000000-0000-4000-8000-000000000914', '2026-03-03', 'lesson-turn', 'v1', 'm', 2, 1, 1000000) ->> 'ok', 'true', '다른 함수는 하루 상한까지');
select is(app_private.reserve_ai_call('00000000-0000-4000-8000-000000000914', '2026-03-03', 'lesson-turn', 'v1', 'm', 2, 1, 1000000),
  '{"ok": false, "limit": "daily"}'::jsonb, '하루 상한');
select is(app_private.reserve_ai_call('00000000-0000-4000-8000-000000000914', '2026-03-04', 'lesson-turn', 'v1', 'm', 2, 1,
  (select count(*)::int from public.ai_usage where day = '2026-03-04')),
  '{"ok": false, "limit": "global"}'::jsonb, '전체 하루 상한');
insert into public.goals (user_id, name, reason, period_days, weekdays, start_minutes, target_minutes, situation, subsituations, first_day, settled_day, created_at)
values ('00000000-0000-4000-8000-000000000914', '목표', repeat('가', 30), 14, '{0,1,2,3,4,5,6}', 1320, 10,
        '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}', '["a","b","c"]', current_date, current_date - 1, now());
select is(app_private.reserve_ai_call('00000000-0000-4000-8000-000000000914', '2026-03-05', 'goal-setup', 'v1', 'm', 2, 1, 1000000) ->> 'ok', 'true',
  '목표를 만들면 목표 설정 상한을 다시 센다');

-- ───────── L6, 법무 L1. 신고 ─────────

select pg_temp.new_user('00000000-0000-4000-8000-000000000915', 'report9@test.local');
insert into public.messages (id, user_id, phase, role, text)
values ('00000000-0000-4000-8000-00000000915a', '00000000-0000-4000-8000-000000000915', 'setup', 'coach', 'AI가 쓴 문장입니다');
select is((app_private.report_message('00000000-0000-4000-8000-000000000915', '00000000-0000-4000-8000-00000000915a', '이상함')).content,
  'AI가 쓴 문장입니다', '메시지 신고는 신고한 글을 content에 남긴다');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000000915", "role": "authenticated"}', true);
select is((public.report_ai_text('goal-setup', '  목표 설정 답입니다  ', '부적절')).content, '목표 설정 답입니다', '저장하지 않는 AI 글 신고');
select is((select fn from public.message_reports where content = '목표 설정 답입니다'), 'goal-setup', '신고한 함수 이름을 남긴다');
select is((public.report_ai_text('goal-setup', '목표 설정 답입니다', '다른 사유')).reason, '부적절', '같은 글을 다시 신고하면 처음 신고');
select throws_ok($$select public.report_ai_text('nope', '글', null)$$, 'P0001', 'invalid', '모르는 함수 이름 거부');
select throws_ok($$select public.report_ai_text('goal-setup', repeat('가', 2001), null)$$, 'P0001', 'invalid', '글 2001자 거부');
select throws_ok($$select public.report_ai_text('goal-setup', '   ', null)$$, 'P0001', 'invalid', '빈 글 거부');
select throws_ok($$select public.report_ai_text('goal-setup', '글', repeat('가', 501))$$, 'P0001', 'invalid', '사유 501자 거부');
select throws_ok($$select public.reserve_ai_call('00000000-0000-4000-8000-000000000915', current_date, 'goal-setup', 'v', 'm', 1, 1, 1)$$,
  '42501', null, 'reserve_ai_call은 클라이언트가 못 부른다');
reset role;

select app_private.report_ai_text('00000000-0000-4000-8000-000000000915', 'goal-setup', '글 ' || n, null, now()) from generate_series(1, 19) n;
select throws_ok($$select app_private.report_ai_text('00000000-0000-4000-8000-000000000915', 'goal-setup', '스물한 번째 글', null, now())$$,
  'P0001', 'limit', '24시간에 20건까지');
select lives_ok($$select app_private.report_ai_text('00000000-0000-4000-8000-000000000915', 'goal-setup', '하루 지난 글', null, now() + interval '25 hours')$$,
  '24시간이 지나면 다시 신고할 수 있다');

-- 탈퇴해도 신고는 남고 신고자 연결만 끊긴다
select app_private.delete_user_data('00000000-0000-4000-8000-000000000915', now());
delete from auth.users where id = '00000000-0000-4000-8000-000000000915';
select is((select count(*) from public.message_reports where content in ('AI가 쓴 문장입니다', '목표 설정 답입니다') and user_id is null), 2::bigint,
  '탈퇴 뒤에도 신고와 신고한 글이 남는다');
select is((select message_id from public.message_reports where content = 'AI가 쓴 문장입니다'), null, '지운 메시지와의 연결은 끊긴다');

-- ───────── 법무 L6. 인증 기록 90일 ─────────

insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000009a1', '{}', now() - interval '91 days', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000009a2', '{}', now() - interval '89 days', '');
select app_private.purge_old_data(now());
select is((select array_agg(id) from auth.audit_log_entries where id in ('00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000009a2')),
  array['00000000-0000-4000-8000-0000000009a2'::uuid], '90일 지난 인증 기록 삭제');

-- ───────── L2. 기본 권한 ─────────

select ok(not exists (
  select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
  where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
    and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
), 'postgres가 public에 새로 만드는 객체는 anon, authenticated에 자동으로 열리지 않는다');
select ok(has_table_privilege('authenticated', 'public.goals', 'select')
  and has_function_privilege('authenticated', 'public.start_day(uuid, text)', 'execute')
  and has_function_privilege('anon', 'public.login_method(text)', 'execute')
  and has_function_privilege('service_role', 'public.delete_user_data(uuid)', 'execute'),
  '기존 권한은 그대로');
select ok(has_function_privilege('authenticated', 'public.report_ai_text(text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.report_ai_text(text, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.reserve_ai_call(uuid, date, text, text, text, int, int, int)', 'execute')
  and not has_function_privilege('authenticated', 'public.reserve_ai_call(uuid, date, text, text, text, int, int, int)', 'execute'),
  '새 RPC 권한: report_ai_text는 authenticated, reserve_ai_call은 service_role');

-- ───────── L3. pepper가 없으면 해시를 만들지 않고 실패 ─────────

delete from app_private.config where key = 'email_hash_pepper';
select throws_ok($$select app_private.email_hash('x@test.local')$$, 'P0001', 'email_hash_pepper missing', 'pepper가 없으면 실패');

select * from finish();
rollback;
