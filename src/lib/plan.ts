// 알림 예약 계획. 순수 함수라 테스트로 개수와 시각을 검증한다.
// iOS는 기기에 대기시킬 수 있는 로컬 알림이 64개까지라 오늘과 내일만 계획한다.
import { copy, giveupLines, nagLines, type NagMaterial } from './copy';
import {
  addDays,
  cycleOf,
  dayEnd,
  dayKeyOf,
  daysSinceStart,
  DEVIL_STREAK,
  NAG_COUNT,
  NAG_INTERVAL_MS,
  settingsFor,
  streakOf,
  totalMinutes,
  type DayRecord,
  type Goal,
} from './rules';

export const MAX_PENDING = 63;

export type Planned = { at: number; body: string; url: string };

export type PlanInput = {
  goal: Goal | null;
  /** 목표 없이 끝난 직전 목표 (달성 후 새 목표를 안 만든 경우) */
  lastGoal: Goal | null;
  records: DayRecord[];
  now: number;
};

function material(goal: Goal, records: DayRecord[], now: number, remainMinutes: number): NagMaterial {
  const mine = records.filter((r) => r.goalId === goal.id);
  const reviews = mine.filter((r) => r.review).sort((a, b) => (a.day < b.day ? 1 : -1));
  return {
    targetMinutes: settingsFor(goal, dayKeyOf(now)).targetMinutes,
    remainMinutes,
    goalName: goal.name,
    reason: goal.reason,
    totalMinutes: totalMinutes(mine),
    days: daysSinceStart(goal, now) + 1,
    lastReview: reviews[0]?.review ?? null,
  };
}

export function buildPlan({ goal, lastGoal, records, now }: PlanInput): Planned[] {
  const today = dayKeyOf(now);
  const out: Planned[] = [];

  if (!goal) {
    if (!lastGoal) return out;
    // 새 목표를 안 정했으면 다음 날 같은 시각부터 독촉
    const c = cycleOf(addDays(today, 1), lastGoal.startMinutes, 0);
    for (let i = 0; i < NAG_COUNT; i++) out.push({ at: c.start + i * NAG_INTERVAL_MS, body: copy.notify.noGoal, url: '/goal/new' });
    return out;
  }

  const recordOf = (d: string) => records.find((r) => r.goalId === goal.id && r.day === d);
  const rec = recordOf(today);
  const open = rec?.status !== 'done' && rec?.status !== 'coupon';
  const streak = streakOf(goal, recordOf, today);
  const pending = goal.giveupSince !== null;

  const pushCycle = (day: string, from: number | null, withNags: boolean) => {
    const s = settingsFor(goal, day);
    const c = cycleOf(day, s.startMinutes, s.targetMinutes);
    const r = recordOf(day);
    const remain = Math.max(1, Math.ceil(s.targetMinutes - (r?.activeSeconds ?? 0) / 60));
    const m = material(goal, records, now, remain);
    if (c.pre > now) {
      const devil = streak >= DEVIL_STREAK && !pending;
      const body = devil ? copy.notify.devil[streak % copy.notify.devil.length] : copy.notify.pre(s.targetMinutes);
      out.push({ at: c.pre, body, url: '/' });
    }
    if (!withNags) return;
    const lines = pending ? giveupLines(m) : nagLines(m);
    const nagStart = from !== null ? Math.max(from, c.graceEnd) : c.graceEnd;
    const end = dayEnd(day);
    for (let i = 0; i < NAG_COUNT; i++) {
      const at = nagStart + i * NAG_INTERVAL_MS;
      if (at <= now || at >= end) continue;
      out.push({ at, body: lines[i % lines.length], url: pending ? '/' : '/session/reason' });
    }
  };

  if (open) {
    const left = rec?.leftAt != null ? rec.leftAt + NAG_INTERVAL_MS : null;
    pushCycle(today, left, true);
    pushCycle(addDays(today, 1), null, false);
  } else {
    pushCycle(addDays(today, 1), null, true);
  }

  return out.sort((a, b) => a.at - b.at).slice(0, MAX_PENDING);
}
