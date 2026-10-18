-- 운영용 심사 데모 계정 만들기 (App Store, Google Play 심사)
-- 비밀값을 이 파일에 쓰지 않는다. psql 변수로 넘긴다.
--
-- 실행 예:
--   psql "$SUPABASE_DB_URL" \
--     -v review_email='<심사용 이메일>' \
--     -v review_password='<스토어 심사 메모에 적을 비밀번호>' \
--     -f supabase/scripts/create-review-account.sql
--
-- 하는 일:
--   1. app_private.config review_email 저장 (login_method가 이 이메일에만 password를 돌려준다)
--   2. auth.users, auth.identities에 확인된 이메일 계정 생성 (age_confirmed, ai_consent 메타데이터 포함)
--   3. 활성 목표 하나: 오늘부터 매일, 04:01 시작, 10분, 상황 카페 주문
-- 같은 이메일 계정이 이미 있으면 2, 3은 건너뛴다. 비밀번호를 바꾸려면 대시보드에서 바꾼다.

\set ON_ERROR_STOP on

begin;

insert into app_private.config (key, value)
values ('review_email', lower(btrim(:'review_email')))
on conflict (key) do update set value = excluded.value;

with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  )
  select
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    lower(btrim(:'review_email')),
    extensions.crypt(:'review_password', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"age_confirmed": true, "ai_consent": true, "timezone": "Asia/Seoul", "terms_version": "review"}',
    now(), now(),
    '', '', '', '', '', '', '', ''
  where not exists (select 1 from auth.users where email = lower(btrim(:'review_email')))
  returning id, email
),
new_identity as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text,
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', now(), now(), now()
  from new_user u
  returning user_id
)
select count(*) as created_users from new_identity;

-- 목표: 활성 목표가 없을 때만
insert into public.goals (
  user_id, name, reason, period_days, weekdays, start_minutes, target_minutes,
  situation, subsituations, first_day, settled_day
)
select
  u.id,
  '카페에서 영어로 주문하기',
  '해외 출장 때 카페에서 주문을 못 해서 동료에게 부탁했습니다. 다음에는 혼자 주문하고 싶습니다.',
  14,
  array[0, 1, 2, 3, 4, 5, 6],
  241,
  10,
  '{"place": "카페", "my_role": "손님", "partner": "바리스타", "task": "원하는 음료를 주문하고 받기"}',
  '["입장과 인사", "메뉴 묻기", "음료 주문", "옵션 고르기", "결제", "음료 받기"]',
  app_private.day_key(now(), 'Asia/Seoul'),
  app_private.day_key(now(), 'Asia/Seoul') - 1
from auth.users u
where u.email = lower(btrim(:'review_email'))
  and not exists (select 1 from public.goals g where g.user_id = u.id and g.status = 'active');

insert into public.episodes (goal_id, index, user_id, subsituations)
select g.id, 0, g.user_id, g.subsituations
from public.goals g
join auth.users u on u.id = g.user_id
where u.email = lower(btrim(:'review_email'))
  and g.status = 'active'
on conflict (goal_id, index) do nothing;

commit;
