-- 이메일 인증 없이 이메일+비밀번호로 가입한다(2026-10-27 오너 결정).
-- 비밀번호를 심사용 계정만 남기던 트리거(20261018000700 2절)를 지운다. 이제 모든 계정이 비밀번호로 로그인한다.
-- login_method RPC는 앱이 더 부르지 않지만 SQL 테스트가 쓰므로 남긴다.

drop trigger if exists password_review_only on auth.users;
drop function if exists app_private.password_review_only();
