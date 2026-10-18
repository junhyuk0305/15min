-- 예약 작업(pg_cron). 같은 이름으로 다시 schedule하면 덮어쓴다.
-- 5분마다: 24시간 지난 포기 확정, 끝난 정지 해제
-- 매일 03:00 UTC(12:00 KST): 보관 기간이 지난 AI 사용 기록(90일)과 탈퇴 기록(1년) 삭제
-- 매시 정각: 시간대별 04:00 경계를 지난 날 판정(failed, rest, giveup_wait)과 쿠폰 진행 갱신
select cron.schedule('graego-confirm-giveups', '*/5 * * * *', $$select app_private.confirm_giveups(now())$$);
select cron.schedule('graego-release-suspensions', '*/5 * * * *', $$select app_private.release_suspensions(now())$$);
select cron.schedule('graego-settle-all', '0 * * * *', $$select app_private.settle_all(now())$$);
select cron.schedule('graego-purge-old-data', '0 3 * * *', $$select app_private.purge_old_data(now())$$);
