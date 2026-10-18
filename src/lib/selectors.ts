// store 캐시에서 화면, 라우팅, 알림 계획이 쓰는 값을 뽑는 순수 함수. React Native를 import하지 않는다(Node 테스트용).
import type { AppGoal, Message, Profile } from './model';
import type { PlanInput } from './plan';
import type { RouteInput } from './route';
import { addDays, cycleOf, dayKeyOf, type DayRow } from './rules';

/** store가 서버에서 받아 캐시하는 값 */
export type Cache = {
  userId: string | null;
  profile: Profile | null;
  /** 활성 목표 */
  goal: AppGoal | null;
  /** 가장 최근에 달성한 목표 (목표 없음 독촉 재료) */
  lastGoal: AppGoal | null;
  /** 보이는 목표 전부(활성, 달성). 기록 탭의 목표 이름용 */
  goals: AppGoal[];
  /** 보이는 목표들의 최근 날 */
  days: DayRow[];
  /** goalId:day → 그날 메시지 */
  messages: Record<string, Message[]>;
  /** 가장 최근 회고 2번 답 */
  lastRetro: string | null;
  /** 포기 확정된 목표의 원래 시각. RLS로 그 목표를 못 읽어서, 확정 전 캐시에서 옮겨 둔다 */
  suspendedGoal: { id: string; startMinutes: number; targetMinutes: number } | null;
  /** 오늘 학습 중 나간 시각 (이 기기) */
  leftAt: { day: string; at: number } | null;
};

export const EMPTY_CACHE: Cache = {
  userId: null,
  profile: null,
  goal: null,
  lastGoal: null,
  goals: [],
  days: [],
  messages: {},
  lastRetro: null,
  suspendedGoal: null,
  leftAt: null,
};

export const timeZoneOf = (c: Pick<Cache, 'profile'>, deviceTz: string) => c.profile?.timezone ?? deviceTz;

/** 하루 키. 서버 프로필 시간대 기준(명세 1절) */
export const todayKeyOf = (c: Pick<Cache, 'profile'>, now: number, deviceTz: string) => dayKeyOf(now, timeZoneOf(c, deviceTz));

export function goalDaysOf(c: Pick<Cache, 'goal' | 'days'>): DayRow[] {
  const id = c.goal?.id;
  return id ? c.days.filter((d) => d.goalId === id) : [];
}

export function todayRowOf(c: Pick<Cache, 'goal' | 'days' | 'profile'>, now: number, deviceTz: string): DayRow | undefined {
  const day = todayKeyOf(c, now, deviceTz);
  return goalDaysOf(c).find((d) => d.day === day);
}

export function isSuspended(p: Profile | null, now: number): boolean {
  return !!p && !p.banned && p.suspendedUntil !== null && p.suspendedUntil > now;
}

export function routeInputOf(
  c: Cache,
  s: { authed: boolean; onboarded: boolean; loadFailed: boolean },
  now: number,
  deviceTz: string,
): RouteInput {
  const row = todayRowOf(c, now, deviceTz);
  const today = row?.status === 'progress' ? 'progress' : row?.status === 'done' || row?.status === 'coupon' ? 'closed' : 'none';
  return {
    authed: s.authed,
    onboarded: s.onboarded,
    profile: c.profile ? { banned: c.profile.banned, suspendedUntil: c.profile.suspendedUntil } : null,
    hasActiveGoal: c.goal?.status === 'active',
    giveupPending: c.goal?.giveupRequestedAt != null,
    today,
    loadFailed: s.loadFailed,
    now,
  };
}

/** 알림 계획 입력 (plan.ts buildPlan) */
export function planInputOf(c: Cache, now: number, deviceTz: string): PlanInput {
  const timeZone = timeZoneOf(c, deviceTz);
  const today = dayKeyOf(now, timeZone);
  const p = c.profile;
  const goal = c.goal?.status === 'active' ? c.goal : null;
  const suspended = isSuspended(p, now);
  const blocked = !!p?.banned || suspended;
  return {
    goal: blocked ? null : goal,
    lastGoal: goal || blocked ? null : c.lastGoal,
    days: goal ? goalDaysOf(c).map((d) => ({ day: d.day, status: d.status, activeSeconds: d.activeSeconds, targetMinutes: d.targetMinutes })) : [],
    leftAt: c.leftAt && c.leftAt.day === today ? c.leftAt.at : null,
    lastRetro: c.lastRetro,
    suspension:
      suspended && p?.suspendedUntil && c.suspendedGoal ? { until: p.suspendedUntil, startMinutes: c.suspendedGoal.startMinutes } : null,
    now,
    timeZone,
  };
}

/**
 * 반성문 창. 포기한 목표의 원래 시작 시각부터 원래 학습 분 동안 열린다(명세 2절).
 * 서버(reflection 함수)와 같이 오늘과 어제 창을 본다. 닫혀 있으면 다음에 열리는 시각.
 */
export function reflectionWindow(
  sched: { startMinutes: number; targetMinutes: number },
  now: number,
  timeZone: string,
): { open: boolean; opensAt: number; closesAt: number } {
  const today = dayKeyOf(now, timeZone);
  for (const d of [addDays(today, -1), today, addDays(today, 1), addDays(today, 2)]) {
    const c = cycleOf(d, sched.startMinutes, sched.targetMinutes, timeZone);
    if (now < c.graceEnd) return { open: now >= c.start, opensAt: c.start, closesAt: c.graceEnd };
  }
  const c = cycleOf(addDays(today, 3), sched.startMinutes, sched.targetMinutes, timeZone);
  return { open: false, opensAt: c.start, closesAt: c.graceEnd };
}

/** 서버 시각 차이. 요청 왕복의 가운데를 서버 시각으로 본다 */
export function serverOffsetOf(sentAt: number, receivedAt: number, serverTime: number): number {
  return Math.round(serverTime - (sentAt + receivedAt) / 2);
}

/** 새로 읽은 프로필과 이전 캐시로 정지된 목표의 원래 시각을 정한다 */
export function nextSuspendedGoal(prev: Cache, profile: Profile | null): Cache['suspendedGoal'] {
  const id = profile?.suspendedGoalId;
  if (!id) return null;
  if (prev.suspendedGoal?.id === id) return prev.suspendedGoal;
  if (prev.goal?.id === id) return { id, startMinutes: prev.goal.startMinutes, targetMinutes: prev.goal.targetMinutes };
  return null;
}
