-- 로컬 개발용 시드. `npx supabase db reset` 때 실행된다. 운영에는 쓰지 않는다.
-- 운영 심사 계정은 supabase/scripts/create-review-account.sql 을 쓴다.

-- 심사용 데모 계정 이메일. login_method()가 이 이메일에만 'password'를 돌려준다.
insert into app_private.config (key, value)
values ('review_email', 'review@graego.app')
on conflict (key) do update set value = excluded.value;

-- 데모 사용자. 비밀번호는 로컬 전용 값이다(운영 비밀값 아님).
-- raw_user_meta_data의 age_confirmed(만 18세 이상)와 ai_consent가 있어야 가입 트리거가 프로필을 만든다.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'review@graego.app',
  extensions.crypt('local-review-only', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"age_confirmed": true, "ai_consent": true, "timezone": "Asia/Seoul", "terms_version": "2026-10-18"}',
  now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(),
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  jsonb_build_object('sub', 'a0000000-0000-4000-8000-000000000001', 'email', 'review@graego.app', 'email_verified', true),
  'email',
  now(), now(), now()
);

-- 활성 목표 하나. 오늘부터 매일, 04:01 시작이라 바로 학습을 시작할 수 있다.
with t as (select app_private.day_key(now(), 'Asia/Seoul') as today)
insert into public.goals (
  id, user_id, name, reason, period_days, weekdays, start_minutes, target_minutes,
  situation, subsituations, first_day, settled_day
)
select
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  '카페에서 영어로 주문하기',
  '해외 출장 때 카페에서 주문을 못 해서 동료에게 부탁했습니다. 다음에는 혼자 주문하고 싶습니다.',
  14,
  array[0, 1, 2, 3, 4, 5, 6],
  241,
  10,
  '{"place": "카페", "my_role": "손님", "partner": "바리스타", "task": "원하는 음료를 주문하고 받기"}',
  '["입장과 인사", "메뉴 묻기", "음료 주문", "옵션 고르기", "결제", "음료 받기"]',
  t.today,
  t.today - 1
from t;

insert into public.episodes (goal_id, index, user_id, subsituations)
select g.id, 0, g.user_id, g.subsituations
from public.goals g
where g.id = 'b0000000-0000-4000-8000-000000000001';
