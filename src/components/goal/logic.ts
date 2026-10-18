// 목표 설정 채팅의 순수 함수 (MP 3절 목표 설정 방식, 결정안 1, 8). React Native를 import하지 않는다(Node 테스트용).
import type { GoalInput, GoalSetupFields } from '../../lib/model';
import {
  addDays,
  cycleOf,
  dayKeyOf,
  isStudyDay,
  localParts,
  MIN_NOTE_CHARS,
  MIN_WEEKDAYS,
  PERIOD_DEFAULT,
  PERIOD_MAX,
  PERIOD_MIN,
  TARGET_MAX,
  TARGET_MIN,
  weekdayOf,
} from '../../lib/rules';

export type SetupLine = { id: string; role: 'user' | 'coach'; text: string };
export type SetupStage = 'chat' | 'plan' | 'confirm';
export type FieldKey = keyof GoalSetupFields;
export type Plan = { periodDays: number; weekdays: number[]; startMinutes: number; targetMinutes: number };

/** 채팅이 채우는 순서 (goal-setup 함수와 같다) */
export const FIELD_ORDER: FieldKey[] = ['reason', 'place', 'my_role', 'partner', 'task', 'goal_name'];

/** 항목별 글자 수 상한. create_goal, goal-setup(handler.ts FIELD_MAX)과 같다 */
export const FIELD_MAX: Record<FieldKey, number> = { reason: 1000, place: 100, my_role: 100, partner: 100, task: 100, goal_name: 60 };

/** goal-setup 함수가 받는 대화 줄 수 상한 (handler.ts MAX_MESSAGES) */
export const MAX_LINES = 40;

export const PERIOD_PRESETS = [7, 14, 30, 60, 90];
export const MINUTE_PRESETS = [0, 15, 30, 45];
/** 요일 표시 순서: 월 ~ 일 */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function defaultPlan(last?: { weekdays: number[]; startMinutes: number; targetMinutes: number } | null): Plan {
  if (last && last.weekdays.length >= MIN_WEEKDAYS) {
    return { periodDays: PERIOD_DEFAULT, weekdays: [...last.weekdays], startMinutes: last.startMinutes, targetMinutes: last.targetMinutes };
  }
  return { periodDays: PERIOD_DEFAULT, weekdays: [1, 2, 3, 4, 5], startMinutes: 22 * 60, targetMinutes: 15 };
}

const filled = (v: string | undefined) => !!v && v.trim().length > 0;

/** 아직 비었거나(이유는 20자 미만) 채워야 할 항목 */
export function missingFields(f: GoalSetupFields): FieldKey[] {
  return FIELD_ORDER.filter((k) => !filled(f[k]) || (k === 'reason' && (f.reason ?? '').trim().length < MIN_NOTE_CHARS));
}

/** 서버가 준 값으로 덮는다. 서버가 비워 보낸 항목은 앞 값을 지킨다 */
export function mergeFields(prev: GoalSetupFields, next: GoalSetupFields | undefined): GoalSetupFields {
  const out: GoalSetupFields = { ...prev };
  for (const k of FIELD_ORDER) {
    const v = next?.[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** 진행 막대 비율. 채팅 0~1/3, 약속 2/3, 확인 1 */
export function progressOf(stage: SetupStage, fields: GoalSetupFields): number {
  if (stage === 'confirm') return 1;
  if (stage === 'plan') return 2 / 3;
  return ((FIELD_ORDER.length - missingFields(fields).length) / FIELD_ORDER.length) / 3;
}

export const stepOf = (stage: SetupStage): 1 | 2 | 3 => (stage === 'chat' ? 1 : stage === 'plan' ? 2 : 3);

/** 사용자 줄 하나를 더 보내도 서버 상한 안인가 */
export const canAsk = (lines: readonly SetupLine[]) => lines.length + 1 <= MAX_LINES;

/** 질문 앞부분 "말을 주고받을 상대는", "영어로 말할 장소는"처럼 항목 이름에 조사가 붙은 말. 첫 보기 앞에서 지운다 */
const QUESTION_LEAD = /^(?:.*\s)?\S*(?:장소|상대|역할|일|이름|목표|상황|곳)(?:은|는|이|가)\s+/;

/**
 * 코치가 보기를 주면 칩으로 보인다. 응답에 보기 칸이 없어서 마지막 질문 문장
 * "A, B, C 중 어디에 가깝습니까?" 꼴에서만 뽑는다. 꼴이 다르면 빈 배열.
 */
export function choicesOf(reply: string): string[] {
  const sentences = reply.match(/[^.?!]+[.?!]?/g) ?? [];
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i].trim();
    if (!s.endsWith('?')) continue;
    const m = s.match(/^(.+?)\s+중(?:에서|에)?\s+(어디|무엇|어느|누구|어떤|어떻)/);
    if (!m) return [];
    const items = m[1]
      .replace(/^(예를 들어|예컨대|예:)\s*/, '')
      .replace(QUESTION_LEAD, '')
      .split(/\s*,\s*|\s+또는\s+|\s+아니면\s+/)
      .map((x) => x.replace(/^['"“‘]|['"”’]$/g, '').trim())
      .filter(Boolean);
    const ok = items.length >= 2 && items.length <= 4 && items.every((x) => x.length <= 20);
    return ok ? items : [];
  }
  return [];
}

export const clampPeriod = (n: number) => Math.min(PERIOD_MAX, Math.max(PERIOD_MIN, n));
export const clampTarget = (n: number) => Math.min(TARGET_MAX, Math.max(TARGET_MIN, n));
export const wrapDay = (m: number) => ((m % 1440) + 1440) % 1440;

/** 분만 바꾼다. 시는 그대로 */
export const setMinute = (startMinutes: number, minute: number) => Math.floor(startMinutes / 60) * 60 + minute;

export function toggleWeekday(weekdays: readonly number[], w: number): number[] {
  return weekdays.includes(w) ? weekdays.filter((x) => x !== w) : [...weekdays, w].sort((a, b) => a - b);
}

/** 학습 요일이 모자라면 더 골라야 할 수. 충분하면 0 */
export const weekdaysShort = (weekdays: readonly number[]) => Math.max(0, MIN_WEEKDAYS - new Set(weekdays).size);

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 첫 학습 시작 시각. 첫 도전일은 오늘 하루 키 + 1이고(명세 2절), 그날이 쉬는 요일이면 다음 학습 요일이다.
 * rel, month, date, weekday는 학습일(04:00에 바뀌는 하루 키) 기준이다. 홈의 시작 안내(whenOf)와 같게 읽힌다.
 * 그래서 04:00 전 새벽에 만들어도 첫 도전일이 하루 키 + 1이면 "내일"이다.
 */
export function firstStart(now: number, timeZone: string, plan: Pick<Plan, 'weekdays' | 'startMinutes' | 'targetMinutes'>) {
  const next = addDays(dayKeyOf(now, timeZone), 1);
  let day = next;
  for (let i = 0; i < 7 && !isStudyDay(day, plan.weekdays); i++) day = addDays(day, 1);
  const at = cycleOf(day, plan.startMinutes, plan.targetMinutes, timeZone).start;
  const a = localParts(at, timeZone);
  return {
    day,
    at,
    rel: day === next ? ('tomorrow' as const) : ('date' as const),
    month: Number(day.slice(5, 7)),
    date: Number(day.slice(8, 10)),
    weekday: weekdayOf(day),
    clock: `${pad(a.hour)}:${pad(a.minute)}`,
  };
}

/** create_goal 입력. 하위 상황이 없으면(직접 쓰기) fallbackScenes */
export function toGoalInput(fields: GoalSetupFields, plan: Plan, subsituations: readonly string[], fallbackScenes: readonly string[]): GoalInput {
  return {
    name: (fields.goal_name ?? '').trim(),
    reason: (fields.reason ?? '').trim(),
    periodDays: plan.periodDays,
    weekdays: [...new Set(plan.weekdays)].sort((a, b) => a - b),
    startMinutes: plan.startMinutes,
    targetMinutes: plan.targetMinutes,
    situation: { place: (fields.place ?? '').trim(), myRole: (fields.my_role ?? '').trim(), partner: (fields.partner ?? '').trim(), task: (fields.task ?? '').trim() },
    subsituations: subsituations.length ? [...subsituations] : [...fallbackScenes],
  };
}
