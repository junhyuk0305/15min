import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPlan, MAX_PENDING, type PlanDay, type PlanInput } from '../plan';
import type { DayStatus, Goal } from '../rules';

const SEOUL = 'Asia/Seoul';
const H = 3600_000;
const seoul = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);
const hm = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: SEOUL, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
const md = (ms: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SEOUL, month: '2-digit', day: '2-digit' }).format(ms);

// 2026-10-19 월요일부터 월~금, 22:00 시작, 15분
const mkGoal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g',
  name: '스타벅스에서 막힘없이 주문하기',
  reason: '외국 손님 앞에서 주문을 막힘없이 하고 싶어서',
  periodDays: 14,
  weekdays: [1, 2, 3, 4, 5],
  startMinutes: 22 * 60,
  targetMinutes: 15,
  situation: { place: '카페', myRole: '손님', partner: '바리스타', task: '주문' },
  firstDay: '2026-10-19',
  status: 'active',
  coupons: 3,
  couponStreakGoalWeeks: 2,
  couponProgressDays: 0,
  settledDay: '2026-10-18',
  pendingChange: null,
  giveupRequestedAt: null,
  createdAt: seoul(2026, 10, 18, 9),
  endedAt: null,
  ...over,
});

const day = (d: string, status: DayStatus, activeSeconds = 0): PlanDay => ({ day: d, status, activeSeconds, targetMinutes: 15 });

const input = (over: Partial<PlanInput>): PlanInput => ({
  goal: mkGoal(),
  lastGoal: null,
  days: [],
  leftAt: null,
  lastRetro: null,
  suspension: null,
  now: seoul(2026, 10, 20, 12),
  timeZone: SEOUL,
  ...over,
});

const NAGS_22_15 = [
  '22:15', '22:16', '22:17', '22:18', '22:19', '22:20', '22:21', '22:22', '22:23', '22:24',
  '22:25', '22:26', '22:27', '22:28', '22:29', '22:30', '22:31', '22:32', '22:33', '22:34',
  '22:35', '22:36', '22:37', '22:38', '22:39', '22:40', '22:41', '22:42', '22:43', '22:44',
  '22:45', '22:46', '22:47', '22:48', '22:49', '22:50', '22:51', '22:52', '22:53', '22:54',
  '22:55', '22:56', '22:57', '22:58', '22:59', '23:00', '23:01', '23:02', '23:03', '23:04',
  '23:05', '23:06', '23:07', '23:08', '23:09', '23:10', '23:11', '23:12', '23:13', '23:14',
];

test('스냅샷: 22:00, 15분 목표의 하루 알림(화요일 12:00 기준)', () => {
  const p = buildPlan(input({}));
  assert.equal(p.length, 63);
  assert.equal(MAX_PENDING, 63);
  assert.deepEqual(
    p.map((x) => hm(x.at)),
    ['21:30', '22:00', ...NAGS_22_15, '21:30'],
  );
  assert.deepEqual(
    p.map((x) => x.kind),
    ['pre', 'start', ...Array(60).fill('nag'), 'pre'],
  );
  assert.equal(md(p[0].at), '10-20');
  assert.equal(md(p[62].at), '10-21');
  assert.equal(p[62].day, '2026-10-21');
  assert.equal(p[1].url, '/session/reason');
  assert.equal(p[2].url, '/session/reason');
  for (let i = 3; i < 62; i++) assert.notEqual(p[i].body, p[i - 1].body);
});

test('금요일: 주말은 건너뛰고 다음 학습일은 월요일', () => {
  const p = buildPlan(input({ now: seoul(2026, 10, 23, 12) }));
  assert.equal(p.length, 63);
  const dates = new Set(p.map((x) => md(x.at)));
  assert.deepEqual([...dates], ['10-23', '10-26']);
});

test('쉬는 요일(토요일)에는 그날 알림이 없고 월요일과 화요일을 건다', () => {
  const p = buildPlan(input({ now: seoul(2026, 10, 24, 12) }));
  assert.ok(p.every((x) => x.day === '2026-10-26' || x.day === '2026-10-27'));
  assert.equal(p.filter((x) => x.day === '2026-10-26').length, 62);
  assert.equal(p.length, 63);
});

test('first_day 전에는 아무것도 없고 첫날부터 건다', () => {
  const p = buildPlan(input({ now: seoul(2026, 10, 18, 12) }));
  assert.equal(p[0].day, '2026-10-19');
  assert.equal(hm(p[0].at), '21:30');
  assert.ok(p.every((x) => x.at >= seoul(2026, 10, 19, 21, 30)));
});

test('완료한 날은 그날 알림 없음, 다음 학습일 62개', () => {
  const p = buildPlan(input({ now: seoul(2026, 10, 20, 22, 20), days: [day('2026-10-20', 'done', 900)] }));
  assert.equal(p.length, 62);
  assert.ok(p.every((x) => x.day === '2026-10-21'));
});

test('이탈하면 나간 순간 1분 뒤부터 60회, 남은 분을 말한다', () => {
  const left = seoul(2026, 10, 20, 22, 25);
  const p = buildPlan(input({ now: left, leftAt: left, days: [day('2026-10-20', 'progress', 600)] }));
  const nags = p.filter((x) => x.kind === 'nag' && x.day === '2026-10-20');
  assert.equal(nags.length, 60);
  assert.equal(nags[0].at, left + 60_000);
  assert.match(nags[0].body, /5분/);
});

test('악마의 속삭임: 연속 7일 이상이면 학습일을 번갈아 사전 알림을 바꾼다', () => {
  const done = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27'].map((d) => day(d, 'done', 900));
  const now = seoul(2026, 10, 28, 12); // 수요일. 첫날부터 8번째 학습일(순번 7)
  const p = buildPlan(input({ now, days: done }));
  const pres = p.filter((x) => x.kind === 'pre' || x.kind === 'devil');
  assert.deepEqual(pres.map((x) => [x.day, x.kind]), [['2026-10-28', 'pre'], ['2026-10-29', 'devil']]);
  // 6일이면 없음
  const p6 = buildPlan(input({ now, days: done.slice(1) }));
  assert.ok(p6.every((x) => x.kind !== 'devil'));
});

test('포기 대기: 원래 사이클 대신 2시간 간격 12개', () => {
  const now = seoul(2026, 10, 20, 12);
  const p = buildPlan(input({ now, goal: mkGoal({ giveupRequestedAt: now - 30 * 60_000 }) }));
  assert.equal(p.length, 12);
  assert.ok(p.every((x) => x.kind === 'giveup_wait' && x.url === '/'));
  for (let i = 1; i < p.length; i++) assert.equal(p[i].at - p[i - 1].at, 2 * H);
  assert.ok(p.some((x) => x.body.includes('외국 손님 앞에서')));
  // 신청 1, 3, 5시간 뒤 알림은 지났다(5시간 뒤 = 지금). 7~23시간 뒤 9개만 남는다
  const later = buildPlan(input({ now, goal: mkGoal({ giveupRequestedAt: now - 5 * H }) }));
  assert.equal(later.length, 9);
});

test('이용 정지: 정지가 끝날 때까지 원래 시작 시각에 하루 1회', () => {
  const now = seoul(2026, 10, 20, 12);
  const p = buildPlan(input({ now, goal: null, suspension: { until: now + 7 * 24 * H, startMinutes: 22 * 60 } }));
  assert.equal(p.length, 7);
  assert.deepEqual(p.map((x) => md(x.at)), ['10-20', '10-21', '10-22', '10-23', '10-24', '10-25', '10-26']);
  assert.ok(p.every((x) => hm(x.at) === '22:00' && x.kind === 'suspended' && x.url === '/suspended'));
});

test('달성 후 새 목표가 없으면 다음 날 같은 시각부터 독촉 60회', () => {
  const p = buildPlan(input({ goal: null, lastGoal: mkGoal({ status: 'achieved' }) }));
  assert.equal(p.length, 60);
  assert.equal(p[0].at, seoul(2026, 10, 21, 22, 0));
  assert.ok(p.every((x) => x.kind === 'no_goal' && x.url === '/goal/new'));
});

test('어떤 경우에도 iOS 대기 상한 안', () => {
  const cases = [input({}), input({ now: seoul(2026, 10, 19, 1) }), input({ goal: null, lastGoal: mkGoal() })];
  for (const c of cases) assert.ok(buildPlan(c).length <= MAX_PENDING);
});
