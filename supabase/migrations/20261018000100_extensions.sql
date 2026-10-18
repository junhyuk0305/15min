-- 확장과 내부 스키마
-- pgcrypto: 이메일 해시(sha256). pg_cron: 포기 확정, 정지 해제, 판정 예약 작업.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- app_private: API에 노출하지 않는 스키마. 클라이언트 역할에는 usage를 주지 않는다.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- 서버 설정값. 예: review_email(심사용 데모 계정 이메일)
create table app_private.config (
  key text primary key,
  value text not null
);
revoke all on table app_private.config from public, anon, authenticated;
