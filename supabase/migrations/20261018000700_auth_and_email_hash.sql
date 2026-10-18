-- 보안 보강 1: 기본 권한, 비밀번호는 심사용 계정만, 이메일 해시(정규화 + HMAC), 탈퇴 때 신고 보존
-- 1. public에 새로 만드는 표, 시퀀스, 함수는 클라이언트 역할에 자동으로 열리지 않는다. 필요한 권한은 따로 준다.
-- 2. auth.users에 비밀번호가 들어오면 심사용 이메일이 아닐 때 비운다.
--    GoTrue는 이메일 OTP 가입 때도 임의 비밀번호를 넣는다(로컬 GoTrue v2.197.0에서 확인, 60자 bcrypt).
--    그래서 오류로 막으면 OTP 가입이 깨진다. 비우면 비밀번호 로그인만 실패하고 OTP는 그대로 된다.
-- 3. 이메일 해시: 소문자, 앞뒤 공백 제거, +태그 제거, gmail은 점 제거와 googlemail → gmail.
--    해시는 HMAC-SHA256. 키(pepper)는 app_private.config 'email_hash_pepper'. 이 마이그레이션이 환경마다 임의 값을 만든다.
-- 4. 탈퇴해도 신고는 남긴다. 신고자 연결(user_id)만 끊고, 신고한 AI 글은 content에 남는다.

-- ───────── 1. 기본 권한 ─────────

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- ───────── 2. 비밀번호는 심사용 계정만 ─────────

create function app_private.password_review_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.encrypted_password, '') <> ''
     and not exists (
       select 1 from app_private.config c
       where c.key = 'review_email'
         and btrim(c.value) <> ''
         and lower(btrim(c.value)) = lower(btrim(coalesce(new.email, '')))
     ) then
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

create trigger password_review_only
  before insert or update of encrypted_password on auth.users
  for each row execute function app_private.password_review_only();

-- 이미 있는 계정의 비밀번호도 비운다(심사용 계정 제외).
update auth.users u
set encrypted_password = ''
where coalesce(u.encrypted_password, '') <> ''
  and not exists (
    select 1 from app_private.config c
    where c.key = 'review_email' and btrim(c.value) <> '' and lower(btrim(c.value)) = lower(btrim(coalesce(u.email, '')))
  );

-- ───────── 3. 이메일 해시 ─────────

-- 별칭을 하나로 접는다. 예: Me+x@GoogleMail.com, m.e@gmail.com → me@gmail.com
create function app_private.normalize_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(btrim(p_email));
  v_at int;
  v_local text;
  v_domain text;
begin
  if v is null or strpos(v, '@') = 0 then
    return v;
  end if;
  v_at := char_length(v) - strpos(reverse(v), '@') + 1; -- 마지막 @
  v_local := left(v, v_at - 1);
  v_domain := substr(v, v_at + 1);
  if strpos(v_local, '+') > 0 then
    v_local := left(v_local, strpos(v_local, '+') - 1);
  end if;
  if v_domain = 'googlemail.com' then
    v_domain := 'gmail.com';
  end if;
  if v_domain = 'gmail.com' then
    v_local := replace(v_local, '.', '');
  end if;
  return v_local || '@' || v_domain;
end;
$$;

insert into app_private.config (key, value)
values ('email_hash_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- HMAC-SHA256(정규화한 이메일, pepper). pepper가 없으면 조용히 null을 내지 않고 실패한다.
create or replace function app_private.email_hash(p_email text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_pepper text;
begin
  if p_email is null then
    return null;
  end if;
  select c.value into v_pepper from app_private.config c where c.key = 'email_hash_pepper';
  if coalesce(v_pepper, '') = '' then
    raise exception 'email_hash_pepper missing';
  end if;
  return encode(extensions.hmac(app_private.normalize_email(p_email), v_pepper, 'sha256'), 'hex');
end;
$$;

-- 기존 프로필 해시를 새 방식으로 다시 계산한다. 출시 전이라 옛 deleted_accounts 해시는 맞추지 않는다.
update public.profiles p
set email_hash = app_private.email_hash(u.email)
from auth.users u
where u.id = p.user_id;

-- ───────── 4. 신고 보존 ─────────

alter table public.message_reports
  add column content text,
  add column fn text;
alter table public.message_reports alter column user_id drop not null;
alter table public.message_reports drop constraint message_reports_user_id_fkey;
alter table public.message_reports
  add constraint message_reports_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

-- 탈퇴: 가입 때 해시와 지금 이메일의 해시를 모두 남긴다(이메일을 바꾼 계정도 이어 붙게).
-- 신고는 지우지 않고 user_id만 비운다.
create or replace function app_private.delete_user_data(p_uid uuid, p_now timestamptz default now())
returns void
language plpgsql
set search_path = ''
as $$
declare
  p public.profiles;
  v_goal uuid;
  v_email text;
  v_hash text;
begin
  perform 1 from public.profiles where user_id = p_uid for update;

  for v_goal in
    select id from public.goals
    where user_id = p_uid and status = 'active' and giveup_requested_at is not null
  loop
    perform app_private.apply_giveup_penalty(p_uid, v_goal, p_now);
  end loop;

  select * into p from public.profiles where user_id = p_uid;

  if p.user_id is not null then
    select u.email into v_email from auth.users u where u.id = p_uid;
    for v_hash in
      select distinct h from unnest(array[app_private.email_hash(v_email), p.email_hash]) h where h is not null
    loop
      insert into public.deleted_accounts (
        email_hash, giveup_confirmed_count, suspended_until,
        suspended_start_minutes, suspended_target_minutes, deleted_at
      ) values (
        v_hash, p.giveup_confirmed_count, p.suspended_until,
        p.suspended_start_minutes, p.suspended_target_minutes, p_now
      )
      on conflict (email_hash) do update
        set giveup_confirmed_count = greatest(public.deleted_accounts.giveup_confirmed_count, excluded.giveup_confirmed_count),
            suspended_until = greatest(public.deleted_accounts.suspended_until, excluded.suspended_until),
            suspended_start_minutes = coalesce(excluded.suspended_start_minutes, public.deleted_accounts.suspended_start_minutes),
            suspended_target_minutes = coalesce(excluded.suspended_target_minutes, public.deleted_accounts.suspended_target_minutes),
            deleted_at = excluded.deleted_at;
    end loop;
  end if;

  update public.message_reports set user_id = null where user_id = p_uid;
  delete from public.item_events where user_id = p_uid;
  delete from public.items where user_id = p_uid;
  delete from public.messages where user_id = p_uid;
  delete from public.episodes where user_id = p_uid;
  delete from public.days where user_id = p_uid;
  delete from public.reflections where user_id = p_uid;
  delete from public.ai_usage where user_id = p_uid;
  update public.profiles set suspended_goal_id = null where user_id = p_uid;
  delete from public.goals where user_id = p_uid;
  delete from public.profiles where user_id = p_uid;
end;
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;
