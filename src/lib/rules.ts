// 그래고의 정책 규칙 (기획서 v9, 학습세션 결정안). 정책 숫자와 판정은 전부 여기에만 둔다.
// import 없음. Node(앱, 테스트)와 Deno(Edge Function) 양쪽에서 그대로 돈다. 시간대 계산은 Intl만 쓴다.
// supabase/functions/_shared/rules.ts는 이 파일의 사본이다. 고친 뒤 `npm run sync:rules`.
// SQL(supabase/migrations)에 같은 규칙이 있다. 숫자를 바꾸면 양쪽을 같이 바꾼다.

// ---------- 정책 숫자 ----------

export const DAY_BOUNDARY_HOUR = 4; // 하루의 경계. 자정이 아니라 현지 04:00
export const PRE_REMIND_MIN = 30; // 사전 알림: 시작 30분 전
export const NAG_COUNT = 60; // 독촉 60회
export const NAG_INTERVAL_MS = 60_000; // 1분 간격

export const TARGET_MIN = 10; // 하루 학습 분
export const TARGET_MAX = 30;
export const PERIOD_MIN = 7; // 목표 기간(일)
export const PERIOD_MAX = 90;
export const PERIOD_DEFAULT = 14;
export const MIN_WEEKDAYS = 5; // 학습 요일 주 5일 이상. 요일은 0=일 ~ 6=토
export const MIN_NOTE_CHARS = 20; // 처음 이유, 오늘의 이유
export const MIN_AGE = 18; // 가입 연령. Gemini API 추가 약관(18세 미만 서비스 금지)

export const PHASE_A_RATIO = 0.2; // A 20%, B 60%, C 20%
export const PHASE_B_END_RATIO = 0.8;
export const RETRO_SECONDS = 180; // 회고 3분. 학습과 같은 규칙으로 센다
export const IDLE_MS = 120_000; // 2분 무활동이면 딴짓 팝업

export const INITIAL_COUPONS = 3;
export const FIRST_COUPON_WEEKS = 2; // 2주, 3주, 4주... 연속 완료마다 1장

export const GIVEUP_WAIT_MS = 24 * 3600_000; // 포기 신청 뒤 대기
export const GIVEUP_NOTIFY_COUNT = 12; // 대기 중 알림 12회
export const GIVEUP_NOTIFY_INTERVAL_MS = 2 * 3600_000; // 2시간 간격
export const GIVEUP_MAX_CONFIRMED = 3; // 계정당 포기 확정 3회째에 영구 정지
export const SUSPENSION_DAYS = [7, 14] as const; // 1회 7일, 2회 14일

export const DEVIL_STREAK = 7; // 연속 7일 이상이면 악마의 속삭임

export const AI_DAILY_LIMIT = 150; // 사용자당 하루(하루 키) AI 호출
export const AI_GOAL_SETUP_LIMIT = 30; // 마지막 목표 생성 이후 목표 설정 대화

export const SECONDS_PER_QUESTION = 60; // 복습 문항: 분당 1개
export const REVIEW_INTERVALS = [1, 3, 7, 14] as const; // 학습일 기준
export const APPLY_ONLY_STREAK = 2; // 도움 없이 2회 연속이면 상황 적용만
export const NEW_ITEM_MIN = 2; // 하루 새 표현, 새 단어 각각
export const NEW_ITEM_MAX = 5;
export const NEW_ITEM_MINUTES_PER = 6;

// ---------- 타입 ----------

export type DayStatus = 'progress' | 'done' | 'coupon' | 'failed' | 'rest' | 'giveup_wait';
export type Phase = 'A' | 'B' | 'C' | 'retro';
export type GoalStatus = 'active' | 'achieved' | 'given_up';
export type Situation = { place: string; myRole: string; partner: string; task: string };
export type PendingChange = { startMinutes: number; targetMinutes: number; weekdays: number[]; fromDay: string };

/** 서버 goals 행의 camelCase 모양. 시각은 epoch ms, 날짜는 'YYYY-MM-DD'. */
export type Goal = {
  id: string;
  name: string;
  reason: string;
  periodDays: number;
  weekdays: number[];
  startMinutes: number;
  targetMinutes: number;
  situation: Situation;
  firstDay: string;
  status: GoalStatus;
  coupons: number;
  couponStreakGoalWeeks: number;
  couponProgressDays: number;
  settledDay: string;
  pendingChange: PendingChange | null;
  giveupRequestedAt: number | null;
  createdAt: number;
  endedAt: number | null;
};

/** 서버 days 행의 camelCase 모양. */
export type DayRow = {
  goalId: string;
  day: string;
  status: DayStatus;
  todayReason: string | null;
  phase: Phase | null;
  targetMinutes: number;
  sessionStartedAt: number | null;
  activeSeconds: number;
  retroStartedAt: number | null;
  retroSeconds: number;
  completedAt: number | null;
  couponEarned: boolean;
  createdAt: number;
};

export type QuizType = 'meaning_choice' | 'word_recall' | 'expression_recall' | 'situation';
export type ItemKind = 'word' | 'expression';
export type ItemState = 'seen' | 'taught' | 'used' | 'recalled';

/** 서버 items 행. base는 단어면 소문자 기본형, 표현이면 빈칸을 '…'로 쓴 패턴. */
export type Item = {
  id: string;
  goalId: string;
  kind: ItemKind;
  base: string;
  ko: string;
  note: string;
  state: ItemState;
  srsStep: number;
  nextDueDay: string | null;
  unaidedStreak: number;
  firstDay: string | null;
  createdAt: number;
};

/** 서버 item_events 행. */
export type ItemEvent = {
  id: string;
  itemId: string;
  day: string;
  phase: string | null;
  kind: 'seen' | 'taught' | 'used' | 'quiz';
  aided: boolean;
  correct: boolean | null;
  questionType: QuizType | null;
  createdAt: number;
};

// ---------- 날짜와 시간대 ----------

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 86400_000;

function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d };
}

function fmtUtcDay(ms: number): string {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const dayUtc = (day: string) => {
  const { y, m, d } = parseDay(day);
  return Date.UTC(y, m - 1, d);
};

export function addDays(day: string, n: number): string {
  return fmtUtcDay(dayUtc(day) + n * DAY_MS);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((dayUtc(b) - dayUtc(a)) / DAY_MS);
}

/** 0=일 ~ 6=토 (JS getDay와 같다) */
export function weekdayOf(day: string): number {
  return new Date(dayUtc(day)).getUTCDay();
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterOf(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** 그 시간대의 벽시계 값 */
export function localParts(ts: number, timeZone: string) {
  const out: Record<string, number> = {};
  for (const p of formatterOf(timeZone).formatToParts(ts)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

/** 벽시계 값을 UTC로 읽은 ms. 시간대 오프셋 계산용 */
function wallAsUtc(ts: number, timeZone: string): number {
  const p = localParts(ts, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

// 분 단위로 맞춘 ts에만 쓴다
const offsetAt = (ts: number, timeZone: string) => wallAsUtc(ts, timeZone) - ts;

/**
 * 그 시간대에서 day 00:00 + minutes 의 epoch ms. minutes는 1440을 넘어도 된다.
 * 서머타임으로 없는 시각은 전환 전 오프셋을 써서 앞으로 밀고, 두 번 있는 시각은 전환 뒤(표준시)로 본다. Postgres와 같다.
 */
export function zonedTime(day: string, minutes: number, timeZone: string): number {
  const wall = dayUtc(day) + minutes * 60_000;
  const tBefore = wall - offsetAt(wall - DAY_MS, timeZone);
  const tAfter = wall - offsetAt(wall + DAY_MS, timeZone);
  return wallAsUtc(tAfter, timeZone) === wall ? tAfter : tBefore;
}

/** 하루 키: 현지 시각에서 4시간을 뺀 날짜. SQL `((now() at time zone tz) - interval '4 hours')::date` 와 같다. */
export function dayKeyOf(ts: number, timeZone: string): string {
  const p = localParts(ts, timeZone);
  return fmtUtcDay(Date.UTC(p.year, p.month - 1, p.day, p.hour - DAY_BOUNDARY_HOUR));
}

/** 하루가 끝나는 순간 (다음 날 04:00 현지) */
export function dayEnd(day: string, timeZone: string): number {
  return zonedTime(day, 1440 + DAY_BOUNDARY_HOUR * 60, timeZone);
}

/** 그날의 사이클. 04:00 이전 시작 시각은 달력상 다음 날에 속한다. */
export function cycleOf(day: string, startMinutes: number, targetMinutes: number, timeZone: string) {
  const extra = startMinutes < DAY_BOUNDARY_HOUR * 60 ? 1440 : 0;
  const start = zonedTime(day, startMinutes + extra, timeZone);
  const graceEnd = start + targetMinutes * 60_000;
  return {
    pre: start - PRE_REMIND_MIN * 60_000,
    start,
    graceEnd,
    nagEnd: graceEnd + NAG_COUNT * NAG_INTERVAL_MS,
    end: dayEnd(day, timeZone),
  };
}

// ---------- 학습 요일 ----------

export function isStudyDay(day: string, weekdays: readonly number[]): boolean {
  return weekdays.includes(weekdayOf(day));
}

/** day 뒤로 학습 요일만 세어 n번째 학습일. n=0이면 day 그대로. */
export function addStudyDays(day: string, n: number, weekdays: readonly number[]): string {
  if (!weekdays.some((w) => w >= 0 && w <= 6)) throw new Error('weekdays is empty');
  let d = day;
  for (let left = n; left > 0; ) {
    d = addDays(d, 1);
    if (isStudyDay(d, weekdays)) left--;
  }
  return d;
}

/** 그날 적용되는 시각, 분, 요일 (예약 변경 반영) */
export function settingsFor(goal: Goal, day: string): { startMinutes: number; targetMinutes: number; weekdays: number[] } {
  const c = goal.pendingChange;
  if (c && day >= c.fromDay) return { startMinutes: c.startMinutes, targetMinutes: c.targetMinutes, weekdays: c.weekdays };
  return { startMinutes: goal.startMinutes, targetMinutes: goal.targetMinutes, weekdays: goal.weekdays };
}

// ---------- 목표 ----------

/** 첫 도전일 = 목표를 만든 날의 하루 키 + 1 */
export function firstDayFor(createdAt: number, timeZone: string): string {
  return addDays(dayKeyOf(createdAt, timeZone), 1);
}

export function validWeekdays(weekdays: readonly number[]): boolean {
  const ok = weekdays.every((w) => Number.isInteger(w) && w >= 0 && w <= 6);
  return ok && new Set(weekdays).size === weekdays.length && weekdays.length >= MIN_WEEKDAYS;
}

const inRange = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

/** create_goal 검사와 같다. 문제 없으면 null. */
export function goalInputError(input: {
  periodDays: number;
  weekdays: readonly number[];
  startMinutes: number;
  targetMinutes: number;
  reason: string;
}): 'invalid' | 'reason_short' | null {
  if (!inRange(input.periodDays, PERIOD_MIN, PERIOD_MAX)) return 'invalid';
  if (!inRange(input.targetMinutes, TARGET_MIN, TARGET_MAX)) return 'invalid';
  if (!inRange(input.startMinutes, 0, 1439)) return 'invalid';
  if (!validWeekdays(input.weekdays)) return 'invalid';
  if (input.reason.trim().length < MIN_NOTE_CHARS) return 'reason_short';
  return null;
}

/** 오늘의 이유: 20자 이상, 직전 학습일과 같은 문장 거부 */
export function noteValid(text: string, previous?: string): boolean {
  const t = text.trim();
  if (t.length < MIN_NOTE_CHARS) return false;
  if (previous !== undefined && t === previous.trim()) return false;
  return true;
}

/** 달성 선언이 열리는 날 */
export function achieveDay(goal: Goal): string {
  return addDays(goal.firstDay, goal.periodDays);
}

export function canAchieve(goal: Goal, today: string): boolean {
  return today >= achieveDay(goal);
}

// ---------- 연속과 쿠폰 ----------

type DayLike = { day: string; status: DayStatus };

/**
 * 연속 N일. 학습 요일만 센다. done이면 +1, rest와 giveup_wait는 건너뛴다, coupon과 failed는 끊는다.
 * 행이 없는 지난 학습일은 실패로 본다. 오늘은 done일 때만 센다(오늘 쿠폰이면 0).
 */
export function streakOf(days: readonly DayLike[], firstDay: string, today: string, weekdays: readonly number[]): number {
  const statusOf = new Map(days.map((r) => [r.day, r.status]));
  let n = 0;
  const t = statusOf.get(today);
  if (t === 'coupon' || t === 'failed') return 0;
  if (t === 'done') n++;
  for (let d = addDays(today, -1); d >= firstDay; d = addDays(d, -1)) {
    const st = statusOf.get(d);
    if (st === 'done') n++;
    else if (st === 'rest' || st === 'giveup_wait') continue;
    else if (st === undefined && !isStudyDay(d, weekdays)) continue;
    else break;
  }
  return n;
}

/** 쿠폰을 받는 데 필요한 연속 완료 학습일 수 */
export function couponThreshold(goal: Goal): number {
  return goal.couponStreakGoalWeeks * goal.weekdays.length;
}

export function daysToNextCoupon(goal: Goal): number {
  return couponThreshold(goal) - goal.couponProgressDays;
}

/** 하루를 채웠을 때. 진행일을 올리고 기준을 넘으면 쿠폰 1장, 다음 기준은 1주 늘어난다. */
export function completeDayCoupon(goal: Goal): { goal: Goal; earned: boolean } {
  const progress = goal.couponProgressDays + 1;
  if (progress >= couponThreshold(goal)) {
    return {
      goal: { ...goal, coupons: goal.coupons + 1, couponStreakGoalWeeks: goal.couponStreakGoalWeeks + 1, couponProgressDays: 0 },
      earned: true,
    };
  }
  return { goal: { ...goal, couponProgressDays: progress }, earned: false };
}

export function spendCoupon(goal: Goal): Goal | null {
  if (goal.coupons <= 0) return null;
  return { ...goal, coupons: goal.coupons - 1, couponProgressDays: 0 };
}

// ---------- 판정 ----------

/** 그날(04:00~다음 날 04:00)이 포기 대기 24시간과 겹치는지 */
function overlapsGiveup(goal: Goal, day: string, timeZone: string): boolean {
  const at = goal.giveupRequestedAt;
  if (at === null) return false;
  return zonedTime(day, DAY_BOUNDARY_HOUR * 60, timeZone) < at + GIVEUP_WAIT_MS && dayEnd(day, timeZone) > at;
}

/**
 * 끝난 날(settledDay+1 .. today-1)을 판정한다. SQL settle_goal과 같은 규칙.
 * first_day 이전은 건너뛴다. done, coupon은 그대로 둔다. 포기 대기와 겹친 날은 giveup_wait.
 * 그날 학습 요일이 아니면 rest. 나머지(행 없음, progress)는 failed이고 쿠폰 진행일이 0이 된다.
 * from_day가 된 예약 변경은 목표에 넣는다.
 */
export function settle(
  goal: Goal,
  days: readonly DayLike[],
  today: string,
  timeZone: string,
): { goal: Goal; writes: DayLike[] } {
  const statusOf = new Map(days.map((r) => [r.day, r.status]));
  const writes: DayLike[] = [];
  let g = goal;
  for (let d = addDays(g.settledDay, 1); d < today; d = addDays(d, 1)) {
    g = { ...g, settledDay: d };
    if (d < g.firstDay) continue;
    const st = statusOf.get(d);
    if (st === 'done' || st === 'coupon' || st === 'rest' || st === 'failed' || st === 'giveup_wait') continue;
    if (overlapsGiveup(g, d, timeZone)) writes.push({ day: d, status: 'giveup_wait' });
    else if (!isStudyDay(d, settingsFor(g, d).weekdays)) writes.push({ day: d, status: 'rest' });
    else {
      writes.push({ day: d, status: 'failed' });
      g = { ...g, couponProgressDays: 0 };
    }
  }
  const c = g.pendingChange;
  if (c && today >= c.fromDay) {
    g = { ...g, startMinutes: c.startMinutes, targetMinutes: c.targetMinutes, weekdays: c.weekdays, pendingChange: null };
  }
  return { goal: g, writes };
}

// ---------- 홈 ----------

export type HomeState =
  | 'none'
  | 'before_first'
  | 'rest'
  | 'waiting'
  | 'soon'
  | 'grace'
  | 'nag'
  | 'resume'
  | 'done'
  | 'coupon'
  | 'giveup';

export function homeState(
  goal: Goal | null,
  today: { status: DayStatus; activeSeconds: number } | undefined,
  now: number,
  timeZone: string,
): HomeState {
  if (!goal) return 'none';
  if (goal.giveupRequestedAt !== null) return 'giveup';
  const day = dayKeyOf(now, timeZone);
  if (day < goal.firstDay) return 'before_first';
  if (today?.status === 'done') return 'done';
  if (today?.status === 'coupon') return 'coupon';
  const s = settingsFor(goal, day);
  if (!isStudyDay(day, s.weekdays)) return 'rest';
  if (today?.status === 'progress' && today.activeSeconds > 0) return 'resume';
  const c = cycleOf(day, s.startMinutes, s.targetMinutes, timeZone);
  if (now < c.pre) return 'waiting';
  if (now < c.start) return 'soon';
  if (now < c.graceEnd) return 'grace';
  return 'nag';
}

// ---------- 포기와 이용 정지 ----------

export function giveupEndsAt(goal: Goal): number | null {
  return goal.giveupRequestedAt === null ? null : goal.giveupRequestedAt + GIVEUP_WAIT_MS;
}

export function giveupExpired(goal: Goal, now: number): boolean {
  const end = giveupEndsAt(goal);
  return end !== null && now >= end;
}

/** 대기 중 알림 시각 12개. 신청 1시간 뒤부터 2시간 간격이라 모두 24시간 안에 든다. */
export function giveupWaitNotifications(requestedAt: number): number[] {
  const first = requestedAt + GIVEUP_NOTIFY_INTERVAL_MS / 2;
  return Array.from({ length: GIVEUP_NOTIFY_COUNT }, (_, i) => first + i * GIVEUP_NOTIFY_INTERVAL_MS);
}

/** 확정 횟수(이번 확정 포함)에 따른 정지. 3회째는 영구 정지. */
export function suspensionFor(confirmedCount: number): { days: 7 | 14 | null; banned: boolean } {
  if (confirmedCount >= GIVEUP_MAX_CONFIRMED) return { days: null, banned: true };
  if (confirmedCount === 2) return { days: SUSPENSION_DAYS[1], banned: false };
  if (confirmedCount === 1) return { days: SUSPENSION_DAYS[0], banned: false };
  return { days: null, banned: false };
}

// ---------- 학습 시간 ----------

/** 단계 경계(초). A 끝 = round(T*0.2), B 끝 = round(T*0.8), T = target*60 */
export function phaseBounds(targetMinutes: number): { aEnd: number; bEnd: number; total: number } {
  const total = targetMinutes * 60;
  return { aEnd: Math.round(total * PHASE_A_RATIO), bEnd: Math.round(total * PHASE_B_END_RATIO), total };
}

export function phaseAt(activeSeconds: number, targetMinutes: number): Phase {
  const b = phaseBounds(targetMinutes);
  if (activeSeconds < b.aEnd) return 'A';
  if (activeSeconds < b.bEnd) return 'B';
  if (activeSeconds < b.total) return 'C';
  return 'retro';
}

/**
 * 딴짓 판정. 모달 열기와 닫기, 카드 뒤집기, 선택지 탭, 타이핑, 전송은 모두 활동이고
 * 그때마다 lastActivityAt을 지금으로 바꾼다(결정안 4).
 */
export function isIdle(lastActivityAt: number, now: number): boolean {
  return now - lastActivityAt >= IDLE_MS;
}

/** 학습 중 전송은 글자 수 제한이 없다(결정안 3). 빈 문장만 막는다. */
export function canSend(text: string): boolean {
  return text.trim().length > 0;
}

/** complete_day 검사와 같다. 센 시간은 서버 경과 시간을 넘을 수 없다. */
export function canCompleteDay(
  d: Pick<DayRow, 'targetMinutes' | 'sessionStartedAt' | 'activeSeconds' | 'retroStartedAt' | 'retroSeconds'>,
  now: number,
): boolean {
  if (d.sessionStartedAt === null || d.retroStartedAt === null) return false;
  const target = d.targetMinutes * 60;
  if (d.activeSeconds < target || now - d.sessionStartedAt < target * 1000) return false;
  return d.retroSeconds >= RETRO_SECONDS && now - d.retroStartedAt >= RETRO_SECONDS * 1000;
}

// ---------- 복습 문항 (결정안 5, 11, 13) ----------

/** 그 단계 시간에 낼 문항 수. 분당 1개, 최소 1개 */
export function questionCount(phaseSeconds: number): number {
  return Math.max(1, Math.floor(phaseSeconds / SECONDS_PER_QUESTION));
}

const QUIZ_LAYOUT: Record<'A' | 'C', [QuizType, QuizType, QuizType]> = {
  A: ['word_recall', 'expression_recall', 'situation'],
  C: ['meaning_choice', 'expression_recall', 'situation'],
};

/**
 * 문항 유형 순서. 3개면 [1, 2, 3], 2개면 [1, 3], 1개면 [3], 4개 이상이면 2번 유형을 늘린다.
 * levelCheck(첫날 A, 이전 항목 0개)는 상황 적용만 낸다.
 */
export function quizTypesFor(phase: 'A' | 'C', count: number, opts: { levelCheck?: boolean } = {}): QuizType[] {
  const n = Math.max(1, count);
  if (opts.levelCheck) return Array<QuizType>(n).fill('situation');
  const [first, middle, last] = QUIZ_LAYOUT[phase];
  if (n === 1) return [last];
  return [first, ...Array<QuizType>(n - 2).fill(middle), last];
}

/** index번째 문항 유형. 계획한 수를 넘기면(시간이 남으면) 마지막 유형을 계속 낸다. */
export function quizTypeAt(phase: 'A' | 'C', count: number, index: number, opts: { levelCheck?: boolean } = {}): QuizType {
  const types = quizTypesFor(phase, count, opts);
  return types[Math.min(index, types.length - 1)];
}

/** 도움 없이 2회 연속 회상한 항목은 상황 적용으로만 낸다 */
export function typeForItem(type: QuizType, unaidedStreak: number): QuizType {
  return unaidedStreak >= APPLY_ONLY_STREAK ? 'situation' : type;
}

/** 하루 새 항목 상한(표현, 단어 각각). 10분 2, 15분 3, 30분 5 */
export function newItemCap(targetMinutes: number): number {
  return Math.min(NEW_ITEM_MAX, Math.max(NEW_ITEM_MIN, Math.round(targetMinutes / NEW_ITEM_MINUTES_PER)));
}

/**
 * 복습 결과로 다음 간격을 정한다. srsStep은 REVIEW_INTERVALS의 칸 번호(처음 0 = 1학습일 뒤).
 * 도움 없이 맞히면 다음 칸, 마지막 칸(14)을 통과하면 recalled로 굳는다(intervalDays 0, 복습 대상에서 빠짐).
 * 도움을 받거나 틀리면 0칸(1학습일)으로 돌아가고 연속 회상 수는 0.
 * 다음 복습일은 addStudyDays(오늘, intervalDays, weekdays).
 */
export function nextSrs(
  prev: { srsStep: number; unaidedStreak: number },
  r: { correct: boolean; aided: boolean },
): { srsStep: number; unaidedStreak: number; recalled: boolean; intervalDays: number } {
  if (!r.correct || r.aided) return { srsStep: 0, unaidedStreak: 0, recalled: false, intervalDays: REVIEW_INTERVALS[0] };
  const unaidedStreak = prev.unaidedStreak + 1;
  const last = REVIEW_INTERVALS.length - 1;
  if (prev.srsStep >= last) return { srsStep: last, unaidedStreak, recalled: true, intervalDays: 0 };
  const srsStep = prev.srsStep + 1;
  return { srsStep, unaidedStreak, recalled: false, intervalDays: REVIEW_INTERVALS[srsStep] };
}

// ---------- 성과 집계 (결정안 15) ----------

/**
 * 단어 기본형. 소문자, 앞뒤 문장부호 제거, 복수형과 3인칭 -s만 접는다.
 * 그 밖의 활용형(-ed, -ing, 불규칙)은 AI가 기본형으로 넘긴 base를 믿는다.
 */
export function wordBase(word: string): string {
  const w = word.trim().toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(sses|ches|shes|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** 표현 패턴. 소문자, 빈칸 표기(…, ..., ___)를 '…'로, 공백 정리, 끝 문장부호 제거 */
export function expressionPattern(text: string): string {
  return text
    .toLowerCase()
    .replace(/\.{3}|_{2,}/g, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.?!]+$/, '');
}

const itemKey = (i: Pick<Item, 'kind' | 'base'>) => `${i.kind}:${i.kind === 'word' ? wordBase(i.base) : expressionPattern(i.base)}`;

export type TodayStats = {
  newWords: number; // 오늘 처음 학습(taught)한 단어
  newExpressions: number; // 오늘 처음 학습한 표현
  recalledToday: number; // 오늘 도움 없이 맞힌 항목
  recalledLater: number; // 그중 학습한 날이 아닌 날에 맞힌 항목('기억 확인')
  applied: number; // 오늘 사용자 문장에 쓴 항목
  appliedAided: number; // 그중 도움 후 적용만 있었던 항목
  toReview: number; // 오늘 마지막 복습 결과가 틀림이거나 도움 후인 항목
};

/**
 * 완료 화면 성과 문장용 집계. 단어는 기본형, 표현은 빈칸 패턴으로 묶어 한 번만 센다.
 * '학습한 날'은 그 묶음의 첫 taught 날이다.
 */
export function todayStats(items: readonly Item[], events: readonly ItemEvent[], day: string): TodayStats {
  const keyOfItem = new Map(items.map((i) => [i.id, itemKey(i)]));
  const kindOfKey = new Map(items.map((i) => [itemKey(i), i.kind]));
  const learned = new Map<string, string>();
  for (const e of events) {
    const k = keyOfItem.get(e.itemId);
    if (!k || e.kind !== 'taught') continue;
    if (!learned.has(k) || e.day < learned.get(k)!) learned.set(k, e.day);
  }

  const recalled = new Set<string>();
  const usedAided = new Map<string, boolean>(); // 키 → 도움 후 적용만 있었는지
  const lastQuiz = new Map<string, ItemEvent>();
  const todays = events.filter((e) => e.day === day).sort((a, b) => a.createdAt - b.createdAt);
  for (const e of todays) {
    const k = keyOfItem.get(e.itemId);
    if (!k) continue;
    if (e.kind === 'quiz') {
      lastQuiz.set(k, e);
      if (e.correct && !e.aided) recalled.add(k);
    } else if (e.kind === 'used') {
      usedAided.set(k, (usedAided.get(k) ?? true) && e.aided);
    }
  }

  const newOf = (kind: ItemKind) => [...learned].filter(([k, d]) => d === day && kindOfKey.get(k) === kind).length;
  return {
    newWords: newOf('word'),
    newExpressions: newOf('expression'),
    recalledToday: recalled.size,
    recalledLater: [...recalled].filter((k) => (learned.get(k) ?? day) < day).length,
    applied: usedAided.size,
    appliedAided: [...usedAided.values()].filter(Boolean).length,
    toReview: [...lastQuiz.values()].filter((e) => !e.correct || e.aided).length,
  };
}

// ---------- 표시 ----------

export function totalMinutes(days: readonly { activeSeconds: number }[]): number {
  return Math.floor(days.reduce((a, r) => a + r.activeSeconds, 0) / 60);
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
