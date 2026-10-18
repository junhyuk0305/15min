// 테스트 공통: 메모리 DB, 고정 시각, 가짜 모델. 실제 DB와 Gemini 없이 핸들러를 돌린다.
import type { Config } from '../_shared/config.ts';
import { fakeTransport, type Transport } from '../_shared/gemini.ts';
import { MemoryRepo, type Tables } from '../_shared/memory.ts';
import { type Deps, type Handle, makeHandler } from '../_shared/server.ts';
import type { DayRow, GoalRow, Profile } from '../_shared/types.ts';

export const USER = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';
export const GOAL = '33333333-3333-4333-8333-333333333333';
export const TOKEN = 'token-user';
export const OTHER_TOKEN = 'token-other';
/** 2026-10-20 20:00 KST. 하루 키 2026-10-20 */
export const NOW = Date.parse('2026-10-20T11:00:00Z');
export const TODAY = '2026-10-20';

export const config: Config = {
  fake: true,
  apiKey: null,
  models: { main: 'test-main', light: 'test-light' },
  dailyLimit: 150,
  goalSetupLimit: 30,
};

export function profile(p: Partial<Profile> = {}): Profile {
  return { user_id: USER, timezone: 'Asia/Seoul', suspended_until: null, suspended_goal_id: null, suspended_start_minutes: null, suspended_target_minutes: null, banned: false, giveup_confirmed_count: 0, ...p };
}

export function goal(g: Partial<GoalRow> = {}): GoalRow {
  return {
    id: GOAL,
    user_id: USER,
    name: '카페에서 막힘없이 주문하기',
    reason: '호주 카페에서 주문을 못 해서 창피했던 기억이 있습니다.',
    period_days: 14,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    start_minutes: 19 * 60 + 50,
    target_minutes: 15,
    situation: { place: '카페', my_role: '손님', partner: '바리스타', task: '음료 주문' },
    subsituations: ['입장', '메뉴 주문', '옵션 선택'],
    first_day: '2026-10-18',
    status: 'active',
    created_at: '2026-10-17T10:00:00Z',
    ...g,
  };
}

export function day(d: Partial<DayRow> = {}): DayRow {
  return {
    goal_id: GOAL,
    day: TODAY,
    user_id: USER,
    status: 'progress',
    today_reason: '어제보다 한 문장 더 말하고 싶어서 오늘도 합니다.',
    phase: 'B',
    target_minutes: 15,
    session_started_at: '2026-10-20T10:50:00Z',
    active_seconds: 300,
    retro_started_at: null,
    retro_seconds: 0,
    completed_at: null,
    ...d,
  };
}

export function seed(extra: Partial<Tables> = {}): MemoryRepo {
  return new MemoryRepo({
    tokens: { [TOKEN]: USER, [OTHER_TOKEN]: OTHER },
    profiles: [profile(), profile({ user_id: OTHER })],
    goals: [goal()],
    days: [day()],
    episodes: [{ goal_id: GOAL, index: 0, user_id: USER, subsituations: ['입장', '메뉴 주문', '옵션 선택'], cursor: 0, finished_at: null }],
    ...extra,
  });
}

/** 호출 수를 세는 전송. 기본은 가짜 응답. */
export function counting(inner: Transport = fakeTransport) {
  const calls: string[] = [];
  const transport: Transport = (r) => {
    calls.push(r.promptId);
    return inner(r);
  };
  return { calls, transport };
}

export function deps(repo: MemoryRepo, transport: Transport = fakeTransport, now = NOW): Deps {
  return { repo, config, transport, now: () => now };
}

export async function call(handle: Handle, d: Deps, body: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await makeHandler(handle, () => d)(new Request('http://local/fn', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}
