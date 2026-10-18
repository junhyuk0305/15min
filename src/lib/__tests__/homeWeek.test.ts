import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weekStrip } from '../archive';
import type { AppGoal } from '../model';
import { couponEarnedOf } from '../selectors';
import type { DayRow, DayStatus } from '../rules';

// 2026-10-19 월요일부터 월~금
const goal = (over: Partial<AppGoal> = {}): AppGoal => ({
  id: 'g',
  name: '카페에서 영어로 주문하기',
  reason: '외국 손님 앞에서 주문을 막힘없이 하고 싶어서',
  periodDays: 14,
  weekdays: [1, 2, 3, 4, 5],
  startMinutes: 22 * 60,
  targetMinutes: 15,
  situation: { place: '카페', myRole: '손님', partner: '바리스타', task: '주문' },
  subsituations: [],
  firstDay: '2026-10-19',
  status: 'active',
  coupons: 3,
  couponStreakGoalWeeks: 2,
  couponProgressDays: 0,
  settledDay: '2026-10-18',
  pendingChange: null,
  giveupRequestedAt: null,
  createdAt: 0,
  endedAt: null,
  ...over,
});

const day = (d: string, status: DayStatus, goalId = 'g'): DayRow => ({
  goalId,
  day: d,
  status,
  todayReason: null,
  phase: null,
  targetMinutes: 15,
  sessionStartedAt: null,
  activeSeconds: 0,
  retroStartedAt: null,
  retroSeconds: 0,
  completedAt: null,
  couponEarned: false,
  createdAt: 0,
});

test('이번 주 띠: 오늘이 든 주의 일요일부터 7칸, 달력과 같은 칸 상태', () => {
  const days = [day('2026-10-19', 'done'), day('2026-10-20', 'coupon')];
  const strip = weekStrip(days, goal(), '2026-10-22');
  assert.deepEqual(
    strip.map((c) => c.day),
    ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'],
  );
  // 첫 학습일 전은 표시 없음, 완료, 쿠폰, 행 없는 지난 학습일은 실패, 오늘과 앞날은 빈칸, 토요일은 쉼
  assert.deepEqual(
    strip.map((c) => c.mark),
    ['outside', 'done', 'coupon', 'miss', 'open', 'open', 'rest'],
  );
});

test('이번 주 띠: 오늘이 일요일이면 그날부터, 토요일이면 그 주 일요일부터', () => {
  assert.equal(weekStrip([], goal(), '2026-10-25')[0].day, '2026-10-25');
  assert.equal(weekStrip([], goal(), '2026-10-31')[0].day, '2026-10-25');
});

test('이번 주 띠: 같은 날 다른 목표 행이 있으면 활성 목표를 본다', () => {
  const days = [day('2026-10-21', 'failed', 'old'), day('2026-10-21', 'done')];
  assert.equal(weekStrip(days, goal(), '2026-10-22')[3].mark, 'done');
});

test('쿠폰 획득 카드: 다시 읽기 전(진행일이 남아 있음)과 뒤(진행일 0, 기준 주 +1)가 같은 숫자', () => {
  // 주 5일, 첫 쿠폰은 2주 = 연속 10일. 다음은 3주 = 연속 15일
  assert.deepEqual(couponEarnedOf({ couponStreakGoalWeeks: 2, couponProgressDays: 9, weekdays: [1, 2, 3, 4, 5] }), { got: 10, next: 15 });
  assert.deepEqual(couponEarnedOf({ couponStreakGoalWeeks: 3, couponProgressDays: 0, weekdays: [1, 2, 3, 4, 5] }), { got: 10, next: 15 });
  // 매일이면 14일, 다음은 21일 (갭분석 3.1-11 예시)
  assert.deepEqual(couponEarnedOf({ couponStreakGoalWeeks: 3, couponProgressDays: 0, weekdays: [0, 1, 2, 3, 4, 5, 6] }), { got: 14, next: 21 });
});
