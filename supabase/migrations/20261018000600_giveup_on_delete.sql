-- 포기 대기 중 탈퇴와 반성문 시간대 승계
-- 1. 포기 대기 중에 계정을 지우면 포기 확정으로 센다(횟수 +1, 그 확정이 줄 정지).
-- 2. 정지 중 반성문 시간대(원래 시작 시각, 원래 학습 분)를 profiles와 deleted_accounts에 따로 둔다.
--    포기한 목표가 지워져도(탈퇴 후 재가입) 반성문 시간대를 알 수 있게 한다.

alter table public.profiles
  add column suspended_start_minutes int check (suspended_start_minutes between 0 and 1439),
  add column suspended_target_minutes int check (suspended_target_minutes between 10 and 30);

alter table public.deleted_accounts
  add column suspended_start_minutes int,
  add column suspended_target_minutes int;

-- 포기 확정 벌칙 한 번: 횟수 +1, 1 → 7일, 2 → 14일, 3 이상 → 영구 정지. 반성문 시간대는 포기한 목표의 값.
create function app_private.apply_giveup_penalty(p_uid uuid, p_goal uuid, p_now timestamptz)
returns void
language sql
set search_path = ''
as $$
  update public.profiles p
  set giveup_confirmed_count = p.giveup_confirmed_count + 1,
      banned = p.banned or p.giveup_confirmed_count + 1 >= 3,
      suspended_until = case p.giveup_confirmed_count + 1
                          when 1 then p_now + interval '7 days'
                          when 2 then p_now + interval '14 days'
                          else null
                        end,
      suspended_goal_id = p_goal,
      suspended_start_minutes = g.start_minutes,
      suspended_target_minutes = g.target_minutes
  from public.goals g
  where p.user_id = p_uid and g.id = p_goal;
$$;

create or replace function app_private.confirm_goal_giveup(p_goal uuid, p_now timestamptz default now())
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  perform app_private.settle_goal(p_goal, p_now);

  update public.goals
  set status = 'given_up', ended_at = p_now
  where id = p_goal
    and status = 'active'
    and giveup_requested_at is not null
    and giveup_requested_at + interval '24 hours' <= p_now
  returning user_id into v_uid;

  if v_uid is null then
    return false;
  end if;

  perform app_private.apply_giveup_penalty(v_uid, p_goal, p_now);
  return true;
end;
$$;

-- 정지 해제 때 반성문 시간대도 비운다.
create or replace function app_private.release_suspensions(p_now timestamptz default now(), p_uid uuid default null)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.profiles
  set suspended_until = null,
      suspended_goal_id = null,
      suspended_start_minutes = null,
      suspended_target_minutes = null
  where suspended_until is not null
    and suspended_until < p_now
    and (p_uid is null or user_id = p_uid);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- 가입 트리거: 승계하는 정지가 남아 있으면 반성문 시간대도 이어 붙인다.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_tz text := v_meta ->> 'timezone';
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

  if not app_private.valid_tz(v_tz) then
    v_tz := 'Asia/Seoul';
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
    v_tz,
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

-- 탈퇴: 포기 대기 중인 목표가 있으면 먼저 확정 벌칙을 적용하고(p_now 기준) 기록을 남긴다.
drop function app_private.delete_user_data(uuid);

create function app_private.delete_user_data(p_uid uuid, p_now timestamptz default now())
returns void
language plpgsql
set search_path = ''
as $$
declare
  p public.profiles;
  v_goal uuid;
begin
  perform 1 from public.profiles where user_id = p_uid for update;

  for v_goal in
    select id from public.goals
    where user_id = p_uid and status = 'active' and giveup_requested_at is not null
  loop
    perform app_private.apply_giveup_penalty(p_uid, v_goal, p_now);
  end loop;

  select * into p from public.profiles where user_id = p_uid;

  if found and p.email_hash is not null then
    insert into public.deleted_accounts (
      email_hash, giveup_confirmed_count, suspended_until,
      suspended_start_minutes, suspended_target_minutes, deleted_at
    ) values (
      p.email_hash, p.giveup_confirmed_count, p.suspended_until,
      p.suspended_start_minutes, p.suspended_target_minutes, p_now
    )
    on conflict (email_hash) do update
      set giveup_confirmed_count = greatest(public.deleted_accounts.giveup_confirmed_count, excluded.giveup_confirmed_count),
          suspended_until = greatest(public.deleted_accounts.suspended_until, excluded.suspended_until),
          suspended_start_minutes = coalesce(excluded.suspended_start_minutes, public.deleted_accounts.suspended_start_minutes),
          suspended_target_minutes = coalesce(excluded.suspended_target_minutes, public.deleted_accounts.suspended_target_minutes),
          deleted_at = excluded.deleted_at;
  end if;

  delete from public.message_reports where user_id = p_uid;
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

-- 공개 래퍼는 이름과 인자가 그대로라 다시 만들지 않는다(실행 시 새 함수를 찾는다).
revoke all on all functions in schema app_private from public, anon, authenticated;
