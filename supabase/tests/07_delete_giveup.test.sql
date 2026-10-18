-- 포기 대기 중 탈퇴는 포기 확정으로 센다. 반성문 시간대(원래 시작 시각, 학습 분)는 탈퇴와 재가입을 넘어 이어진다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

create function pg_temp.new_user(p_id uuid, p_email text) returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          '{"age_confirmed": true, "ai_consent": true, "timezone": "Asia/Seoul"}', now(), now())
  returning id
$$;

-- 21:30 시작, 20분 목표
create function pg_temp.mk_goal(p_uid uuid, p_now timestamptz) returns uuid language sql as $$
  select (app_private.create_goal(
    p_uid, '카페 주문', '출장 가서 카페에서 혼자 주문하고 싶어서 시작합니다', 14, '{0,1,2,3,4,5,6}', 1290, 20,
    '{"place":"카페","my_role":"손님","partner":"바리스타","task":"주문"}', '["인사","주문"]', p_now)).id
$$;

create function pg_temp.p(p_uid uuid) returns public.profiles language sql as $$
  select * from public.profiles where user_id = p_uid
$$;
create function pg_temp.da(p_email text) returns public.deleted_accounts language sql as $$
  select * from public.deleted_accounts where email_hash = app_private.email_hash(p_email)
$$;

create temp table t (k text primary key, at timestamptz);
insert into t values ('now', now());

-- 1. 정상 확정도 반성문 시간대를 남기고, 해제 때 비운다
select pg_temp.new_user('00000000-0000-4000-8000-000000000701', 'conf@test.local');
select pg_temp.mk_goal('00000000-0000-4000-8000-000000000701', now() - interval '3 days');
select app_private.request_giveup('00000000-0000-4000-8000-000000000701',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000701'), now() - interval '2 days');
select app_private.confirm_giveups(now());
select is(array[(pg_temp.p('00000000-0000-4000-8000-000000000701')).suspended_start_minutes,
                (pg_temp.p('00000000-0000-4000-8000-000000000701')).suspended_target_minutes],
  array[1290, 20], '확정하면 반성문 시간대(21:30, 20분) 저장');
select app_private.release_suspensions(now() + interval '8 days');
select is(array[(pg_temp.p('00000000-0000-4000-8000-000000000701')).suspended_start_minutes,
                (pg_temp.p('00000000-0000-4000-8000-000000000701')).suspended_target_minutes],
  array[null, null]::int[], '정지 해제 때 반성문 시간대 비움');

-- 2. 포기 대기 중 탈퇴(첫 포기) → 확정 1회, 7일 정지, 시간대 보관
select pg_temp.new_user('00000000-0000-4000-8000-000000000702', 'flee@test.local');
select pg_temp.mk_goal('00000000-0000-4000-8000-000000000702', now() - interval '3 days');
select app_private.request_giveup('00000000-0000-4000-8000-000000000702',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000702'), now() - interval '1 hour');
select app_private.delete_user_data('00000000-0000-4000-8000-000000000702', (select at from t where k = 'now'));
select is((pg_temp.da('flee@test.local')).giveup_confirmed_count, 1, '대기 중 탈퇴는 확정 1회로 센다');
select is((pg_temp.da('flee@test.local')).suspended_until, (select at from t where k = 'now') + interval '7 days', '그 확정이 줄 7일 정지(p_now 기준)');
select is((pg_temp.da('flee@test.local')).suspended_start_minutes, 1290, '탈퇴 기록에 원래 시작 시각');
select is((pg_temp.da('flee@test.local')).suspended_target_minutes, 20, '탈퇴 기록에 원래 학습 분');
select is((select count(*) from public.goals where user_id = '00000000-0000-4000-8000-000000000702'), 0::bigint, '개인 데이터는 그대로 삭제');

-- 재가입: 정지와 반성문 시간대를 이어 붙인다
delete from auth.users where id = '00000000-0000-4000-8000-000000000702';
select pg_temp.new_user('00000000-0000-4000-8000-000000000712', 'Flee@test.local');
select is((pg_temp.p('00000000-0000-4000-8000-000000000712')).giveup_confirmed_count, 1, '재가입: 횟수 1 승계');
select is((pg_temp.p('00000000-0000-4000-8000-000000000712')).suspended_until, (select at from t where k = 'now') + interval '7 days', '재가입: 정지 종료일 승계');
select is((pg_temp.p('00000000-0000-4000-8000-000000000712')).suspended_goal_id, null, '재가입: 원래 목표는 없다');
select is(array[(pg_temp.p('00000000-0000-4000-8000-000000000712')).suspended_start_minutes,
                (pg_temp.p('00000000-0000-4000-8000-000000000712')).suspended_target_minutes],
  array[1290, 20], '재가입: 반성문 시간대 승계');
select throws_ok($$select pg_temp.mk_goal('00000000-0000-4000-8000-000000000712', now())$$, 'P0001', 'suspended', '재가입해도 정지 중이면 새 목표 불가');

-- 3. 정지가 이미 끝난 탈퇴 기록은 시간대를 이어 붙이지 않는다
insert into public.deleted_accounts (email_hash, giveup_confirmed_count, suspended_until, suspended_start_minutes, suspended_target_minutes)
values (app_private.email_hash('past@test.local'), 1, now() - interval '1 day', 1290, 20);
select pg_temp.new_user('00000000-0000-4000-8000-000000000703', 'past@test.local');
select is(array[(pg_temp.p('00000000-0000-4000-8000-000000000703')).suspended_start_minutes,
                (pg_temp.p('00000000-0000-4000-8000-000000000703')).suspended_target_minutes],
  array[null, null]::int[], '끝난 정지는 시간대를 승계하지 않는다');
select is((pg_temp.p('00000000-0000-4000-8000-000000000703')).suspended_until, null, '끝난 정지는 승계하지 않는다');

-- 4. 확정 2회 계정이 대기 중 탈퇴 → 3회, 영구 정지
select pg_temp.new_user('00000000-0000-4000-8000-000000000704', 'third@test.local');
update public.profiles set giveup_confirmed_count = 2 where user_id = '00000000-0000-4000-8000-000000000704';
select pg_temp.mk_goal('00000000-0000-4000-8000-000000000704', now() - interval '3 days');
select app_private.request_giveup('00000000-0000-4000-8000-000000000704',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000704'), now() - interval '1 hour');
select app_private.delete_user_data('00000000-0000-4000-8000-000000000704', now());
select is((pg_temp.da('third@test.local')).giveup_confirmed_count, 3, '3회째 확정으로 센다');
select is((pg_temp.da('third@test.local')).suspended_until, null, '영구 정지는 기간이 없다');
delete from auth.users where id = '00000000-0000-4000-8000-000000000704';
select pg_temp.new_user('00000000-0000-4000-8000-000000000714', 'third@test.local');
select is((pg_temp.p('00000000-0000-4000-8000-000000000714')).banned, true, '재가입하면 영구 정지');

-- 5. 포기 신청이 없으면 탈퇴해도 횟수는 그대로
select pg_temp.new_user('00000000-0000-4000-8000-000000000705', 'calm@test.local');
select pg_temp.mk_goal('00000000-0000-4000-8000-000000000705', now() - interval '3 days');
select app_private.delete_user_data('00000000-0000-4000-8000-000000000705', now());
select is((pg_temp.da('calm@test.local')).giveup_confirmed_count, 0, '대기가 없으면 횟수 그대로');
select is((pg_temp.da('calm@test.local')).suspended_until, null, '대기가 없으면 정지 없음');

-- 6. 철회한 뒤 탈퇴는 확정으로 세지 않는다
select pg_temp.new_user('00000000-0000-4000-8000-000000000706', 'back@test.local');
select pg_temp.mk_goal('00000000-0000-4000-8000-000000000706', now() - interval '3 days');
select app_private.request_giveup('00000000-0000-4000-8000-000000000706',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000706'), now() - interval '2 hours');
select app_private.withdraw_giveup('00000000-0000-4000-8000-000000000706',
  (select id from public.goals where user_id = '00000000-0000-4000-8000-000000000706'), now() - interval '1 hour');
select app_private.delete_user_data('00000000-0000-4000-8000-000000000706', now());
select is((pg_temp.da('back@test.local')).giveup_confirmed_count, 0, '철회 뒤 탈퇴는 횟수 그대로');

-- 7. 공개 래퍼(service role)는 인자 하나로 그대로 동작
select pg_temp.new_user('00000000-0000-4000-8000-000000000707', 'wrap@test.local');
set local role service_role;
select public.delete_user_data('00000000-0000-4000-8000-000000000707');
reset role;
select is((select count(*) from public.profiles where user_id = '00000000-0000-4000-8000-000000000707'), 0::bigint, 'service role 래퍼로 탈퇴 데이터 삭제');

select * from finish();
rollback;
