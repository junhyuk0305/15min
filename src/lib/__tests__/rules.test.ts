import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as R from '../rules';
import {
  achieveDay,
  addDays,
  addStudyDays,
  canAchieve,
  canCompleteDay,
  canSend,
  completeDayCoupon,
  couponThreshold,
  cycleOf,
  dayKeyOf,
  daysToNextCoupon,
  firstDayFor,
  giveupExpired,
  giveupWaitNotifications,
  goalInputError,
  homeState,
  isIdle,
  isStudyDay,
  noteValid,
  phaseAt,
  phaseBounds,
  settingsFor,
  settle,
  spendCoupon,
  streakOf,
  suspensionFor,
  weekdayOf,
  zonedTime,
  type DayStatus,
  type Goal,
} from '../rules';

const SEOUL = 'Asia/Seoul';
const LA = 'America/Los_Angeles';
const H = 3600_000;
const seoul = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);
// LA 2026: PDT(UTC-7) 03-08 02:00 ~ 11-01 02:00, 나머지 PST(UTC-8)
const la = (y: number, mo: number, d: number, h: number, mi: number, off: 7 | 8) => Date.UTC(y, mo - 1, d, h + off, mi);

const WEEKDAYS = [1, 2, 3, 4, 5]; // 월~금. 2026-10-19는 월요일

const mkGoal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g',
  name: '스타벅스에서 막힘없이 주문하기',
  reason: '외국 손님 앞에서 주문을 막힘없이 하고 싶어서',
  periodDays: 14,
  weekdays: WEEKDAYS,
  startMinutes: 22 * 60,
  targetMinutes: 15,
  situation: { place: '카페', myRole: '손님', partner: '바리스타', task: '주문' },
  firstDay: '2026-10-19',
  status: 'active',
  coupons: 3,
  couponStreakGoalWeeks: 2,
  couponProgressDays: 0,
  settledDay: '2026-10-18',
  pendingChange: null,
  giveupRequestedAt: null,
  createdAt: seoul(2026, 10, 18, 9),
  endedAt: null,
  ...over,
});

const row = (day: string, status: DayStatus) => ({ day, status });

// 시간 모델

test('하루 경계는 현지 04:00', () => {
  assert.equal(dayKeyOf(seoul(2026, 10, 8, 3, 59), SEOUL), '2026-10-07');
  assert.equal(dayKeyOf(seoul(2026, 10, 8, 4, 0), SEOUL), '2026-10-08');
});

test('같은 순간도 시간대마다 하루 키가 다르다', () => {
  const t = Date.UTC(2026, 9, 8, 10, 0); // 서울 19:00, LA 03:00(PDT)
  assert.equal(dayKeyOf(t, SEOUL), '2026-10-08');
  assert.equal(dayKeyOf(t, LA), '2026-10-07');
});

test('사이클: 서울 22:00 시작, 15분', () => {
  const c = cycleOf('2026-10-07', 22 * 60, 15, SEOUL);
  assert.equal(c.pre, seoul(2026, 10, 7, 21, 30));
  assert.equal(c.start, seoul(2026, 10, 7, 22, 0));
  assert.equal(c.graceEnd, seoul(2026, 10, 7, 22, 15));
  assert.equal(c.nagEnd, seoul(2026, 10, 7, 23, 15));
  assert.equal(c.end, seoul(2026, 10, 8, 4, 0));
});

test('04:00 이전 시작 시각은 달력상 다음 날이다', () => {
  assert.equal(cycleOf('2026-10-07', 60, 10, SEOUL).start, seoul(2026, 10, 8, 1, 0));
  assert.equal(cycleOf('2026-10-07', 60, 10, LA).start, la(2026, 10, 8, 1, 0, 7));
  assert.equal(cycleOf('2026-10-07', 239, 10, SEOUL).start, seoul(2026, 10, 8, 3, 59));
  assert.equal(cycleOf('2026-10-07', 240, 10, SEOUL).start, seoul(2026, 10, 7, 4, 0));
});

test('LA 서머타임 시작일(2026-03-08)', () => {
  // 전날 밤은 PST, 서머타임 날 밤은 PDT
  assert.equal(cycleOf('2026-03-07', 22 * 60, 15, LA).start, la(2026, 3, 7, 22, 0, 8));
  assert.equal(cycleOf('2026-03-08', 22 * 60, 15, LA).start, la(2026, 3, 8, 22, 0, 7));
  // 03-07의 끝은 03-08 04:00 PDT
  assert.equal(cycleOf('2026-03-07', 22 * 60, 15, LA).end, la(2026, 3, 8, 4, 0, 7));
  // 04:00 이전 시작: 03-07 학습의 01:00은 03-08 01:00 PST
  assert.equal(cycleOf('2026-03-07', 60, 10, LA).start, la(2026, 3, 8, 1, 0, 8));
  // 없는 시각 02:30은 앞으로 밀린다(03:30 PDT). Postgres와 같다
  assert.equal(zonedTime('2026-03-08', 150, LA), la(2026, 3, 8, 3, 30, 7));
  // 03:30 PDT는 아직 03-07의 하루
  assert.equal(dayKeyOf(la(2026, 3, 8, 3, 30, 7), LA), '2026-03-07');
  assert.equal(dayKeyOf(la(2026, 3, 8, 4, 0, 7), LA), '2026-03-08');
});

test('LA 서머타임 종료일: 겹치는 01:30은 표준시로 본다', () => {
  assert.equal(zonedTime('2026-11-01', 90, LA), la(2026, 11, 1, 1, 30, 8));
  assert.equal(zonedTime('2026-11-01', 22 * 60, LA), la(2026, 11, 1, 22, 0, 8));
});

test('요일과 학습 요일', () => {
  assert.equal(weekdayOf('2026-10-18'), 0);
  assert.equal(weekdayOf('2026-10-19'), 1);
  assert.equal(weekdayOf('2026-10-24'), 6);
  assert.equal(isStudyDay('2026-10-24', WEEKDAYS), false);
  assert.equal(isStudyDay('2026-10-23', WEEKDAYS), true);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('학습일 더하기는 쉬는 요일을 건너뛴다', () => {
  assert.equal(addStudyDays('2026-10-23', 0, WEEKDAYS), '2026-10-23');
  assert.equal(addStudyDays('2026-10-23', 1, WEEKDAYS), '2026-10-26');
  assert.equal(addStudyDays('2026-10-23', 3, WEEKDAYS), '2026-10-28');
  assert.equal(addStudyDays('2026-10-24', 1, WEEKDAYS), '2026-10-26');
  assert.equal(addStudyDays('2026-10-19', 14, WEEKDAYS), '2026-11-06');
});

test('예약 변경은 from_day부터 적용된다', () => {
  const g = mkGoal({ pendingChange: { startMinutes: 7 * 60, targetMinutes: 20, weekdays: [0, 1, 2, 3, 4, 5], fromDay: '2026-10-21' } });
  assert.deepEqual(settingsFor(g, '2026-10-20'), { startMinutes: 22 * 60, targetMinutes: 15, weekdays: WEEKDAYS });
  assert.deepEqual(settingsFor(g, '2026-10-21'), { startMinutes: 7 * 60, targetMinutes: 20, weekdays: [0, 1, 2, 3, 4, 5] });
});

// 목표

test('첫 도전일은 만든 날 다음 날', () => {
  assert.equal(firstDayFor(seoul(2026, 10, 18, 9), SEOUL), '2026-10-19');
  // 새벽 02:00에 만들면 아직 전날 하루라서 그다음 날
  assert.equal(firstDayFor(seoul(2026, 10, 19, 2), SEOUL), '2026-10-19');
});

test('목표 입력 범위: 학습 10~30분, 기간 7~90일, 요일 5개 이상, 이유 20자', () => {
  const ok = { periodDays: 14, weekdays: WEEKDAYS, startMinutes: 22 * 60, targetMinutes: 15, reason: mkGoal().reason };
  assert.equal(goalInputError(ok), null);
  assert.equal(goalInputError({ ...ok, targetMinutes: 9 }), 'invalid');
  assert.equal(goalInputError({ ...ok, targetMinutes: 10 }), null);
  assert.equal(goalInputError({ ...ok, targetMinutes: 30 }), null);
  assert.equal(goalInputError({ ...ok, targetMinutes: 31 }), 'invalid');
  assert.equal(goalInputError({ ...ok, periodDays: 6 }), 'invalid');
  assert.equal(goalInputError({ ...ok, periodDays: 7 }), null);
  assert.equal(goalInputError({ ...ok, periodDays: 90 }), null);
  assert.equal(goalInputError({ ...ok, periodDays: 91 }), 'invalid');
  assert.equal(goalInputError({ ...ok, weekdays: [1, 2, 3, 4] }), 'invalid');
  assert.equal(goalInputError({ ...ok, weekdays: [1, 1, 2, 3, 4] }), 'invalid');
  assert.equal(goalInputError({ ...ok, weekdays: [1, 2, 3, 4, 7] }), 'invalid');
  assert.equal(goalInputError({ ...ok, startMinutes: 1440 }), 'invalid');
  assert.equal(goalInputError({ ...ok, reason: '짧은 이유' }), 'reason_short');
  assert.equal(R.PERIOD_DEFAULT, 14);
});

test('달성 선언은 first_day + 기간부터', () => {
  const g = mkGoal(); // 10-19 시작, 14일
  assert.equal(achieveDay(g), '2026-11-02');
  assert.equal(canAchieve(g, '2026-11-01'), false);
  assert.equal(canAchieve(g, '2026-11-02'), true);
  assert.equal(canAchieve(mkGoal({ periodDays: 30 }), '2026-11-17'), false);
  assert.equal(canAchieve(mkGoal({ periodDays: 30 }), '2026-11-18'), true);
});

// 연속

test('연속: 쉬는 요일은 끊지 않고 건너뛴다', () => {
  const days = [row('2026-10-22', 'done'), row('2026-10-23', 'done'), row('2026-10-26', 'done')];
  // 화 10-27 아직 안 함: 오늘은 세지 않는다
  assert.equal(streakOf(days, '2026-10-19', '2026-10-27', WEEKDAYS), 3);
  assert.equal(streakOf([...days, row('2026-10-27', 'done')], '2026-10-19', '2026-10-27', WEEKDAYS), 4);
  // 쉬는 요일 행이 있어도 같다
  const withRest = [...days, row('2026-10-24', 'rest'), row('2026-10-25', 'rest')];
  assert.equal(streakOf(withRest, '2026-10-19', '2026-10-27', WEEKDAYS), 3);
});

test('연속: 포기 대기일은 건너뛰고, 쿠폰과 실패와 빈 학습일은 끊는다', () => {
  const base = [row('2026-10-21', 'done'), row('2026-10-22', 'giveup_wait'), row('2026-10-23', 'done')];
  assert.equal(streakOf(base, '2026-10-19', '2026-10-26', WEEKDAYS), 2);
  assert.equal(streakOf([...base, row('2026-10-20', 'done'), row('2026-10-19', 'done')], '2026-10-19', '2026-10-26', WEEKDAYS), 4);
  assert.equal(streakOf([row('2026-10-21', 'done'), row('2026-10-22', 'coupon'), row('2026-10-23', 'done')], '2026-10-19', '2026-10-26', WEEKDAYS), 1);
  assert.equal(streakOf([row('2026-10-21', 'done'), row('2026-10-22', 'failed'), row('2026-10-23', 'done')], '2026-10-19', '2026-10-26', WEEKDAYS), 1);
  // 10-22 행 없음(판정 전 학습일) = 끊김
  assert.equal(streakOf([row('2026-10-21', 'done'), row('2026-10-23', 'done')], '2026-10-19', '2026-10-26', WEEKDAYS), 1);
  // 오늘 쿠폰을 쓰면 0
  assert.equal(streakOf([row('2026-10-23', 'done'), row('2026-10-26', 'coupon')], '2026-10-19', '2026-10-26', WEEKDAYS), 0);
  // first_day 이전은 보지 않는다
  assert.equal(streakOf([row('2026-10-19', 'done')], '2026-10-19', '2026-10-20', WEEKDAYS), 1);
});

// 쿠폰

test('쿠폰 기준 = 주 수 × 주당 학습 요일 수', () => {
  assert.equal(couponThreshold(mkGoal()), 10);
  assert.equal(couponThreshold(mkGoal({ weekdays: [0, 1, 2, 3, 4, 5, 6] })), 14);
  assert.equal(couponThreshold(mkGoal({ couponStreakGoalWeeks: 3 })), 15);
});

test('쿠폰: 주 5일이면 10일 연속에 1장, 다음은 15일', () => {
  let g = mkGoal();
  const earnedAt: number[] = [];
  for (let i = 1; i <= 25; i++) {
    const r = completeDayCoupon(g);
    g = r.goal;
    if (r.earned) earnedAt.push(i);
  }
  assert.deepEqual(earnedAt, [10, 25]);
  assert.equal(g.coupons, 5);
  assert.equal(g.couponStreakGoalWeeks, 4);
  assert.equal(g.couponProgressDays, 0);
});

test('쿠폰: 주 7일이면 14일 연속에 1장', () => {
  let g = mkGoal({ weekdays: [0, 1, 2, 3, 4, 5, 6] });
  const earnedAt: number[] = [];
  for (let i = 1; i <= 14; i++) {
    const r = completeDayCoupon(g);
    g = r.goal;
    if (r.earned) earnedAt.push(i);
  }
  assert.deepEqual(earnedAt, [14]);
  assert.equal(daysToNextCoupon(g), 21);
});

test('쿠폰 사용은 진행일을 0으로, 0장이면 거부', () => {
  const g = spendCoupon(mkGoal({ couponProgressDays: 9 }));
  assert.equal(g?.coupons, 2);
  assert.equal(g?.couponProgressDays, 0);
  assert.equal(spendCoupon(mkGoal({ coupons: 0 })), null);
});

// 판정

test('판정: 쉬는 요일은 rest로, 진행일을 끊지 않는다', () => {
  const g = mkGoal({ couponProgressDays: 5, settledDay: '2026-10-23' });
  const r = settle(g, [row('2026-10-23', 'done')], '2026-10-26', SEOUL);
  assert.deepEqual(r.writes, [row('2026-10-24', 'rest'), row('2026-10-25', 'rest')]);
  assert.equal(r.goal.couponProgressDays, 5);
  assert.equal(r.goal.settledDay, '2026-10-25');
});

test('판정: 빈 학습일과 진행 중으로 끝난 날은 실패, 진행일 0', () => {
  const g = mkGoal({ couponProgressDays: 5 });
  const r = settle(g, [row('2026-10-19', 'done'), row('2026-10-20', 'progress')], '2026-10-22', SEOUL);
  assert.deepEqual(r.writes, [row('2026-10-20', 'failed'), row('2026-10-21', 'failed')]);
  assert.equal(r.goal.couponProgressDays, 0);
  assert.equal(r.goal.settledDay, '2026-10-21');
});

test('판정: first_day 이전은 건너뛴다', () => {
  const g = mkGoal({ settledDay: '2026-10-16' });
  const r = settle(g, [], '2026-10-19', SEOUL);
  assert.deepEqual(r.writes, []);
  assert.equal(r.goal.settledDay, '2026-10-18');
});

test('판정: 포기 대기와 겹친 날은 giveup_wait, 진행일은 그대로, done은 그대로', () => {
  const g = mkGoal({ couponProgressDays: 4, settledDay: '2026-10-19', giveupRequestedAt: seoul(2026, 10, 20, 23) });
  const r = settle(g, [row('2026-10-20', 'done')], '2026-10-22', SEOUL);
  assert.deepEqual(r.writes, [row('2026-10-21', 'giveup_wait')]);
  assert.equal(r.goal.couponProgressDays, 4);
  // 대기 중인 날은 연속을 끊지 않는다
  const days = [row('2026-10-19', 'done'), row('2026-10-20', 'done'), ...r.writes];
  assert.equal(streakOf(days, '2026-10-19', '2026-10-22', WEEKDAYS), 2);
});

test('판정: 예약 변경은 from_day가 되면 목표에 들어간다', () => {
  const g = mkGoal({ pendingChange: { startMinutes: 60, targetMinutes: 20, weekdays: [1, 2, 3, 4, 5, 6], fromDay: '2026-10-21' } });
  assert.notEqual(settle(g, [], '2026-10-20', SEOUL).goal.pendingChange, null);
  const r = settle(g, [], '2026-10-21', SEOUL);
  assert.equal(r.goal.pendingChange, null);
  assert.equal(r.goal.startMinutes, 60);
  assert.deepEqual(r.goal.weekdays, [1, 2, 3, 4, 5, 6]);
});

// 홈

test('홈 상태: 첫날 전, 쉬는 요일, 시각별 상태, 진행, 완료, 쿠폰, 포기 대기', () => {
  const g = mkGoal();
  assert.equal(homeState(null, undefined, seoul(2026, 10, 18, 12), SEOUL), 'none');
  assert.equal(homeState(g, undefined, seoul(2026, 10, 18, 12), SEOUL), 'before_first');
  assert.equal(homeState(g, undefined, seoul(2026, 10, 24, 22, 5), SEOUL), 'rest');
  assert.equal(homeState(g, undefined, seoul(2026, 10, 20, 20), SEOUL), 'waiting');
  assert.equal(homeState(g, undefined, seoul(2026, 10, 20, 21, 45), SEOUL), 'soon');
  assert.equal(homeState(g, undefined, seoul(2026, 10, 20, 22, 5), SEOUL), 'grace');
  assert.equal(homeState(g, undefined, seoul(2026, 10, 20, 22, 16), SEOUL), 'nag');
  assert.equal(homeState(g, { status: 'progress', activeSeconds: 60 }, seoul(2026, 10, 20, 22, 16), SEOUL), 'resume');
  assert.equal(homeState(g, { status: 'done', activeSeconds: 900 }, seoul(2026, 10, 20, 22, 16), SEOUL), 'done');
  assert.equal(homeState(g, { status: 'coupon', activeSeconds: 0 }, seoul(2026, 10, 20, 22, 16), SEOUL), 'coupon');
  assert.equal(homeState({ ...g, giveupRequestedAt: 1 }, undefined, seoul(2026, 10, 20, 22, 16), SEOUL), 'giveup');
});

// 포기

test('포기: 대기 24시간, 알림 2시간 간격 12개', () => {
  const t = seoul(2026, 10, 20, 9);
  const times = giveupWaitNotifications(t);
  assert.equal(times.length, 12);
  for (let i = 1; i < times.length; i++) assert.equal(times[i] - times[i - 1], 2 * H);
  assert.ok(times.every((x) => x > t && x < t + 24 * H));
  assert.equal(giveupExpired(mkGoal({ giveupRequestedAt: t }), t + 24 * H - 1), false);
  assert.equal(giveupExpired(mkGoal({ giveupRequestedAt: t }), t + 24 * H), true);
  assert.equal(giveupExpired(mkGoal(), t + 48 * H), false);
});

test('포기 확정 횟수별 이용 정지: 7일, 14일, 영구', () => {
  assert.deepEqual(suspensionFor(0), { days: null, banned: false });
  assert.deepEqual(suspensionFor(1), { days: 7, banned: false });
  assert.deepEqual(suspensionFor(2), { days: 14, banned: false });
  assert.deepEqual(suspensionFor(3), { days: null, banned: true });
  assert.equal(R.GIVEUP_MAX_CONFIRMED, 3);
});

test('4번째 신청 즉시 삭제 규칙은 없다', () => {
  assert.equal('giveupAction' in R, false);
  assert.equal('GIVEUP_MAX_WAITS' in R, false);
});

// 학습 시간

test('단계 비율 A 20%, B 60%, C 20%', () => {
  assert.deepEqual(phaseBounds(15), { aEnd: 180, bEnd: 720, total: 900 });
  assert.deepEqual(phaseBounds(10), { aEnd: 120, bEnd: 480, total: 600 });
  assert.deepEqual(phaseBounds(13), { aEnd: 156, bEnd: 624, total: 780 });
  assert.equal(phaseAt(0, 15), 'A');
  assert.equal(phaseAt(179, 15), 'A');
  assert.equal(phaseAt(180, 15), 'B');
  assert.equal(phaseAt(719, 15), 'B');
  assert.equal(phaseAt(720, 15), 'C');
  assert.equal(phaseAt(899, 15), 'C');
  assert.equal(phaseAt(900, 15), 'retro');
});

test('2분 무활동이면 딴짓. 활동은 타이머를 되돌린다', () => {
  assert.equal(R.IDLE_MS, 120_000);
  assert.equal(isIdle(1000, 1000 + 119_999), false);
  assert.equal(isIdle(1000, 1000 + 120_000), true);
});

test('학습 중 전송은 글자 수 제한이 없다', () => {
  assert.equal(canSend('Oat milk, please.'), true);
  assert.equal(canSend('Yes'), true);
  assert.equal(canSend('   '), false);
});

test('완료: 학습 시간과 회고 3분을 모두 채워야 한다', () => {
  const start = seoul(2026, 10, 20, 22);
  const done = { targetMinutes: 15, sessionStartedAt: start, activeSeconds: 900, retroStartedAt: start + 16 * 60_000, retroSeconds: 180 };
  const now = start + 20 * 60_000;
  assert.equal(R.RETRO_SECONDS, 180);
  assert.equal(canCompleteDay(done, now), true);
  assert.equal(canCompleteDay({ ...done, retroSeconds: 179 }, now), false);
  assert.equal(canCompleteDay({ ...done, activeSeconds: 899 }, now), false);
  assert.equal(canCompleteDay({ ...done, retroStartedAt: null }, now), false);
  // 서버 경과 시간보다 많이 셀 수 없다
  assert.equal(canCompleteDay(done, start + 16 * 60_000 + 179_000), false);
  assert.equal(canCompleteDay(done, start + 14 * 60_000), false);
});

test('오늘의 이유: 20자 이상, 직전과 같으면 거부', () => {
  assert.equal(noteValid('짧음'), false);
  const t = '오늘은 품절일 때 대신 다른 걸 주문하는 말을 익히고 싶습니다';
  assert.equal(noteValid(t), true);
  assert.equal(noteValid(t, t), false);
});

test('rules.ts는 import가 없다(Node와 Deno 공용)', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const src = readFileSync(join(__dirname, '..', 'rules.ts'), 'utf8');
  assert.equal(/^\s*import\s/m.test(src), false);
  assert.equal(/require\(/.test(src), false);
});
