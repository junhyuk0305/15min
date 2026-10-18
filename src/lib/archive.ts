// 기록 탭(P7) 집계. 순수 함수라 테스트로 검증한다. React Native를 import하지 않는다.
import type { AppGoal, Message } from './model';
import {
  addDays,
  expressionPattern,
  isStudyDay,
  settingsFor,
  wordBase,
  type DayRow,
  type DayStatus,
  type Item,
  type ItemEvent,
  type ItemKind,
} from './rules';

/** 달력 칸 상태. StatusMark의 DayStatus와 같은 값이다 */
export type CalendarMark = 'done' | 'miss' | 'coupon' | 'rest' | 'giveup' | 'open' | 'outside';

const MARK_OF_STATUS: Record<Exclude<DayStatus, 'progress'>, CalendarMark> = {
  done: 'done',
  failed: 'miss',
  coupon: 'coupon',
  rest: 'rest',
  giveup_wait: 'giveup',
};

/**
 * 그날의 달력 칸. 판정된 행이 있으면 그 상태를 쓴다.
 * 행이 없으면 활성 목표의 요일로 본다: 지난 학습 요일은 실패, 쉬는 요일은 쉼, 오늘과 앞날의 학습 요일은 빈칸.
 * 첫 도전일 전이나 목표가 없으면 표시하지 않는다.
 */
export function calendarMark(day: string, status: DayStatus | undefined, goal: AppGoal | null, today: string): CalendarMark {
  if (status && status !== 'progress') return MARK_OF_STATUS[status];
  if (status === 'progress') return day < today ? 'miss' : 'open';
  if (!goal || day < goal.firstDay) return 'outside';
  const study = isStudyDay(day, settingsFor(goal, day).weekdays);
  if (!study) return 'rest';
  return day < today ? 'miss' : 'open';
}

/** 'YYYY-MM'의 달력. 일요일부터 한 주 7칸, 다른 달은 null */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay();
  const cells: (string | null)[] = Array<string | null>(lead).fill(null);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 'YYYY-MM'에서 n달 이동 */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const firstLine = (text: string | null | undefined): string => (text ?? '').trim().split(/\r?\n/)[0]?.trim() ?? '';

/** 사용자가 학습(A, B, C)과 회고에서 쓴 글자 수. 공백을 뺀 앞뒤 정리 기준 */
export type WrittenRow = { goalId: string; day: string; phase: string; text: string };

export const dayId = (goalId: string, day: string) => `${goalId}:${day}`;

export function charsByDay(rows: readonly WrittenRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!['A', 'B', 'C', 'retro'].includes(r.phase)) continue;
    const k = dayId(r.goalId, r.day);
    out.set(k, (out.get(k) ?? 0) + r.text.trim().length);
  }
  return out;
}

export type ArchiveCard = {
  key: string;
  goalId: string;
  day: string;
  minutes: number;
  reasonLine: string;
  /** 글자 수. 아직 못 읽었으면 null */
  chars: number | null;
  partner: string;
};

/** 완료한 날의 카드. 최근 날부터 */
export function archiveCards(days: readonly DayRow[], goals: readonly AppGoal[], chars: Map<string, number> | null): ArchiveCard[] {
  const goalOf = new Map(goals.map((g) => [g.id, g]));
  return days
    .filter((d) => d.status === 'done' && goalOf.has(d.goalId))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .map((d) => ({
      key: dayId(d.goalId, d.day),
      goalId: d.goalId,
      day: d.day,
      minutes: Math.floor(d.activeSeconds / 60),
      reasonLine: firstLine(d.todayReason),
      chars: chars ? (chars.get(dayId(d.goalId, d.day)) ?? 0) : null,
      partner: goalOf.get(d.goalId)?.situation.partner ?? '',
    }));
}

/** 같은 날에 목표가 둘이면(달성 직후) 활성 목표를 먼저 본다 */
export function statusByDay(days: readonly DayRow[], activeGoalId: string | null): Map<string, DayStatus> {
  const out = new Map<string, DayStatus>();
  for (const d of days) if (d.goalId !== activeGoalId) out.set(d.day, d.status);
  for (const d of days) if (d.goalId === activeGoalId) out.set(d.day, d.status);
  return out;
}

// ---------- 배운 항목 ----------

const keyOf = (i: Pick<Item, 'kind' | 'base'>) => `${i.kind}:${i.kind === 'word' ? wordBase(i.base) : expressionPattern(i.base)}`;

/**
 * 지금까지 배운 단어와 표현 수. 배운 기록(taught)이 있는 항목만 센다.
 * 같은 단어의 활용형과 같은 표현 틀은 한 번만 센다(기획서 11.8).
 */
export function learnedTotals(items: readonly Item[], events: readonly ItemEvent[]): { words: number; expressions: number } {
  const taught = new Set(events.filter((e) => e.kind === 'taught').map((e) => e.itemId));
  const keys = new Map<string, ItemKind>();
  for (const i of items) if (taught.has(i.id)) keys.set(keyOf(i), i.kind);
  const kinds = [...keys.values()];
  return { words: kinds.filter((k) => k === 'word').length, expressions: kinds.filter((k) => k === 'expression').length };
}

// ---------- 상세 ----------

export type ArchivePhase = 'A' | 'B' | 'C' | 'retro';
const PHASE_ORDER: ArchivePhase[] = ['A', 'B', 'C', 'retro'];

/** 단계별 대화. 목표 설정과 오늘의 이유 메시지는 뺀다. 빈 단계는 없다 */
export function phaseGroups(messages: readonly Message[]): { phase: ArchivePhase; messages: Message[] }[] {
  return PHASE_ORDER.map((phase) => ({
    phase,
    messages: messages.filter((m) => m.phase === phase).sort((a, b) => a.createdAt - b.createdAt),
  })).filter((g) => g.messages.length > 0);
}

// ---------- 서버 행 ----------

type Row = Record<string, unknown>;
const str = (v: unknown, f = '') => (typeof v === 'string' ? v : f);

export function writtenFromRow(r: Row): WrittenRow {
  return { goalId: str(r.goal_id), day: str(r.day), phase: str(r.phase), text: str(r.text) };
}
