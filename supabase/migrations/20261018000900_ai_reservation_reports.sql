-- 보안 보강 3: AI 호출 자리 잡기(동시 요청 상한), 신고 내용 보존과 목표 설정 대화 신고, 인증 기록 보관 기간
-- 1. reserve_ai_call: Edge Function이 모델을 부르기 직전마다(재시도, 재요청 포함) 부른다.
--    사용자별 advisory lock 안에서 하루 상한, 목표 설정 상한(마지막 목표 생성 이후), 전체 하루 상한을 세고
--    ai_usage에 한 줄(ok=false)을 넣는다. 호출이 끝나면 Edge가 그 줄에 토큰, 지연, ok를 적는다.
--    전체 상한은 사용자 lock 밖의 다른 사용자 요청과 겹칠 수 있어 동시 요청 수만큼 넘을 수 있다(비용 안전판 용도).
-- 2. report_message는 신고한 글을 content에 복사한다. report_ai_text는 저장되지 않는 AI 글(목표 설정 대화)을 신고한다.
-- 3. purge_old_data가 auth.audit_log_entries 90일 지난 행도 지운다.

-- ───────── 1. AI 호출 자리 잡기 ─────────

create index ai_usage_day_idx on public.ai_usage (day);

create function app_private.reserve_ai_call(
  p_uid uuid,
  p_day date,
  p_fn text,
  p_prompt_version text,
  p_model text,
  p_daily_limit int,
  p_goal_setup_limit int,
  p_global_limit int
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_since timestamptz;
  v_id bigint;
begin
  if p_uid is null or p_day is null or coalesce(p_fn, '') = ''
     or p_daily_limit is null or p_goal_setup_limit is null or p_global_limit is null then
    perform app_private.err('invalid');
  end if;
  -- 같은 사용자의 동시 요청은 여기서 한 줄로 선다. 트랜잭션이 끝나면 풀린다.
  perform pg_advisory_xact_lock(hashtext('ai_usage:' || p_uid::text));

  if (select count(*) from public.ai_usage where user_id = p_uid and day = p_day) >= p_daily_limit then
    return jsonb_build_object('ok', false, 'limit', 'daily');
  end if;
  if p_fn = 'goal-setup' then
    select max(created_at) into v_since from public.goals where user_id = p_uid;
    if (select count(*) from public.ai_usage
        where user_id = p_uid and fn = 'goal-setup' and (v_since is null or created_at > v_since)) >= p_goal_setup_limit then
      return jsonb_build_object('ok', false, 'limit', 'goal-setup');
    end if;
  end if;
  if (select count(*) from public.ai_usage where day = p_day) >= p_global_limit then
    return jsonb_build_object('ok', false, 'limit', 'global');
  end if;

  insert into public.ai_usage (user_id, day, fn, prompt_version, model, ok)
  values (p_uid, p_day, p_fn, p_prompt_version, p_model, false)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ───────── 2. 신고 ─────────

-- 신고한 글을 content에 남긴다. 탈퇴 뒤에도 검토할 수 있게.
create or replace function app_private.report_message(p_uid uuid, p_message_id uuid, p_reason text)
returns public.message_reports
language plpgsql
set search_path = ''
as $$
declare
  r public.message_reports;
  v_reason text := nullif(app_private.clean(p_reason), '');
  v_text text;
begin
  if p_uid is null or p_message_id is null or char_length(coalesce(v_reason, '')) > 500 then
    perform app_private.err('invalid');
  end if;

  select * into r from public.message_reports
  where user_id = p_uid and (message_id = p_message_id or reflection_id = p_message_id);
  if found then
    return r;
  end if;

  select m.text into v_text from public.messages m
  where m.id = p_message_id and m.user_id = p_uid and m.role in ('partner', 'coach', 'system');
  if found then
    insert into public.message_reports (user_id, message_id, reason, content)
    values (p_uid, p_message_id, v_reason, v_text)
    returning * into r;
    return r;
  end if;

  select f.text into v_text from public.reflections f
  where f.id = p_message_id and f.user_id = p_uid and f.role = 'coach';
  if found then
    insert into public.message_reports (user_id, reflection_id, reason, content, fn)
    values (p_uid, p_message_id, v_reason, v_text, 'reflection')
    returning * into r;
    return r;
  end if;

  perform app_private.err('not_found');
  return r;
end;
$$;

-- 서버에 저장하지 않는 AI 글(목표 설정 대화 답) 신고. 글 2000자, 사유 500자, 24시간에 20건.
-- 같은 함수의 같은 글을 다시 신고하면 처음 신고를 돌려준다.
create function app_private.report_ai_text(p_uid uuid, p_fn text, p_text text, p_reason text, p_now timestamptz)
returns public.message_reports
language plpgsql
set search_path = ''
as $$
declare
  r public.message_reports;
  v_text text := app_private.clean(p_text);
  v_reason text := nullif(app_private.clean(p_reason), '');
begin
  if p_uid is null
     or p_fn is null or p_fn not in ('goal-setup', 'lesson-turn', 'review-quiz', 'retro', 'reflection')
     or v_text = '' or char_length(v_text) > 2000
     or char_length(coalesce(v_reason, '')) > 500 then
    perform app_private.err('invalid');
  end if;
  if not exists (select 1 from public.profiles where user_id = p_uid) then
    perform app_private.err('not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext('report:' || p_uid::text));

  select * into r from public.message_reports
  where user_id = p_uid and message_id is null and reflection_id is null and fn = p_fn and content = v_text
  order by created_at
  limit 1;
  if found then
    return r;
  end if;
  if (select count(*) from public.message_reports
      where user_id = p_uid and message_id is null and reflection_id is null
        and created_at > p_now - interval '24 hours') >= 20 then
    perform app_private.err('limit');
  end if;

  insert into public.message_reports (user_id, fn, content, reason, created_at)
  values (p_uid, p_fn, v_text, v_reason, p_now)
  returning * into r;
  return r;
end;
$$;

-- ───────── 3. 보관 기간 ─────────

-- AI 사용 기록 90일, 탈퇴 기록 1년, 인증 기록(auth.audit_log_entries) 90일.
-- 인증 기록 표가 없거나 지울 권한이 없으면 경고만 남기고 나머지는 지운다.
create or replace function app_private.purge_old_data(p_now timestamptz default now())
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.ai_usage where created_at < p_now - interval '90 days';
  delete from public.deleted_accounts where deleted_at < p_now - interval '1 year';
  if to_regclass('auth.audit_log_entries') is not null then
    begin
      execute 'delete from auth.audit_log_entries where created_at < $1' using p_now - interval '90 days';
    exception when insufficient_privilege then
      raise warning 'purge_old_data: no privilege on auth.audit_log_entries';
    end;
  end if;
end;
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;

-- ───────── 공개 래퍼 ─────────

-- Edge Function(service role)만 실행한다.
create function public.reserve_ai_call(
  p_user uuid,
  p_day date,
  p_fn text,
  p_prompt_version text,
  p_model text,
  p_daily_limit int,
  p_goal_setup_limit int,
  p_global_limit int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.reserve_ai_call(p_user, p_day, p_fn, p_prompt_version, p_model, p_daily_limit, p_goal_setup_limit, p_global_limit);
end;
$$;

create function public.report_ai_text(p_fn text, p_text text, p_reason text)
returns public.message_reports
language plpgsql
security definer
set search_path = ''
as $$
begin
  return app_private.report_ai_text(auth.uid(), p_fn, p_text, p_reason, now());
end;
$$;

revoke execute on function
  public.reserve_ai_call(uuid, date, text, text, text, int, int, int),
  public.report_ai_text(text, text, text)
from public, anon, authenticated;

grant execute on function public.reserve_ai_call(uuid, date, text, text, text, int, int, int) to service_role;
grant execute on function public.report_ai_text(text, text, text) to authenticated;
