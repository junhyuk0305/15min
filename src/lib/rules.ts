// 그래고의 정책 규칙. 기획서(docs/기획서.md)의 숫자와 판정은 전부 여기에만 둔다.
// 외부 import 없음: node 테스트에서 그대로 돌린다.

export const DAY_BOUNDARY_HOUR = 4; // 하루의 경계. 자정이 아니라 04:00
export const PRE_REMIND_MIN = 30;
export const NAG_COUNT = 60;
export const NAG_INTERVAL_MS = 60_000;
export const ACHIEVE_MIN_DAYS = 30;
export const GIVEUP_WAIT_MS = 24 * 3600_000;
export const GIVEUP_MAX_WAITS = 3;
export const INITIAL_COUPONS = 3;
export const FIRST_COUPON_WEEKS = 2;
export const MIN_NOTE_CHARS = 20;
export const MIN_TARGET = 5;
export const MAX_TARGET = 30;
export const DEVIL_STREAK = 7;
export const IDLE_MS = 120_000;

export type Msg = { role: 'user' | 'bot'; text: string; at: number };

export type DayStatus = 'progress' | 'done' | 'coupon' | 'paused';

export type DayRecord = {
  goalId: string;
  day: string;
  status: DayStatus;
  reason: string;
  review: string;
  activeSeconds: number;
  targetMinutes: number;
  botId: string;
  messages: Msg[];
  chars: number;
  leftAt: number | null;
};

export type Goal = {
  id: string;
  name: string;
  reason: string;
  startMinutes: number;
  targetMinutes: number;
  botId: string;
  createdAt: number;
  status: 'active' | 'achieved' | 'deleted';
  endedAt: number | null;
  coupons: number;
  nextCouponWeeks: number;
  couponProgressDays: number;
  giveupCount: number;
  giveupSince: number | null;
  settledDay: string;
  pendingChange: { startMinutes: number; targetMinutes: number; fromDay: string } | null;
};

export type HomeState =
  | 'waiting'
  | 'soon'
  | 'grace'
  | 'nag'
  | 'resume'
  | 'done'
  | 'coupon'
  | 'giveup';

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKeyOf(ts: number): string {
  const d = new Date(ts - DAY_BOUNDARY_HOUR * 3600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parts(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d };
}

export function addDays(day: string, n: number): string {
  const { y, m, d } = parts(day);
  const t = new Date(y, m - 1, d + n, 12);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

export function daysBetween(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400_000);
}

/** 하루가 끝나는 순간 (다음 날 04:00) */
export function dayEnd(day: string): number {
  const { y, m, d } = parts(day);
  return new Date(y, m - 1, d + 1, DAY_BOUNDARY_HOUR).getTime();
}

export function settingsFor(goal: Goal, day: string) {
  const c = goal.pendingChange;
  if (c && day >= c.fromDay) return { startMinutes: c.startMinutes, targetMinutes: c.targetMinutes };
  return { startMinutes: goal.startMinutes, targetMinutes: goal.targetMinutes };
}

export function cycleOf(day: string, startMinutes: number, targetMinutes: number) {
  const { y, m, d } = parts(day);
  // 04:00 이전 시각은 달력상 다음 날에 속한다
  const extra = startMinutes < DAY_BOUNDARY_HOUR * 60 ? 1 : 0;
  const start = new Date(y, m - 1, d + extra, 0, startMinutes).getTime();
  const graceEnd = start + targetMinutes * 60_000;
  return {
    pre: start - PRE_REMIND_MIN * 60_000,
    start,
    graceEnd,
    nagEnd: graceEnd + NAG_COUNT * NAG_INTERVAL_MS,
  };
}

export function homeState(goal: Goal, rec: DayRecord | undefined, now: number): HomeState {
  if (goal.giveupSince !== null) return 'giveup';
  if (rec?.status === 'done') return 'done';
  if (rec?.status === 'coupon') return 'coupon';
  if (rec?.status === 'progress' && rec.activeSeconds > 0) return 'resume';
  const day = dayKeyOf(now);
  const s = settingsFor(goal, day);
  const c = cycleOf(day, s.startMinutes, s.targetMinutes);
  if (now < c.pre) return 'waiting';
  if (now < c.start) return 'soon';
  if (now < c.graceEnd) return 'grace';
  return 'nag';
}

type RecordOf = (day: string) => DayRecord | undefined;

/** 연속 일수. 오늘은 완료했을 때만 센다. 쿠폰과 실패는 끊고, 포기 대기로 보류된 날은 건너뛴다. */
export function streakOf(goal: Goal, recordOf: RecordOf, today: string): number {
  const first = dayKeyOf(goal.createdAt);
  let n = 0;
  const todayStatus = recordOf(today)?.status;
  if (todayStatus === 'coupon') return 0;
  if (todayStatus === 'done') n++;
  for (let d = addDays(today, -1); d >= first; d = addDays(d, -1)) {
    const st = recordOf(d)?.status;
    if (st === 'done') n++;
    else if (st === 'paused') continue;
    else break;
  }
  return n;
}

export function totalMinutes(records: DayRecord[]): number {
  return Math.floor(records.reduce((a, r) => a + r.activeSeconds, 0) / 60);
}

/** 하루를 채웠을 때. 쿠폰 진행일을 올리고 조건을 넘으면 쿠폰을 준다. */
export function completeDay(goal: Goal): { goal: Goal; earned: boolean } {
  const progress = goal.couponProgressDays + 1;
  if (progress >= goal.nextCouponWeeks * 7) {
    return {
      goal: { ...goal, coupons: goal.coupons + 1, nextCouponWeeks: goal.nextCouponWeeks + 1, couponProgressDays: 0 },
      earned: true,
    };
  }
  return { goal: { ...goal, couponProgressDays: progress }, earned: false };
}

export function spendCoupon(goal: Goal): Goal | null {
  if (goal.coupons <= 0) return null;
  return { ...goal, coupons: goal.coupons - 1, couponProgressDays: 0 };
}

export function daysToNextCoupon(goal: Goal): number {
  return goal.nextCouponWeeks * 7 - goal.couponProgressDays;
}

/**
 * 끝난 날들을 판정한다. 기록이 없거나 진행 중으로 끝난 날은 실패: 쿠폰 진행일 0.
 * 포기 대기 중인 날은 판정을 미룬다. 예약된 시각과 분 변경도 여기서 반영한다.
 */
export function settle(goal: Goal, recordOf: RecordOf, now: number): Goal {
  const today = dayKeyOf(now);
  let g = goal;
  const holdFrom = g.giveupSince !== null ? dayKeyOf(g.giveupSince) : null;
  for (let d = addDays(g.settledDay, 1); d < today; d = addDays(d, 1)) {
    if (holdFrom !== null && d >= holdFrom) break;
    const st = recordOf(d)?.status;
    if (st !== 'done' && st !== 'coupon' && st !== 'paused') g = { ...g, couponProgressDays: 0 };
    g = { ...g, settledDay: d };
  }
  const c = g.pendingChange;
  if (c && today >= c.fromDay) {
    g = { ...g, startMinutes: c.startMinutes, targetMinutes: c.targetMinutes, pendingChange: null };
  }
  return g;
}

export function canAchieve(goal: Goal, now: number): boolean {
  return daysBetween(dayKeyOf(goal.createdAt), dayKeyOf(now)) >= ACHIEVE_MIN_DAYS;
}

export function daysSinceStart(goal: Goal, now: number): number {
  return daysBetween(dayKeyOf(goal.createdAt), dayKeyOf(now));
}

/** 포기 신청. 대기 3번을 다 썼으면 즉시 삭제 대상이다. */
export function giveupAction(goal: Goal): 'wait' | 'delete' {
  return goal.giveupCount >= GIVEUP_MAX_WAITS ? 'delete' : 'wait';
}

export function giveupExpired(goal: Goal, now: number): boolean {
  return goal.giveupSince !== null && now - goal.giveupSince >= GIVEUP_WAIT_MS;
}

export function newGoal(input: {
  id: string;
  name: string;
  reason: string;
  startMinutes: number;
  targetMinutes: number;
  botId: string;
  now: number;
}): Goal {
  return {
    id: input.id,
    name: input.name.trim(),
    reason: input.reason.trim(),
    startMinutes: input.startMinutes,
    targetMinutes: input.targetMinutes,
    botId: input.botId,
    createdAt: input.now,
    status: 'active',
    endedAt: null,
    coupons: INITIAL_COUPONS,
    nextCouponWeeks: FIRST_COUPON_WEEKS,
    couponProgressDays: 0,
    giveupCount: 0,
    giveupSince: null,
    settledDay: addDays(dayKeyOf(input.now), -1),
    pendingChange: null,
  };
}

export function noteValid(text: string, previous?: string): boolean {
  const t = text.trim();
  if (t.length < MIN_NOTE_CHARS) return false;
  if (previous !== undefined && t === previous.trim()) return false;
  return true;
}

export function fmtClock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
