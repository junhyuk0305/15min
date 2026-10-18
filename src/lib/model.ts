// 서버 행(snake_case)을 앱 모양(camelCase, 시각은 epoch ms)으로 바꾸는 순수 함수와 타입.
// api.ts가 응답을 이 모양으로 돌려주고, store.ts가 그대로 캐시한다. React Native를 import하지 않는다(Node 테스트용).
import type { DayRow, DayStatus, Goal, Item, ItemEvent, Phase, PendingChange, QuizType, Situation } from './rules';

export type Profile = {
  userId: string;
  giveupConfirmedCount: number;
  suspendedUntil: number | null;
  suspendedGoalId: string | null;
  /** 정지 중 반성문 시간대: 포기한 목표의 원래 시작 시각과 학습 분. 정지가 아니면 null */
  suspendedStartMinutes: number | null;
  suspendedTargetMinutes: number | null;
  banned: boolean;
};

/** 활성 또는 달성한 목표. rules.Goal에 하위 상황 목록을 더했다. */
export type AppGoal = Goal & { subsituations: string[] };

export type MessagePhase = 'setup' | 'reason' | Phase;
export type MessageRole = 'user' | 'partner' | 'coach' | 'system';

/** messages 행. pending은 보내는 중인 내 메시지(낙관적 표시)에만 붙는다. */
export type Message = {
  id: string;
  goalId: string | null;
  day: string | null;
  phase: MessagePhase;
  role: MessageRole;
  text: string;
  meta: Record<string, unknown>;
  createdAt: number;
  pending?: boolean;
};

/** reflections 행 (이용 정지 중 반성문 채팅) */
export type ReflectionMessage = {
  id: string;
  day: string;
  role: 'user' | 'coach';
  text: string;
  createdAt: number;
  pending?: boolean;
};

export type ModalItem = { en: string; ko: string; note: string };
/** 코치 교정 모달. 표현 1개, 단어 0~2개 */
export type LessonModal = { expression: ModalItem; words: ModalItem[] } | null;
export type Episode = { index: number; cursor: number; total: number; finished: boolean };

export type QuizQuestion = {
  id: string;
  index: number;
  type: QuizType;
  prompt: string;
  choices?: string[];
  itemId: string | null;
  levelCheck: boolean;
};
export type QuizGrade = { correct: boolean; feedback: string; answerEn: string; modal: unknown };

export type GoalSetupLine = { role: 'user' | 'coach'; text: string };
export type GoalSetupFields = {
  reason?: string;
  place?: string;
  my_role?: string;
  partner?: string;
  task?: string;
  goal_name?: string;
};
export type GoalSetupReply = { reply: string; fields: GoalSetupFields; done: boolean; subsituations?: string[] };

/** create_goal 입력 */
export type GoalInput = {
  name: string;
  reason: string;
  periodDays: number;
  weekdays: number[];
  startMinutes: number;
  targetMinutes: number;
  situation: Situation;
  subsituations: string[];
};

// ---------- 행 변환 ----------

type Row = Record<string, unknown>;

export const ts = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function profileFromRow(r: Row): Profile {
  return {
    userId: str(r.user_id),
    giveupConfirmedCount: num(r.giveup_confirmed_count),
    suspendedUntil: ts(r.suspended_until),
    suspendedGoalId: strOrNull(r.suspended_goal_id),
    suspendedStartMinutes: numOrNull(r.suspended_start_minutes),
    suspendedTargetMinutes: numOrNull(r.suspended_target_minutes),
    banned: r.banned === true,
  };
}

function pendingFromJson(v: unknown): PendingChange | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Row;
  return {
    startMinutes: num(p.start_minutes),
    targetMinutes: num(p.target_minutes),
    weekdays: Array.isArray(p.weekdays) ? (p.weekdays as number[]) : [],
    fromDay: str(p.from_day),
  };
}

export function goalFromRow(r: Row): AppGoal {
  const s = (r.situation && typeof r.situation === 'object' ? r.situation : {}) as Row;
  return {
    id: str(r.id),
    name: str(r.name),
    reason: str(r.reason),
    periodDays: num(r.period_days),
    weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]) : [],
    startMinutes: num(r.start_minutes),
    targetMinutes: num(r.target_minutes),
    situation: { place: str(s.place), myRole: str(s.my_role), partner: str(s.partner), task: str(s.task) },
    subsituations: Array.isArray(r.subsituations) ? (r.subsituations as unknown[]).map((x) => String(x)) : [],
    firstDay: str(r.first_day),
    status: (str(r.status, 'active') as Goal['status']),
    coupons: num(r.coupons),
    couponStreakGoalWeeks: num(r.coupon_streak_goal_weeks, 2),
    couponProgressDays: num(r.coupon_progress_days),
    settledDay: str(r.settled_day),
    pendingChange: pendingFromJson(r.pending_change),
    giveupRequestedAt: ts(r.giveup_requested_at),
    createdAt: ts(r.created_at) ?? 0,
    endedAt: ts(r.ended_at),
  };
}

export function dayFromRow(r: Row): DayRow {
  return {
    goalId: str(r.goal_id),
    day: str(r.day),
    status: str(r.status, 'progress') as DayStatus,
    todayReason: strOrNull(r.today_reason),
    phase: (strOrNull(r.phase) as Phase | null),
    targetMinutes: num(r.target_minutes),
    sessionStartedAt: ts(r.session_started_at),
    activeSeconds: num(r.active_seconds),
    retroStartedAt: ts(r.retro_started_at),
    retroSeconds: num(r.retro_seconds),
    completedAt: ts(r.completed_at),
    couponEarned: r.coupon_earned === true,
    createdAt: ts(r.created_at) ?? 0,
  };
}

export function messageFromRow(r: Row): Message {
  return {
    id: str(r.id),
    goalId: strOrNull(r.goal_id),
    day: strOrNull(r.day),
    phase: str(r.phase, 'B') as MessagePhase,
    role: str(r.role, 'system') as MessageRole,
    text: str(r.text),
    meta: r.meta && typeof r.meta === 'object' ? (r.meta as Record<string, unknown>) : {},
    createdAt: ts(r.created_at) ?? 0,
  };
}

export function itemFromRow(r: Row): Item {
  return {
    id: str(r.id),
    goalId: str(r.goal_id),
    kind: r.kind === 'word' ? 'word' : 'expression',
    base: str(r.base),
    ko: str(r.ko),
    note: str(r.note),
    state: str(r.state, 'seen') as Item['state'],
    srsStep: num(r.srs_step),
    nextDueDay: strOrNull(r.next_due_day),
    unaidedStreak: num(r.unaided_streak),
    firstDay: strOrNull(r.first_day),
    createdAt: ts(r.created_at) ?? 0,
  };
}

export function itemEventFromRow(r: Row): ItemEvent {
  return {
    id: str(r.id),
    itemId: str(r.item_id),
    day: str(r.day),
    phase: strOrNull(r.phase),
    kind: str(r.kind, 'seen') as ItemEvent['kind'],
    aided: r.aided === true,
    correct: typeof r.correct === 'boolean' ? r.correct : null,
    questionType: strOrNull(r.question_type) as QuizType | null,
    createdAt: ts(r.created_at) ?? 0,
  };
}

export function reflectionFromRow(r: Row): ReflectionMessage {
  return {
    id: str(r.id),
    day: str(r.day),
    role: r.role === 'user' ? 'user' : 'coach',
    text: str(r.text),
    createdAt: ts(r.created_at) ?? 0,
  };
}

export function goalInputToArgs(g: GoalInput) {
  return {
    p_name: g.name.trim(),
    p_reason: g.reason.trim(),
    p_period_days: g.periodDays,
    p_weekdays: g.weekdays,
    p_start_minutes: g.startMinutes,
    p_target_minutes: g.targetMinutes,
    p_situation: { place: g.situation.place.trim(), my_role: g.situation.myRole.trim(), partner: g.situation.partner.trim(), task: g.situation.task.trim() },
    p_subsituations: g.subsituations,
  };
}

// ---------- 캐시 합치기 ----------

/** 같은 id는 서버 쪽으로 바꾸고, 보내는 중인 메시지는 서버 행이 오기 전까지 남긴다. 시각 순. */
export function mergeById<T extends { id: string; createdAt: number; pending?: boolean }>(current: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || (a.pending ? 1 : 0) - (b.pending ? 1 : 0));
}

/** 하루 행 하나를 목록에 넣거나 바꾼다 */
export function upsertDay(days: readonly DayRow[], row: DayRow): DayRow[] {
  const rest = days.filter((d) => !(d.goalId === row.goalId && d.day === row.day));
  return [...rest, row].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

export const dayKeyId = (goalId: string, day: string) => `${goalId}:${day}`;

/** 가장 최근 회고 2번 답(독촉 재료). 메시지 meta.retro_q === 2 인 내 답 */
export function lastRetroAnswer(messages: readonly Message[]): string | null {
  const answers = messages.filter((m) => m.role === 'user' && m.phase === 'retro' && m.meta.retro_q === 2);
  answers.sort((a, b) => b.createdAt - a.createdAt);
  return answers[0]?.text ?? null;
}

/** 메시지 id(uuid v4). 같은 메시지를 다시 보내도 서버가 한 번만 저장한다. 네이티브는 react-native-get-random-values가 crypto를 채운다 */
export function uuidv4(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
