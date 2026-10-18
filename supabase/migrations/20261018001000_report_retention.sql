-- 탈퇴한 계정의 신고 보관 기간: 계정과 분리된 날로부터 1년 `[가정]` (결정로그 2절, 처리방침 3절과 3.2)
-- 1. message_reports.detached_at: user_id가 비워지는 순간을 남긴다.
--    delete_user_data의 update와 auth.users 삭제(on delete set null) 두 길 모두 이 트리거를 지난다.
-- 2. purge_old_data가 분리된 지 1년 지난 신고를 지운다. 매일 03:00 cron(graego-purge-old-data)이 부른다.
--    나머지 파기(AI 사용 기록 90일, 탈퇴 기록 1년, 인증 기록 90일)는 마이그레이션 900과 같다.

alter table public.message_reports add column detached_at timestamptz;

-- 이미 분리된 행은 신고 시각을 분리 시각으로 본다(출시 전이라 로컬 시험 데이터뿐이다)
update public.message_reports set detached_at = created_at where user_id is null and detached_at is null;

create function app_private.mark_report_detached()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.user_id is not null and new.user_id is null then
    new.detached_at := coalesce(new.detached_at, now());
  end if;
  return new;
end;
$$;

create trigger message_reports_detached
before update of user_id on public.message_reports
for each row execute function app_private.mark_report_detached();

create or replace function app_private.purge_old_data(p_now timestamptz default now())
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.ai_usage where created_at < p_now - interval '90 days';
  delete from public.deleted_accounts where deleted_at < p_now - interval '1 year';
  delete from public.message_reports where user_id is null and detached_at < p_now - interval '1 year';
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
