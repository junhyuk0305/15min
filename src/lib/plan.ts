// 알림 예약 계획. 순수 함수라 테스트로 개수와 시각을 검증한다.
// iOS는 기기에 대기시킬 수 있는 로컬 알림이 64개까지라 다음 학습일 두 개만 계획하고 63개에서 자른다.
import { copy, giveupLines, nagLines, type NagMaterial } from './copy';
import {
  addDays,
  cycleOf,
  dayKeyOf,
  daysBetween,
  DEVIL_STREAK,
  giveupWaitNotifications,
  isStudyDay,
  NAG_COUNT,
  NAG_INTERVAL_MS,
  settingsFor,
  streakOf,
  totalMinutes,
  type DayStatus,
  type Goal,
} from './rules';

export const MAX_PENDING = 63;

/** 알림 종류. 눌렀을 때 그 상태가 이미 끝났는지(예: 완료한 날의 독촉) 확인하는 데 쓴다. */
export type PlannedKind = 'pre' | 'devil' | 'start' | 'nag' | 'giveup_wait' | 'suspended' | 'no_goal';

export type Planned = {
  at: number;
  body: string;
  url: string;
  kind: PlannedKind;
  /** 그 알림이 가리키는 하루 키. 포기 대기는 신청한 날 */
  day: string;
};

export type PlanDay = { day: string; status: DayStatus; activeSeconds: number; targetMinutes: number };

export type PlanInput = {
  goal: Goal | null;
  /** 목표 없이 끝난 직전 목표 (달성 후 새 목표를 안 만든 경우) */
  lastGoal: Goal | null;
  /** 활성 목표의 날들 */
  days: PlanDay[];
  /** 오늘 학습 중 나간 시각. 그 1분 뒤부터 다시 독촉한다 */
  leftAt: number | null;
  /** 가장 최근 회고 2번 답 */
  lastRetro: string | null;
  /** 이용 정지 중이면 정지 끝 시각과 포기한 목표의 시작 시각. 영구 정지면 null */
  suspension: { until: number; startMinutes: number } | null;
  now: number;
  timeZone: string;
};

/** 계획하는 학습일 수 (오늘이 학습일이면 오늘 포함) */
const PLAN_STUDY_DAYS = 2;

/** first_day 이후의 학습일을 오늘부터 n개 */
function nextStudyDays(goal: Goal, today: string, n: number): string[] {
  const out: string[] = [];
  let d = today < goal.firstDay ? goal.firstDay : today;
  for (let i = 0; out.length < n && i < 14; i++, d = addDays(d, 1)) {
    if (isStudyDay(d, settingsFor(goal, d).weekdays)) out.push(d);
  }
  return out;
}

/** first_day부터 그날까지 학습일 순번(0부터) */
function studyOrdinal(goal: Goal, day: string): number {
  let n = 0;
  for (let d = goal.firstDay; d < day; d = addDays(d, 1)) if (isStudyDay(d, settingsFor(goal, d).weekdays)) n++;
  return n;
}

function material(goal: Goal, input: PlanInput, today: string, remainMinutes: number): NagMaterial {
  return {
    targetMinutes: settingsFor(goal, today).targetMinutes,
    remainMinutes,
    goalName: goal.name,
    reason: goal.reason,
    totalMinutes: totalMinutes(input.days),
    days: Math.max(0, daysBetween(goal.firstDay, today) + 1),
    lastRetro: input.lastRetro,
  };
}

function giveupPlan(goal: Goal, input: PlanInput, today: string): Planned[] {
  const requestedAt = goal.giveupRequestedAt as number;
  const lines = giveupLines(material(goal, input, today, 0));
  const day = dayKeyOf(requestedAt, input.timeZone);
  return giveupWaitNotifications(requestedAt)
    .map((at, i) => ({ at, body: lines[i % lines.length], url: '/', kind: 'giveup_wait' as const, day }))
    .filter((p) => p.at > input.now);
}

function suspendedPlan(s: { until: number; startMinutes: number }, input: PlanInput, today: string): Planned[] {
  const out: Planned[] = [];
  for (let d = today; out.length < MAX_PENDING; d = addDays(d, 1)) {
    const at = cycleOf(d, s.startMinutes, 0, input.timeZone).start;
    if (at >= s.until) break;
    if (at > input.now) out.push({ at, body: copy.notify.suspended, url: '/suspended', kind: 'suspended', day: d });
  }
  return out;
}

function noGoalPlan(last: Goal, input: PlanInput, today: string): Planned[] {
  const day = addDays(today, 1);
  const c = cycleOf(day, last.startMinutes, 0, input.timeZone);
  return Array.from({ length: NAG_COUNT }, (_, i) => ({
    at: c.start + i * NAG_INTERVAL_MS,
    body: copy.notify.noGoal,
    url: '/goal/new',
    kind: 'no_goal' as const,
    day,
  }));
}

function cyclePlan(goal: Goal, input: PlanInput, today: string): Planned[] {
  const { now, timeZone } = input;
  const out: Planned[] = [];
  const streak = streakOf(input.days, goal.firstDay, today, goal.weekdays);
  const rowOf = (d: string) => input.days.find((r) => r.day === d);

  for (const day of nextStudyDays(goal, today, PLAN_STUDY_DAYS)) {
    const row = rowOf(day);
    if (row && row.status !== 'progress') continue; // 완료, 쿠폰, 판정이 끝난 날
    const s = settingsFor(goal, day);
    const c = cycleOf(day, s.startMinutes, s.targetMinutes, timeZone);
    const push = (at: number, kind: PlannedKind, body: string, url: string) => {
      if (at > now && at < c.end) out.push({ at, body, url, kind, day });
    };

    // [가정] 연속 7일 이상이면 학습일 순번이 짝수인 날의 사전 알림을 악마의 속삭임으로 바꾼다
    const ordinal = studyOrdinal(goal, day);
    if (streak >= DEVIL_STREAK && ordinal % 2 === 0) {
      push(c.pre, 'devil', copy.notify.devil[(ordinal / 2) % copy.notify.devil.length], '/');
    } else {
      push(c.pre, 'pre', copy.notify.pre(s.targetMinutes), '/');
    }
    push(c.start, 'start', copy.notify.start(s.targetMinutes), '/session/reason');

    const remain = Math.max(1, Math.ceil(s.targetMinutes - (row?.activeSeconds ?? 0) / 60));
    const lines = nagLines(material(goal, input, today, remain));
    const left = day === today && input.leftAt !== null ? input.leftAt + NAG_INTERVAL_MS : null;
    const nagStart = left !== null ? Math.max(left, c.graceEnd) : c.graceEnd;
    for (let i = 0; i < NAG_COUNT; i++) push(nagStart + i * NAG_INTERVAL_MS, 'nag', lines[i % lines.length], '/session/reason');
  }
  return out;
}

export function buildPlan(input: PlanInput): Planned[] {
  const { goal, lastGoal, suspension, now, timeZone } = input;
  const today = dayKeyOf(now, timeZone);
  let out: Planned[];
  if (goal && goal.status === 'active') {
    out = goal.giveupRequestedAt !== null ? giveupPlan(goal, input, today) : cyclePlan(goal, input, today);
  } else if (suspension) {
    out = suspendedPlan(suspension, input, today);
  } else if (lastGoal) {
    out = noGoalPlan(lastGoal, input, today);
  } else {
    out = [];
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_PENDING);
}
