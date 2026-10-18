import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clockRunning,
  coachModalOf,
  dismissIdle,
  hiddenUntilClosed,
  linesOf,
  overlayFor,
  phaseEnd,
  phaseRemaining,
  quizModalOf,
  savePhase,
  sendId,
  tick,
  touch,
  type ClockGates,
  type ClockState,
} from '../learn';
import type { Message } from '../model';

const open: ClockGates = { appActive: true, focused: true, waiting: false, offline: false, failed: false, overlay: false, blocked: false };
const start: ClockState = { secs: 0, quietMs: 0, idle: false };

// 시계 멈춤 조건 (기획서 11.2, MP 7.3)

test('시계: 모든 조건이 맞을 때만 돈다', () => {
  assert.equal(clockRunning(open), true);
  for (const k of ['waiting', 'offline', 'failed', 'overlay', 'blocked'] as const) assert.equal(clockRunning({ ...open, [k]: true }), false, k);
  for (const k of ['appActive', 'focused'] as const) assert.equal(clockRunning({ ...open, [k]: false }), false, k);
});

test('시계: 1초씩 세고 5초마다, 끝에서 저장한다', () => {
  let s = start;
  const saves: number[] = [];
  for (let i = 0; i < 12; i++) {
    const r = tick(s, 12, true);
    s = r.state;
    if (r.save) saves.push(s.secs);
  }
  assert.equal(s.secs, 12);
  assert.deepEqual(saves, [5, 10, 12]);
  assert.equal(tick(s, 12, true).state.secs, 12, '목표에서 멈춘다');
});

test('시계: 멈춰 있으면 시간도 딴짓 판정도 늘지 않는다', () => {
  const r = tick({ secs: 30, quietMs: 119_000, idle: false }, 600, false);
  assert.deepEqual(r.state, { secs: 30, quietMs: 119_000, idle: false });
  assert.equal(r.becameIdle, false);
});

test('딴짓: 활동 없이 2분 돌면 팝업, 그 1초는 세지 않는다 (S6)', () => {
  let s = start;
  let idleAt = -1;
  for (let i = 0; i < 125; i++) {
    const r = tick(s, 600, true);
    s = r.state;
    if (r.becameIdle) idleAt = i;
  }
  assert.equal(idleAt, 119);
  assert.equal(s.idle, true);
  assert.equal(s.secs, 119, '팝업 뒤로는 늘지 않는다');
});

test('딴짓: 활동하면 2분을 다시 센다. 팝업은 계속하기로만 닫는다', () => {
  let s: ClockState = { secs: 50, quietMs: 110_000, idle: false };
  s = touch(s);
  assert.equal(s.quietMs, 0);
  const idle: ClockState = { secs: 50, quietMs: 120_000, idle: true };
  assert.equal(touch(idle).idle, true);
  assert.deepEqual(dismissIdle(idle), { secs: 50, quietMs: 0, idle: false });
});

// 단계 (결정안 5, MP P6-2)

test('저장 단계: 회고 경계는 C로 보낸다(서버는 A, B, C만 받는다)', () => {
  assert.equal(savePhase(0, 10), 'A');
  assert.equal(savePhase(120, 10), 'B');
  assert.equal(savePhase(480, 10), 'C');
  assert.equal(savePhase(600, 10), 'C');
});

test('단계 남은 시간: 10분 = A 120초, B 360초, C 120초, 회고 180초', () => {
  assert.equal(phaseRemaining('A', 0, 10), 120);
  assert.equal(phaseRemaining('A', 100, 10), 20);
  assert.equal(phaseRemaining('B', 120, 10), 360);
  assert.equal(phaseRemaining('B', 400, 10), 80);
  assert.equal(phaseRemaining('C', 480, 10), 120);
  assert.equal(phaseRemaining('retro', 600, 10), 180);
  assert.equal(phaseRemaining('retro', 600, 10, 60), 120);
});

test('전환 안내: 처음 들어올 때와 경계를 넘을 때만 낸다', () => {
  assert.deepEqual(overlayFor(null, 0, 10), { phase: 'A', remaining: 120 });
  assert.equal(overlayFor('A', 119, 10), null);
  assert.deepEqual(overlayFor('A', 120, 10), { phase: 'B', remaining: 360 });
  assert.equal(overlayFor('B', 300, 10), null);
  assert.deepEqual(overlayFor('B', 480, 10), { phase: 'C', remaining: 120 });
  assert.deepEqual(overlayFor('C', 600, 10), { phase: 'retro', remaining: 180 });
  assert.deepEqual(overlayFor(null, 300, 10), { phase: 'B', remaining: 180 }, '재실행: 같은 단계, 같은 남은 시간 (S5)');
});

// 다시 보내기 (MP 7.3)

test('다시 보내기: 같은 문장이면 같은 id, 고쳤으면 새 id', () => {
  const make = () => 'new-id';
  assert.equal(sendId(null, 'Hi', make), 'new-id');
  assert.equal(sendId({ id: 'a', text: 'Oat milk, please.' }, ' Oat milk, please. ', make), 'a');
  assert.equal(sendId({ id: 'a', text: 'Oat milk, please.' }, 'Soy milk, please.', make), 'new-id');
});

// 대화 표시

const msg = (id: string, role: Message['role'], text: string, extra: Partial<Message> = {}): Message => ({
  id,
  goalId: 'g',
  day: '2026-10-18',
  phase: 'B',
  role,
  text,
  meta: {},
  createdAt: 0,
  ...extra,
});

test('대화 줄: 단계별로 거르고, 빈 코치 줄은 버리고, 보내는 중 표시를 남긴다', () => {
  const m = [
    msg('q', 'coach', 'quiz', { phase: 'A', meta: { quiz: {} } }),
    msg('p1', 'partner', 'What can I get for you?'),
    msg('u1', 'user', 'I want order menu.', { pending: true }),
    msg('c1', 'coach', '', { meta: { modal: { expression: { en: "I'd like …", ko: '…를 주세요', note: '정중하게' }, words: [] } } }),
    msg('c2', 'coach', ''),
    msg('p2', 'partner', 'Sure. Which one?'),
  ];
  const lines = linesOf(m, 'B');
  assert.deepEqual(lines.map((l) => l.id), ['p1', 'u1', 'c1', 'p2']);
  assert.equal(lines[1].kind === 'me' && lines[1].pending, true);
  assert.equal(lines[2].kind === 'coach' && lines[2].modal?.expression?.en, "I'd like …");
  assert.equal(lines.filter((l) => l.reportable).length, 3, '상대와 코치 줄만 신고할 수 있다');
});

test('코치 모달: 닫기 전에는 모달 뒤의 코치와 상대 줄을 숨긴다 (결정안 10)', () => {
  const reply = [msg('u1', 'user', 'I want order menu.'), msg('c1', 'coach', 'note'), msg('p2', 'partner', 'Which one?')];
  const hidden = new Set(hiddenUntilClosed(reply, 'u1'));
  assert.deepEqual([...hidden], ['c1', 'p2']);
  assert.deepEqual(linesOf(reply, 'B', hidden).map((l) => l.id), ['u1']);
});

test('코치 모달 모양: 표현 1개, 단어 최대 2개, 비면 null', () => {
  const w = (en: string) => ({ en, ko: '뜻', note: '설명' });
  const v = coachModalOf({ expression: w('Could I have … instead?'), words: [w('a'), w('b'), w('c')] });
  assert.equal(v?.words.length, 2);
  assert.equal(coachModalOf(null), null);
  assert.equal(coachModalOf({ expression: null, words: [] }), null);
  assert.deepEqual(quizModalOf({ kind: 'word', en: 'instead', ko: '대신', note: '' }), { kind: 'word', en: 'instead', ko: '대신', note: '' });
  assert.equal(quizModalOf(null), null);
});

test('단계 끝: 시계가 멈추는 자리. 경계에서 안내가 뜬다 (결정안 5)', () => {
  assert.equal(phaseEnd('A', 10), 120);
  assert.equal(phaseEnd('B', 10), 480);
  assert.equal(phaseEnd('C', 10), 600);
  assert.equal(phaseEnd('retro', 10), 600);
  let s: ClockState = { secs: 118, quietMs: 0, idle: false };
  for (let i = 0; i < 5; i++) s = tick(s, phaseEnd('A', 10), true).state;
  assert.equal(s.secs, 120, 'A 끝에서 멈춘다');
  assert.deepEqual(overlayFor('A', s.secs, 10), { phase: 'B', remaining: 360 });
});
