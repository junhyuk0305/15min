-- 한국 시간 고정 (UX 고도화 U1, 영향지도 A-1).
-- 앱은 기기 시간대를 읽지도 보내지도 않는다. 모든 판정 함수는 profiles.timezone을 읽으므로 값을 Asia/Seoul로 고정하고 바꾸는 입구를 닫는다.
-- 남기는 것: timezone, pending_timezone, pending_timezone_from 열과 apply_timezone, valid_tz.
--   apply_timezone과 settle_all의 시간대 예약 적용은 아래 제약 때문에 늘 0행이다(죽은 코드).
--   pending_* 열을 지우면 apply_timezone 본문($$ 문자열)이 실행할 때 깨진다.

update public.profiles
set timezone = 'Asia/Seoul', pending_timezone = null, pending_timezone_from = null
where timezone is distinct from 'Asia/Seoul' or pending_timezone is not null or pending_timezone_from is not null;

alter table public.profiles
  add constraint profiles_timezone_kst
  check (timezone = 'Asia/Seoul' and pending_timezone is null and pending_timezone_from is null);

-- 가입 트리거: 20261018000600 정의에서 메타데이터 timezone 분기만 뺐다. 옛 클라이언트가 다른 시간대를 보내도 Asia/Seoul로 만든다.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_hash text := app_private.email_hash(new.email);
  v_prev public.deleted_accounts;
  v_suspended boolean;
begin
  if (v_meta -> 'age_confirmed') is distinct from 'true'::jsonb then
    perform app_private.err('age_not_confirmed');
  end if;
  if (v_meta -> 'ai_consent') is distinct from 'true'::jsonb then
    perform app_private.err('ai_consent_required');
  end if;

  if v_hash is not null then
    select * into v_prev from public.deleted_accounts where email_hash = v_hash;
  end if;
  v_suspended := coalesce(v_prev.suspended_until > now(), false);

  insert into public.profiles (
    user_id, email_hash, timezone, giveup_confirmed_count, suspended_until, banned,
    suspended_start_minutes, suspended_target_minutes,
    age_confirmed_at, ai_consent_at, terms_version
  ) values (
    new.id,
    v_hash,
    'Asia/Seoul',
    coalesce(v_prev.giveup_confirmed_count, 0),
    case when v_suspended then v_prev.suspended_until end,
    coalesce(v_prev.giveup_confirmed_count, 0) >= 3,
    case when v_suspended then v_prev.suspended_start_minutes end,
    case when v_suspended then v_prev.suspended_target_minutes end,
    now(),
    now(),
    v_meta ->> 'terms_version'
  );
  return new;
end;
$$;

-- 시간대 변경 RPC 제거. 출시 전이라 옛 빌드 호환은 두지 않는다.
drop function public.set_timezone(text);
drop function app_private.set_timezone(uuid, text, timestamptz);
