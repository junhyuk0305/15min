import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPlan } from '../plan';
import {
  canAchieve,
  completeDay,
  cycleOf,
  dayKeyOf,
  giveupAction,
  homeState,
  newGoal,
  noteValid,
  settle,
  spendCoupon,
  streakOf,
  type DayRecord,
  type Goal,
} from '../rules';

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

const mkGoal = (now: number, over: Partial<Goal> = {}): Goal => ({
  ...newGoal({ id: 'g', name: '영어 이메일', reason: '외국 거래처와 메일을 막힘없이 쓰고 싶어서', startMinutes: 22 * 60, targetMinutes: 15, botId: 'email', now }),
  ...over,
});

const rec = (day: string, status: DayRecord['status'], extra: Partial<DayRecord> = {}): DayRecord => ({
  goalId: 'g', day, status, reason: '', review: '', activeSeconds: 0, targetMinutes: 15, botId: 'email', messages: [], chars: 0, leftAt: null, ...extra,
});

test('하루 경계는 04:00', () => {
  assert.equal(dayKeyOf(at(2026, 10, 8, 3, 59)), '2026-10-07');
  assert.equal(dayKeyOf(at(2026, 10, 8, 4, 0)), '2026-10-08');
});

test('사이클: 22:00 시작, 15분 목표', () => {
  const c = cycleOf('2026-10-07', 22 * 60, 15);
  assert.equal(c.pre, at(2026, 10, 7, 21, 30));
  assert.equal(c.graceEnd, at(2026, 10, 7, 22, 15));
  assert.equal(c.nagEnd, at(2026, 10, 7, 23, 15));
});

test('04:00 이전 시작 시각은 다음 달력 날짜', () => {
  const c = cycleOf('2026-10-07', 60, 10);
  assert.equal(c.start, at(2026, 10, 8, 1, 0));
});

test('홈 상태 전이', () => {
  const g = mkGoal(at(2026, 10, 7, 9));
  assert.equal(homeState(g, undefined, at(2026, 10, 7, 20)), 'waiting');
  assert.equal(homeState(g, undefined, at(2026, 10, 7, 21, 45)), 'soon');
  assert.equal(homeState(g, undefined, at(2026, 10, 7, 22, 5)), 'grace');
  assert.equal(homeState(g, undefined, at(2026, 10, 7, 22, 16)), 'nag');
  assert.equal(homeState(g, rec('2026-10-07', 'progress', { activeSeconds: 60 }), at(2026, 10, 7, 22, 16)), 'resume');
  assert.equal(homeState(g, rec('2026-10-07', 'done'), at(2026, 10, 7, 22, 16)), 'done');
  assert.equal(homeState({ ...g, giveupSince: 1 }, undefined, at(2026, 10, 7, 22, 16)), 'giveup');
});

test('연속: 쿠폰과 실패는 끊고, 보류된 날은 건너뛴다', () => {
  const g = mkGoal(at(2026, 10, 1, 9));
  const rs = [rec('2026-10-04', 'done'), rec('2026-10-05', 'paused'), rec('2026-10-06', 'done'), rec('2026-10-07', 'done')];
  const of = (d: string) => rs.find((r) => r.day === d);
  assert.equal(streakOf(g, of, '2026-10-07'), 3);
  const rs2 = [...rs.slice(0, 3), rec('2026-10-07', 'coupon')];
  assert.equal(streakOf(g, (d) => rs2.find((r) => r.day === d), '2026-10-07'), 0);
});

test('쿠폰: 2주 연속에 1장, 다음은 3주', () => {
  let g = mkGoal(0);
  let earned = 0;
  for (let i = 0; i < 14 + 21; i++) {
    const r = completeDay(g);
    g = r.goal;
    if (r.earned) earned++;
  }
  assert.equal(earned, 2);
  assert.equal(g.coupons, 5);
  assert.equal(g.nextCouponWeeks, 4);
});

test('쿠폰 사용은 진행일을 0으로, 0장이면 거부', () => {
  const g = spendCoupon({ ...mkGoal(0), couponProgressDays: 9 });
  assert.equal(g?.coupons, 2);
  assert.equal(g?.couponProgressDays, 0);
  assert.equal(spendCoupon({ ...mkGoal(0), coupons: 0 }), null);
});

test('판정: 빠진 날은 쿠폰 진행일을 0으로', () => {
  const g = { ...mkGoal(at(2026, 10, 1, 9)), couponProgressDays: 5 };
  const rs = [rec('2026-10-01', 'done'), rec('2026-10-02', 'done')];
  const s = settle(g, (d) => rs.find((r) => r.day === d), at(2026, 10, 4, 12));
  assert.equal(s.couponProgressDays, 0);
  assert.equal(s.settledDay, '2026-10-03');
});

test('판정: 포기 대기 중인 날은 미룬다', () => {
  const g = { ...mkGoal(at(2026, 10, 1, 9)), couponProgressDays: 5, giveupSince: at(2026, 10, 2, 12) };
  const s = settle(g, () => undefined, at(2026, 10, 3, 12));
  assert.equal(s.settledDay, '2026-10-01');
  assert.equal(s.couponProgressDays, 0);
});

test('달성 선언은 30일 뒤부터', () => {
  const g = mkGoal(at(2026, 10, 1, 9));
  assert.equal(canAchieve(g, at(2026, 10, 30, 12)), false);
  assert.equal(canAchieve(g, at(2026, 10, 31, 12)), true);
});

test('포기: 대기는 3번까지, 4번째는 삭제', () => {
  assert.equal(giveupAction({ ...mkGoal(0), giveupCount: 2 }), 'wait');
  assert.equal(giveupAction({ ...mkGoal(0), giveupCount: 3 }), 'delete');
});

test('이유와 소감: 20자 이상, 어제와 같으면 거부', () => {
  assert.equal(noteValid('짧음'), false);
  const t = '오늘은 클라이언트 메일 답장을 막힘없이 쓰고 싶습니다';
  assert.equal(noteValid(t), true);
  assert.equal(noteValid(t, t), false);
});

test('알림 계획: 하루 시작 전이면 사전 1 + 독촉 60 + 내일 사전 1', () => {
  const now = at(2026, 10, 7, 12);
  const p = buildPlan({ goal: mkGoal(at(2026, 10, 7, 9)), lastGoal: null, records: [], now });
  assert.equal(p.length, 62);
  assert.equal(p[0].at, at(2026, 10, 7, 21, 30));
  assert.equal(p[1].at, at(2026, 10, 7, 22, 15));
  assert.equal(p[60].at, at(2026, 10, 7, 23, 14));
  assert.ok(p.length <= 63);
  for (let i = 2; i < 61; i++) assert.notEqual(p[i].body, p[i - 1].body);
});

test('알림 계획: 완료한 날은 오늘 알림 없음, 내일 사이클만', () => {
  const now = at(2026, 10, 7, 22, 20);
  const p = buildPlan({ goal: mkGoal(at(2026, 10, 7, 9)), lastGoal: null, records: [rec('2026-10-07', 'done')], now });
  assert.equal(p.length, 61);
  assert.ok(p.every((x) => x.at >= at(2026, 10, 8, 21, 30)));
});

test('알림 계획: 이탈하면 나간 순간 1분 뒤부터 60회', () => {
  const left = at(2026, 10, 7, 22, 25);
  const p = buildPlan({
    goal: mkGoal(at(2026, 10, 7, 9)), lastGoal: null, now: left,
    records: [rec('2026-10-07', 'progress', { activeSeconds: 600, leftAt: left })],
  });
  const nags = p.filter((x) => x.at < at(2026, 10, 8, 4));
  assert.equal(nags.length, 60);
  assert.equal(nags[0].at, left + 60_000);
  assert.match(nags[0].body, /5분/);
});

test('알림 계획: 포기 대기 중에는 기록으로 긁는 문구', () => {
  const now = at(2026, 10, 7, 12);
  const p = buildPlan({ goal: { ...mkGoal(at(2026, 10, 1, 9)), giveupSince: now }, lastGoal: null, records: [], now });
  assert.ok(p.some((x) => x.body.includes('겨우 그런 이유였습니까')));
});

test('알림 계획: 달성 후 새 목표가 없으면 다음 날 같은 시각부터 독촉', () => {
  const now = at(2026, 10, 7, 12);
  const p = buildPlan({ goal: null, lastGoal: mkGoal(at(2026, 9, 1, 9)), records: [], now });
  assert.equal(p.length, 60);
  assert.equal(p[0].at, at(2026, 10, 8, 22, 0));
});
