// store 캐시에서 화면, 라우팅, 알림 계획이 쓰는 값을 뽑는 순수 함수. React Native를 import하지 않는다(Node 테스트용).
import { firstLine } from './archive';
import type { AppGoal, Message, Profile } from './model';
import type { PlanInput } from './plan';
import type { RouteInput } from './route';
import { addDays, APP_TIME_ZONE, cycleOf, dayKeyOf, isStudyDay, settingsFor, type DayRow, type DayStatus, type Goal } from './rules';

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

/** 하루 키. 한국 시간 기준(명세 1절) */
export const todayKeyOf = (now: number) => dayKeyOf(now, APP_TIME_ZONE);

/** 기기 시간대가 UTC+9가 아니면 시각 옆에 한국 시간 표시를 붙인다. offsetMinutes는 Date#getTimezoneOffset() 값 */
export const showsKstLabel = (offsetMinutes: number) => offsetMinutes !== -540;

export function goalDaysOf(c: Pick<Cache, 'goal' | 'days'>): DayRow[] {
  const id = c.goal?.id;
  return id ? c.days.filter((d) => d.goalId === id) : [];
}

export function todayRowOf(c: Pick<Cache, 'goal' | 'days'>, now: number): DayRow | undefined {
  const day = todayKeyOf(now);
  return goalDaysOf(c).find((d) => d.day === day);
}

export function isSuspended(p: Profile | null, now: number): boolean {
  return !!p && !p.banned && p.suspendedUntil !== null && p.suspendedUntil > now;
}

export function routeInputOf(
  c: Cache,
  s: { authed: boolean; onboarded: boolean; loadFailed: boolean },
  now: number,
): RouteInput {
  const row = todayRowOf(c, now);
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
export function planInputOf(c: Cache, now: number): PlanInput {
  const timeZone = APP_TIME_ZONE;
  const today = dayKeyOf(now, timeZone);
  const p = c.profile;
  const goal = c.goal?.status === 'active' ? c.goal : null;
  const suspended = isSuspended(p, now);
  const blocked = !!p?.banned || suspended;
  // 정지 중 하루 1회 알림의 시각. 서버 프로필 값을 먼저 쓰고, 없으면 확정 전에 옮겨 둔 캐시를 쓴다
  const suspendedStart = p?.suspendedStartMinutes ?? c.suspendedGoal?.startMinutes ?? null;
  return {
    goal: blocked ? null : goal,
    lastGoal: goal || blocked ? null : c.lastGoal,
    days: goal ? goalDaysOf(c).map((d) => ({ day: d.day, status: d.status, activeSeconds: d.activeSeconds, targetMinutes: d.targetMinutes })) : [],
    leftAt: c.leftAt && c.leftAt.day === today ? c.leftAt.at : null,
    lastRetro: c.lastRetro,
    suspension: suspended && p?.suspendedUntil && suspendedStart !== null ? { until: p.suspendedUntil, startMinutes: suspendedStart } : null,
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

// ---------- 홈 (P7, P8) ----------

/** 홈 위에 쌓는 빨강 배너. 위에서부터 이 순서다 */
export type HomeBanner = 'offline' | 'load_failed' | 'notif_off' | 'exact_alarm';

/**
 * 알림이 꺼져 있으면 설정 열기(12.2). 알림은 켜졌는데 Android 정확한 알람 권한이 없으면 그 설정 열기(P8-3).
 * 권한을 아직 읽지 않았으면(null) 띄우지 않는다(앱 시작 직후 깜빡임 방지). 읽었는데 허용이 아니면(거부, 아직 묻지 않음) 띄운다(U9 Q2).
 * 정확한 알람 권한을 확인할 수 없으면('unknown', Expo Go와 웹) 띄우지 않는다.
 */
export function homeBanners(i: {
  permission: 'granted' | 'denied' | 'undetermined' | null;
  exactAlarm: 'granted' | 'denied' | 'unknown';
  loadFailed: boolean;
  offline: boolean;
}): HomeBanner[] {
  const out: HomeBanner[] = [];
  if (i.loadFailed) out.push(i.offline ? 'offline' : 'load_failed');
  if (i.permission !== null && i.permission !== 'granted') out.push('notif_off');
  else if (i.permission === 'granted' && i.exactAlarm === 'denied') out.push('exact_alarm');
  return out;
}

/** 남은 시간이 24시간 이상이면 일과 시간("1일 9시간"). 그보다 짧으면 null이고 홈은 shortWaitOf로 센다 */
export function longWaitOf(ms: number): { days: number; hours: number } | null {
  if (ms < 86_400_000) return null;
  const hours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(hours / 24), hours: hours % 24 };
}

/**
 * 24시간보다 짧은 남은 시간. 1시간 이상이면 시간과 분("3시간 24분"), 그보다 짧으면 분과 초("24분 13초").
 * "00:24"처럼 시각과 같은 모양이면 남은 시간인지 알 수 없었다(U9 D10)
 */
export function shortWaitOf(ms: number): { hours: number; minutes: number } | { minutes: number; seconds: number } {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 3600) return { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60) };
  return { minutes: Math.floor(s / 60), seconds: s % 60 };
}

/** from부터(포함) 처음 오는 학습일. 2주 안에 없으면 null */
export function nextStudyDay(goal: Goal, from: string): string | null {
  let d = from < goal.firstDay ? goal.firstDay : from;
  for (let i = 0; i < 14; i++, d = addDays(d, 1)) if (isStudyDay(d, settingsFor(goal, d).weekdays)) return d;
  return null;
}

/**
 * 오늘 전 마지막 학습일의 결과. 쉬는 요일과 포기 대기일은 건너뛴다. 첫 도전일 전이면 null.
 * 아직 판정 전이라 행이 없는 지난 학습일은 실패로 본다(rules.streakOf와 같다).
 */
export function lastStudyResult(goal: Goal, days: readonly Pick<DayRow, 'day' | 'status'>[], today: string): { day: string; status: DayStatus } | null {
  const statusOf = new Map(days.map((d) => [d.day, d.status]));
  for (let d = addDays(today, -1), i = 0; d >= goal.firstDay && i < 14; d = addDays(d, -1), i++) {
    const st = statusOf.get(d);
    if (st === 'rest' || st === 'giveup_wait') continue;
    if (st === undefined && !isStudyDay(d, settingsFor(goal, d).weekdays)) continue;
    return { day: d, status: st ?? 'failed' };
  }
  return null;
}

/** 홈 한 줄 안내. 지난 학습일 실패(S9), 쿠폰 다음 날 복귀(9.2). 오늘이 끝났으면 없다 */
export type HomeNote = 'failed' | 'back_from_coupon' | null;

export function homeNoteOf(goal: Goal, days: readonly Pick<DayRow, 'day' | 'status'>[], today: string): HomeNote {
  const t = days.find((d) => d.day === today)?.status;
  if (t === 'done' || t === 'coupon') return null;
  const last = lastStudyResult(goal, days, today);
  if (last?.status === 'failed') return 'failed';
  if (last?.status === 'coupon') return 'back_from_coupon';
  return null;
}

/**
 * 완료 화면 쿠폰 획득 카드의 숫자(갭분석 3.1-11). got은 이번에 채운 연속 학습일, next는 다음 쿠폰까지 연속 학습일.
 * 받은 직후 서버는 진행일을 0으로, 기준 주를 1 올린다. 화면이 그 값을 다시 읽기 전이면 진행일이 0이 아니다(기준이 최소 2주 x 5일).
 */
export function couponEarnedOf(goal: Pick<Goal, 'couponStreakGoalWeeks' | 'couponProgressDays' | 'weekdays'>): { got: number; next: number } {
  const weeks = goal.couponProgressDays === 0 ? goal.couponStreakGoalWeeks - 1 : goal.couponStreakGoalWeeks;
  return { got: weeks * goal.weekdays.length, next: (weeks + 1) * goal.weekdays.length };
}

/** 오늘 회고 첫 답의 첫 줄 (홈 완료 상태) */
export function retroFirstLine(messages: readonly Message[]): string | null {
  const first = messages
    .filter((m) => m.phase === 'retro' && m.role === 'user' && !m.pending)
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  const line = first ? firstLine(first.text) : '';
  return line ? line : null;
}

/** 알림 탭 판단용 상태 (notifyTarget.tapTarget) */
export function tapStateOf(c: Cache, now: number) {
  const row = todayRowOf(c, now);
  return {
    hasActiveGoal: c.goal?.status === 'active',
    giveupPending: c.goal?.giveupRequestedAt != null,
    suspended: isSuspended(c.profile, now),
    today: todayKeyOf(now),
    todayStatus: row?.status === 'progress' ? ('progress' as const) : row?.status === 'done' || row?.status === 'coupon' ? ('closed' as const) : ('none' as const),
  };
}


// ---------- 화면 상태 (MP 7.4-2) ----------

/** 로딩 표시를 띄우는 시각과 오류로 바꾸는 시각 */
export const LOAD_SHOW_MS = 300;
export const LOAD_ERROR_MS = 10_000;

export type LoadPhase = 'idle' | 'pending' | 'loading' | 'error';

/** elapsed는 요청이 걸린 시간(쉬면 null). 300ms 전에는 아무것도 띄우지 않고, 10초를 넘으면 오류로 본다 */
export function loadPhaseOf(elapsed: number | null, failed: boolean): LoadPhase {
  if (elapsed === null) return failed ? 'error' : 'idle';
  if (elapsed < LOAD_SHOW_MS) return 'pending';
  if (elapsed < LOAD_ERROR_MS) return 'loading';
  return 'error';
}
