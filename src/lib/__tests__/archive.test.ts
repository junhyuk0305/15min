import assert from 'node:assert/strict';
import { test } from 'node:test';
import { archiveCards, calendarMark, charsByDay, firstLine, learnedTotals, monthGrid, phaseGroups, shiftMonth, statusByDay } from '../archive';
import type { AppGoal, Message } from '../model';
import type { DayRow, DayStatus, Item, ItemEvent } from '../rules';

// 2026-10-19 월요일부터 월~금
const goal = (over: Partial<AppGoal> = {}): AppGoal => ({
  id: 'g',
  name: '카페에서 영어로 주문하기',
  reason: '외국 손님 앞에서 주문을 막힘없이 하고 싶어서',
  periodDays: 14,
  weekdays: [1, 2, 3, 4, 5],
  startMinutes: 22 * 60,
  targetMinutes: 15,
  situation: { place: '카페', myRole: '손님', partner: '바리스타', task: '주문' },
  subsituations: [],
  firstDay: '2026-10-19',
  status: 'active',
  coupons: 3,
  couponStreakGoalWeeks: 2,
  couponProgressDays: 0,
  settledDay: '2026-10-18',
  pendingChange: null,
  giveupRequestedAt: null,
  createdAt: 0,
  endedAt: null,
  ...over,
});

const day = (d: string, status: DayStatus, over: Partial<DayRow> = {}): DayRow => ({
  goalId: 'g',
  day: d,
  status,
  todayReason: null,
  phase: null,
  targetMinutes: 15,
  sessionStartedAt: null,
  activeSeconds: 0,
  retroStartedAt: null,
  retroSeconds: 0,
  completedAt: null,
  couponEarned: false,
  createdAt: 0,
  ...over,
});

// ---------- 달력 ----------

test('달력: 판정된 상태는 그대로 다섯 가지로 나뉜다', () => {
  const g = goal();
  const t = '2026-10-30';
  assert.equal(calendarMark('2026-10-19', 'done', g, t), 'done');
  assert.equal(calendarMark('2026-10-20', 'failed', g, t), 'miss');
  assert.equal(calendarMark('2026-10-21', 'coupon', g, t), 'coupon');
  assert.equal(calendarMark('2026-10-24', 'rest', g, t), 'rest');
  assert.equal(calendarMark('2026-10-22', 'giveup_wait', g, t), 'giveup');
});

test('달력: 행이 없으면 요일로 본다. 지난 학습 요일은 실패, 주말은 쉼, 오늘과 앞날은 빈칸', () => {
  const g = goal();
  const t = '2026-10-21';
  assert.equal(calendarMark('2026-10-20', undefined, g, t), 'miss');
  assert.equal(calendarMark('2026-10-21', undefined, g, t), 'open');
  assert.equal(calendarMark('2026-10-22', undefined, g, t), 'open');
  assert.equal(calendarMark('2026-10-25', undefined, g, t), 'rest');
});

test('달력: 첫 도전일 전과 목표 없음은 표시하지 않는다. 지난 날의 학습 중 행은 실패', () => {
  assert.equal(calendarMark('2026-10-18', undefined, goal(), '2026-10-21'), 'outside');
  assert.equal(calendarMark('2026-10-20', undefined, null, '2026-10-21'), 'outside');
  assert.equal(calendarMark('2026-10-20', 'progress', goal(), '2026-10-21'), 'miss');
  assert.equal(calendarMark('2026-10-21', 'progress', goal(), '2026-10-21'), 'open');
});

test('달력: 같은 날 행이 둘이면 활성 목표 쪽을 쓴다', () => {
  const m = statusByDay([day('2026-10-21', 'done', { goalId: 'old' }), day('2026-10-21', 'rest')], 'g');
  assert.equal(m.get('2026-10-21'), 'rest');
});

test('달력 격자: 2026년 10월은 목요일에 시작해 5주', () => {
  const weeks = monthGrid('2026-10');
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0], [null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(weeks[4][6], '2026-10-31');
  assert.ok(weeks.every((w) => w.length === 7));
});

test('달 이동: 해를 넘긴다', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});

// ---------- 카드 ----------

test('카드(S17): 완료한 날 3장, 최근 날부터, 분과 이유 첫 줄과 글자 수', () => {
  const days = [
    day('2026-10-19', 'done', { activeSeconds: 900, todayReason: '출장이 다음 주라서\n더는 미룰 수 없어서' }),
    day('2026-10-20', 'done', { activeSeconds: 960, todayReason: '회의에서 말을 못 해서' }),
    day('2026-10-21', 'done', { activeSeconds: 900, todayReason: '오늘은 사이즈를 바꿔 보려고' }),
    day('2026-10-22', 'failed'),
    day('2026-10-23', 'coupon'),
  ];
  const chars = charsByDay([
    { goalId: 'g', day: '2026-10-19', phase: 'B', text: ' Oat milk please. ' },
    { goalId: 'g', day: '2026-10-19', phase: 'retro', text: 'I learned instead.' },
    { goalId: 'g', day: '2026-10-19', phase: 'reason', text: '이유는 세지 않는다' },
  ]);
  const cards = archiveCards(days, [goal()], chars);
  assert.equal(cards.length, 3);
  assert.deepEqual(
    cards.map((c) => [c.day, c.minutes, c.reasonLine, c.chars, c.partner]),
    [
      ['2026-10-21', 15, '오늘은 사이즈를 바꿔 보려고', 0, '바리스타'],
      ['2026-10-20', 16, '회의에서 말을 못 해서', 0, '바리스타'],
      ['2026-10-19', 15, '출장이 다음 주라서', 16 + 18, '바리스타'],
    ],
  );
});

test('카드: 글자 수를 아직 못 읽었으면 null, 보이지 않는 목표(포기 확정)의 날은 뺀다', () => {
  const cards = archiveCards([day('2026-10-19', 'done'), day('2026-10-19', 'done', { goalId: 'gone' })], [goal()], null);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].chars, null);
});

test('첫 줄: 앞뒤 공백과 빈 값', () => {
  assert.equal(firstLine('  첫 줄  \n둘째 줄'), '첫 줄');
  assert.equal(firstLine(null), '');
});

// ---------- 배운 항목 ----------

const item = (id: string, kind: Item['kind'], base: string): Item => ({
  id,
  goalId: 'g',
  kind,
  base,
  ko: '',
  note: '',
  state: 'taught',
  srsStep: 0,
  nextDueDay: null,
  unaidedStreak: 0,
  firstDay: '2026-10-19',
  createdAt: 0,
});
const ev = (itemId: string, kind: ItemEvent['kind']): ItemEvent => ({
  id: `${itemId}:${kind}`,
  itemId,
  day: '2026-10-19',
  phase: 'B',
  kind,
  aided: false,
  correct: null,
  questionType: null,
  createdAt: 0,
});

test('배운 항목: 활용형(orders, order)과 같은 표현 틀은 한 번만 센다', () => {
  const items = [
    item('w1', 'word', 'order'),
    item('w2', 'word', 'Orders'),
    item('w3', 'word', 'receipt'),
    item('e1', 'expression', 'Could I have … instead?'),
    item('e2', 'expression', 'could I have ... instead'),
  ];
  const events = ['w1', 'w2', 'w3', 'e1', 'e2'].map((id) => ev(id, 'taught'));
  assert.deepEqual(learnedTotals(items, events), { words: 2, expressions: 1 });
});

test('배운 항목: 등장만 한 항목(seen)은 세지 않는다', () => {
  const items = [item('w1', 'word', 'latte'), item('w2', 'word', 'size')];
  assert.deepEqual(learnedTotals(items, [ev('w1', 'seen'), ev('w2', 'taught'), ev('w2', 'used')]), { words: 1, expressions: 0 });
});

// ---------- 상세 ----------

test('상세: 단계 순서 A, B, C, 회고. 목표 설정과 오늘의 이유는 뺀다', () => {
  const m = (id: string, phase: Message['phase'], createdAt: number): Message => ({
    id,
    goalId: 'g',
    day: '2026-10-19',
    phase,
    role: 'user',
    text: id,
    meta: {},
    createdAt,
  });
  const groups = phaseGroups([m('r', 'retro', 5), m('b2', 'B', 4), m('b1', 'B', 3), m('a', 'A', 1), m('s', 'reason', 0), m('x', 'setup', 0)]);
  assert.deepEqual(
    groups.map((g) => [g.phase, g.messages.map((x) => x.id)]),
    [
      ['A', ['a']],
      ['B', ['b1', 'b2']],
      ['retro', ['r']],
    ],
  );
});
