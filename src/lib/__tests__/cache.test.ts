import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { DOCS, readDoc } from '../../../scripts/sync-legal';
import { copy, errorText } from '../copy';
import { dayFromRow, goalFromRow, lastRetroAnswer, mergeById, profileFromRow, upsertDay, uuidv4, type AppGoal, type Message } from '../model';
import { createReporter, scrubBreadcrumb } from '../reportCore';
import { EMPTY_CACHE, nextSuspendedGoal, planInputOf, reflectionWindow, routeInputOf, serverOffsetOf, todayRowOf, type Cache } from '../selectors';
import { zonedTime } from '../rules';

const TZ = 'Asia/Seoul';
const goalRow = {
  id: 'g1',
  user_id: 'u1',
  name: '카페 주문',
  reason: '해외 출장 때 카페에서 혼자 주문하고 싶어서입니다',
  period_days: 14,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_minutes: 1320,
  target_minutes: 15,
  situation: { place: '카페', my_role: '손님', partner: '바리스타', task: '주문' },
  subsituations: ['입장', '주문'],
  first_day: '2026-10-10',
  status: 'active',
  coupons: 3,
  coupon_streak_goal_weeks: 2,
  coupon_progress_days: 4,
  settled_day: '2026-10-17',
  pending_change: { start_minutes: 600, target_minutes: 20, weekdays: [1, 2, 3, 4, 5], from_day: '2026-10-19' },
  giveup_requested_at: null,
  created_at: '2026-10-09T10:00:00+00:00',
  ended_at: null,
};
const goal = goalFromRow(goalRow) as AppGoal;
const NOW = zonedTime('2026-10-18', 12 * 60, TZ);

const cache = (o: Partial<Cache>): Cache => ({ ...EMPTY_CACHE, ...o });
const profile = profileFromRow({ user_id: 'u1', timezone: TZ, banned: false, suspended_until: null, giveup_confirmed_count: 0 });

test('goals 행을 camelCase로 바꾼다 (상황, 예약 변경, 시각)', () => {
  assert.equal(goal.situation.myRole, '손님');
  assert.deepEqual(goal.pendingChange, { startMinutes: 600, targetMinutes: 20, weekdays: [1, 2, 3, 4, 5], fromDay: '2026-10-19' });
  assert.equal(goal.createdAt, Date.parse('2026-10-09T10:00:00Z'));
  assert.deepEqual(goal.subsituations, ['입장', '주문']);
});

test('days 행과 profiles 행', () => {
  const d = dayFromRow({ goal_id: 'g1', day: '2026-10-18', status: 'progress', active_seconds: 120, target_minutes: 15, session_started_at: '2026-10-18T03:00:00Z' });
  assert.equal(d.activeSeconds, 120);
  assert.equal(d.sessionStartedAt, Date.parse('2026-10-18T03:00:00Z'));
  assert.equal(d.retroStartedAt, null);
  const p = profileFromRow({ user_id: 'u', timezone: 'UTC', suspended_until: '2026-10-25T00:00:00Z', banned: false });
  assert.equal(p.suspendedUntil, Date.parse('2026-10-25T00:00:00Z'));
});

test('mergeById: 서버 행이 오면 보내는 중 메시지를 바꾸고 시각 순으로 둔다', () => {
  const m = (id: string, at: number, pending?: boolean): Message => ({ id, goalId: 'g', day: 'd', phase: 'B', role: 'user', text: id, meta: {}, createdAt: at, pending });
  const merged = mergeById([m('a', 1), m('mine', 5, true)], [m('mine', 3), m('reply', 4)]);
  assert.deepEqual(merged.map((x) => [x.id, !!x.pending]), [['a', false], ['mine', false], ['reply', false]]);
});

test('upsertDay는 같은 날을 바꾸고 날짜 순으로 둔다', () => {
  const a = dayFromRow({ goal_id: 'g1', day: '2026-10-17', status: 'done' });
  const b = dayFromRow({ goal_id: 'g1', day: '2026-10-18', status: 'progress', active_seconds: 1 });
  const b2 = { ...b, activeSeconds: 60 };
  assert.deepEqual(upsertDay(upsertDay([b], a), b2).map((d) => [d.day, d.activeSeconds]), [['2026-10-17', 0], ['2026-10-18', 60]]);
});

test('routeInputOf: 오늘 행 상태를 학습 중, 끝남, 없음으로 접는다', () => {
  const flags = { authed: true, onboarded: true, loadFailed: false };
  const row = (status: string) => dayFromRow({ goal_id: 'g1', day: '2026-10-18', status });
  assert.equal(routeInputOf(cache({ profile, goal, days: [row('progress')] }), flags, NOW, TZ).today, 'progress');
  assert.equal(routeInputOf(cache({ profile, goal, days: [row('coupon')] }), flags, NOW, TZ).today, 'closed');
  assert.equal(routeInputOf(cache({ profile, goal, days: [row('failed')] }), flags, NOW, TZ).today, 'none');
  assert.equal(routeInputOf(cache({ profile, goal: null }), flags, NOW, TZ).hasActiveGoal, false);
  assert.equal(todayRowOf(cache({ profile, goal, days: [row('progress')] }), NOW, TZ)?.day, '2026-10-18');
});

test('planInputOf: 정지 중이면 목표 알림 대신 반성문 알림, 영구 정지면 아무것도', () => {
  const susp = { ...profile, suspendedUntil: NOW + 86400_000, suspendedGoalId: 'g0' };
  const p = planInputOf(cache({ profile: susp, lastGoal: goal, suspendedGoal: { id: 'g0', startMinutes: 1320, targetMinutes: 15 } }), NOW, TZ);
  assert.deepEqual(p.suspension, { until: NOW + 86400_000, startMinutes: 1320 });
  assert.equal(p.lastGoal, null);
  const banned = planInputOf(cache({ profile: { ...profile, banned: true }, lastGoal: goal }), NOW, TZ);
  assert.equal(banned.goal, null);
  assert.equal(banned.lastGoal, null);
  assert.equal(banned.suspension, null);
  const normal = planInputOf(cache({ profile, goal, leftAt: { day: '2026-10-18', at: NOW - 5000 } }), NOW, TZ);
  assert.equal(normal.goal?.id, 'g1');
  assert.equal(normal.leftAt, NOW - 5000);
  assert.equal(planInputOf(cache({ profile, goal, leftAt: { day: '2026-10-17', at: 1 } }), NOW, TZ).leftAt, null);
});

test('nextSuspendedGoal: 포기 확정된 목표의 시각을 확정 전 캐시에서 옮긴다', () => {
  const susp = { ...profile, suspendedUntil: NOW + 1, suspendedGoalId: 'g1' };
  assert.deepEqual(nextSuspendedGoal(cache({ goal }), susp), { id: 'g1', startMinutes: 1320, targetMinutes: 15 });
  assert.equal(nextSuspendedGoal(cache({}), susp), null);
  assert.equal(nextSuspendedGoal(cache({ goal }), profile), null);
});

test('reflectionWindow: 원래 시작 시각부터 학습 분 동안 열린다', () => {
  const sched = { startMinutes: 1320, targetMinutes: 15 };
  const start = zonedTime('2026-10-18', 1320, TZ);
  assert.deepEqual(reflectionWindow(sched, start - 1, TZ), { open: false, opensAt: start, closesAt: start + 15 * 60_000 });
  assert.equal(reflectionWindow(sched, start + 60_000, TZ).open, true);
  const after = reflectionWindow(sched, start + 16 * 60_000, TZ);
  assert.equal(after.open, false);
  assert.equal(after.opensAt, zonedTime('2026-10-19', 1320, TZ));
});

test('serverOffsetOf: 왕복의 가운데를 서버 시각으로 본다', () => {
  assert.equal(serverOffsetOf(1000, 1200, 5100), 4000);
});

test('lastRetroAnswer: 회고 2번 답 중 가장 최근', () => {
  const mk = (id: string, at: number, q: number): Message => ({ id, goalId: 'g', day: 'd', phase: 'retro', role: 'user', text: id, meta: { retro_q: q }, createdAt: at });
  assert.equal(lastRetroAnswer([mk('a', 1, 2), mk('b', 3, 1), mk('c', 2, 2)]), 'c');
  assert.equal(lastRetroAnswer([]), null);
});

test('uuidv4 모양', () => {
  assert.match(uuidv4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('errorText: 코드 문구가 먼저, 없으면 종류 문구, 둘 다 두 문장', () => {
  assert.equal(errorText('server', 'ai_failed'), '응답을 받지 못했습니다. 다시 보내 주십시오.');
  assert.equal(errorText('network'), copy.error.kind.network);
  assert.equal(errorText('nope'), copy.error.generic);
  for (const s of [...Object.values(copy.error.kind), ...Object.values(copy.error.code)]) {
    assert.equal(s.split('. ').length, 2, s);
    assert.ok(!/[A-Za-z]{4,}/.test(s.replace('Gemini', '')), `영어 원문 없음: ${s}`);
  }
});

test('가입 연령 문구는 MIN_AGE를 쓴다', async () => {
  const { MIN_AGE } = await import('../rules');
  assert.equal(MIN_AGE, 18);
  assert.equal(copy.auth.age(MIN_AGE), '만 18세 이상입니다');
});

test('copy.legal은 docs/legal 원문과 같다 (npm run sync:legal)', () => {
  assert.equal(copy.legal.terms, readDoc(DOCS.terms));
  assert.equal(copy.legal.privacy, readDoc(DOCS.privacy));
  assert.ok(readFileSync(join(__dirname, '..', 'copy.ts'), 'utf8').includes('// legal:start'));
});

test('오류 보고: Sentry가 켜졌으면 capture, 아니면 콘솔', () => {
  const seen: string[] = [];
  const sink = { capture: () => seen.push('capture'), log: (msg: string) => seen.push(`log ${msg}`) };
  createReporter(sink, true)(new Error('x'), 'render');
  createReporter(sink, false)(new Error('x'), 'render');
  assert.deepEqual(seen, ['capture', 'log [render]']);
});

test('오류 기록의 요청 주소에서 쿼리를 지운다 (Sentry beforeBreadcrumb)', () => {
  const fetch = scrubBreadcrumb({ category: 'fetch', data: { url: 'http://x/rest/v1/messages?goal_id=eq.g1&day=eq.2026-10-18', method: 'GET', status_code: 200 } });
  assert.deepEqual(fetch.data, { url: 'http://x/rest/v1/messages', method: 'GET', status_code: 200 });
  const nav = scrubBreadcrumb({ category: 'navigation', data: { from: '/auth?next=%2Farchive%2Fg1', to: '/archive/g1#x' } });
  assert.deepEqual(nav.data, { from: '/auth', to: '/archive/g1' });
  assert.deepEqual(scrubBreadcrumb({ category: 'console' }), { category: 'console' });
});
