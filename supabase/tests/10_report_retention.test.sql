-- 탈퇴한 계정의 신고: 분리 시각을 남기고, 1년이 지나면 매일 파기에서 지운다
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.new_user(p_id uuid, p_email text)
returns uuid language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    '{"age_confirmed": true, "ai_consent": true}', now(), now())
  returning id
$$;

select has_column('public', 'message_reports', 'detached_at', '신고에 분리 시각 열이 있다');

select pg_temp.new_user('00000000-0000-4000-8000-000000001001', 'keep10@test.local');
select pg_temp.new_user('00000000-0000-4000-8000-000000001002', 'delete10@test.local');
select pg_temp.new_user('00000000-0000-4000-8000-000000001003', 'authdel10@test.local');
select app_private.report_ai_text('00000000-0000-4000-8000-000000001001', 'goal-setup', '남는 계정의 신고 글', null, now());
select app_private.report_ai_text('00000000-0000-4000-8000-000000001002', 'goal-setup', '탈퇴 계정의 신고 글', null, now());
select app_private.report_ai_text('00000000-0000-4000-8000-000000001003', 'goal-setup', '인증 삭제 계정의 신고 글', null, now());

-- 앱의 계정 삭제(delete-account → delete_user_data)와 auth.users 직접 삭제(on delete set null)
select app_private.delete_user_data('00000000-0000-4000-8000-000000001002', now());
delete from auth.users where id = '00000000-0000-4000-8000-000000001003';

select isnt((select detached_at from public.message_reports where content = '탈퇴 계정의 신고 글'), null,
  'delete_user_data로 분리되면 분리 시각을 남긴다');
select isnt((select detached_at from public.message_reports where content = '인증 삭제 계정의 신고 글'), null,
  'auth.users 삭제로 분리되어도 분리 시각을 남긴다');
select is((select detached_at from public.message_reports where content = '남는 계정의 신고 글'), null,
  '계정이 남아 있으면 분리 시각이 없다');

select app_private.purge_old_data(now() + interval '364 days');
select is((select count(*) from public.message_reports where content in ('탈퇴 계정의 신고 글', '인증 삭제 계정의 신고 글')), 2::bigint,
  '분리된 지 1년 전이면 남긴다');

select app_private.purge_old_data(now() + interval '1 year 1 day');
select is((select count(*) from public.message_reports where content in ('탈퇴 계정의 신고 글', '인증 삭제 계정의 신고 글')), 0::bigint,
  '분리된 지 1년이 지나면 지운다');
select is((select count(*) from public.message_reports where content = '남는 계정의 신고 글'), 1::bigint,
  '계정이 남아 있는 신고는 오래돼도 지우지 않는다');

-- 분리 시각은 처음 한 번만 정한다
update public.message_reports set reason = '다시 고침' where content = '남는 계정의 신고 글';
select is((select detached_at from public.message_reports where content = '남는 계정의 신고 글'), null,
  'user_id를 바꾸지 않는 수정은 분리 시각을 건드리지 않는다');

select ok(exists (select 1 from cron.job where jobname = 'graego-purge-old-data'), '매일 파기 작업이 등록되어 있다');

select * from finish();
rollback;
