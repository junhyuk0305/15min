import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clockRunning,
  coachModalOf,
  dayEnded,
  dismissIdle,
  fmtLeft,
  hiddenUntilClosed,
  linesOf,
  OVERLAY,
  overlayFor,
  overlayMs,
  phaseBar,
  phaseEnd,
  phaseName,
  phasePlan,
  phaseRemaining,
  phaseTipId,
  quizModalOf,
  quizStep,
  retroAwaitsAnswer,
  retroClosing,
  revealedChoice,
  saveFailure,
  savePhase,
  sendId,
  studiedBefore,
  tick,
  touch,
  type ClockGates,
  type ClockState,
} from '../learn';
import { copy } from '../copy';
import type { Message } from '../model';

const open: ClockGates = { appActive: true, focused: true, waiting: false, revealing: false, offline: false, failed: false, overlay: false, tip: false, blocked: false };
const start: ClockState = { secs: 0, quietMs: 0, idle: false };

// 시계 멈춤 조건 (기획서 11.2, MP 7.3)

test('시계: 모든 조건이 맞을 때만 돈다', () => {
  assert.equal(clockRunning(open), true);
  for (const k of ['waiting', 'revealing', 'offline', 'failed', 'overlay', 'tip', 'blocked'] as const) assert.equal(clockRunning({ ...open, [k]: true }), false, k);
  for (const k of ['appActive', 'focused'] as const) assert.equal(clockRunning({ ...open, [k]: false }), false, k);
});

test('글자 표시 중에는 시계가 멈추고 시간도 딴짓 판정도 늘지 않는다 (UXP 3절)', () => {
  const running = clockRunning({ ...open, revealing: true });
  assert.equal(running, false);
  const s: ClockState = { secs: 40, quietMs: 0, idle: false };
  assert.deepEqual(tick(s, 600, running).state, s);
});

test('처음 안내가 떠 있으면 시계가 멈추고 시간도 딴짓 판정도 늘지 않는다 (UXP 3절 "처음 안내")', () => {
  const running = clockRunning({ ...open, tip: true });
  assert.equal(running, false);
  let s: ClockState = { secs: 0, quietMs: 0, idle: false };
  // 첫 학습 규칙 모달을 3분 동안 읽어도 0초이고 딴짓 팝업도 없다
  for (let i = 0; i < 180; i++) {
    const r = tick(s, 900, running);
    assert.equal(r.becameIdle, false);
    s = r.state;
  }
  assert.deepEqual(s, { secs: 0, quietMs: 0, idle: false });
});

test('딴짓 2분은 글자 표시가 끝난 뒤부터 센다', () => {
  // 응답이 오면 touch로 0이 되고(request의 finally), 표시하는 1.5초 동안은 멈춰 있다
  let s = touch({ secs: 100, quietMs: 90_000, idle: false });
  for (let i = 0; i < 2; i++) s = tick(s, 600, clockRunning({ ...open, revealing: true })).state;
  assert.deepEqual(s, { secs: 100, quietMs: 0, idle: false });
  // 표시가 끝난 뒤 119초까지는 팝업이 없고 120초째에 뜬다
  let idleAt = -1;
  for (let i = 0; i < 125; i++) {
    const r = tick(s, 600, clockRunning(open));
    s = r.state;
    if (r.becameIdle) idleAt = i;
  }
  assert.equal(idleAt, 119);
  assert.equal(s.secs, 219);
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

// 진행 저장 실패 (QA Q-D)

test('저장 실패: 시간 초과도 연결 끊김처럼 오프라인으로 본다. 횟수는 늘리지 않는다', () => {
  assert.deepEqual(saveFailure('network', 0), { offline: true, failsInRow: 0, stuck: false });
  assert.deepEqual(saveFailure('timeout', 0), { offline: true, failsInRow: 0, stuck: false });
});

test('저장 실패: 그 밖의 실패가 2번 이어지면 시계를 멈춘다', () => {
  const one = saveFailure('server', 0);
  assert.deepEqual(one, { offline: false, failsInRow: 1, stuck: false });
  const two = saveFailure('invalid', one.failsInRow);
  assert.deepEqual(two, { offline: false, failsInRow: 2, stuck: true });
  assert.equal(saveFailure('timeout', two.failsInRow).stuck, true, '멈춘 뒤 끊겨도 멈춤은 풀리지 않는다');
});

// 단계 이름과 첫날 (첫 사용 F2, F11)

test('단계 이름: 첫날 A는 수준 확인, 나머지는 학습 화면 이름 그대로', () => {
  assert.equal(phaseName('A', true), copy.learn.levelPhase);
  assert.equal(phaseName('A'), copy.learn.phase.A);
  assert.equal(phaseName('C', true), copy.learn.phase.C, 'C는 수준 확인이 아니다');
  assert.equal(phaseName('retro'), copy.learn.phase.retro);
});

test('첫날 판정: 오늘 전에 오늘의 이유를 쓴 날이 있어야 학습한 적이 있다', () => {
  const d = (day: string, todayReason: string | null, goalId = 'g') => ({ goalId, day, todayReason });
  assert.equal(studiedBefore([], 'g', '2026-10-19'), false);
  assert.equal(studiedBefore([d('2026-10-19', '오늘 이유를 스무 자 넘게 씁니다')], 'g', '2026-10-19'), false, '오늘은 세지 않는다');
  assert.equal(studiedBefore([d('2026-10-18', null)], 'g', '2026-10-19'), false, '쿠폰이나 실패로 끝난 날');
  assert.equal(studiedBefore([d('2026-10-18', '이유')], 'other', '2026-10-19'), false, '다른 목표');
  assert.equal(studiedBefore([d('2026-10-18', '이유')], 'g', '2026-10-19'), true);
});

test('학습 순서: 15분은 3분, 9분, 3분, 회고 3분. 나누어떨어지지 않으면 초까지', () => {
  assert.deepEqual(
    phasePlan(15).map((p) => [p.phase, copy.session.planTime(p.seconds)]),
    [
      ['A', '3분'],
      ['B', '9분'],
      ['C', '3분'],
      ['retro', '3분'],
    ],
  );
  const p13 = phasePlan(13);
  assert.equal(p13.slice(0, 3).reduce((n, p) => n + p.seconds, 0), 13 * 60, '세 단계를 더하면 학습 분이다');
  assert.equal(copy.session.planTime(p13[0].seconds), '2분 36초');
});

test('단계 전환 안내: 들어옴 250 + 유지 1000 + 나감 250. 처음 안내가 붙으면 유지 2000 (갭분석 M4)', () => {
  assert.equal(overlayMs(false), 1250);
  assert.equal(overlayMs(true), 2250);
  assert.equal(overlayMs(false) + OVERLAY.out, 1500);
  assert.equal(overlayMs(true) + OVERLAY.out, 2500);
  assert.equal(phaseTipId('A'), null, 'A는 진행 막대가 대신한다');
  assert.equal(phaseTipId('B'), 'phase-b');
  assert.equal(phaseTipId('C'), 'phase-c');
  assert.equal(phaseTipId('retro'), null);
});

test('진행 막대: 칸 길이는 phasePlan 비율, 지금 칸만 남은 만큼 차 있다 (갭분석 V5)', () => {
  const at0 = phaseBar(15, 0);
  assert.deepEqual(
    at0.map((c) => [c.phase, c.share, c.fill, c.state]),
    [
      ['A', 3 / 18, 1, 'now'],
      ['B', 9 / 18, 1, 'next'],
      ['C', 3 / 18, 1, 'next'],
      ['retro', 3 / 18, 1, 'next'],
    ],
  );
  // B 시작 90초 뒤: A는 지났고 B는 450/540 남았다
  const b = phaseBar(15, 270);
  assert.deepEqual(b.map((c) => c.state), ['done', 'now', 'next', 'next']);
  assert.equal(b[0].fill, 0);
  assert.equal(b[1].fill, 450 / 540);
  // 회고 90초: 앞 세 칸은 지났고 회고 칸이 반 남았다
  const r = phaseBar(15, 900, 90);
  assert.deepEqual(r.map((c) => [c.state, c.fill]), [['done', 0], ['done', 0], ['done', 0], ['now', 0.5]]);
  // 학습 분이 15가 아니어도 그 비율대로 나뉜다
  const p13 = phaseBar(13, 0);
  assert.equal(p13.reduce((n, c) => n + c.share, 0), 1);
  assert.equal(p13[0].share, 156 / (780 + 180));
});

test('단계 남은 시간: 분 앞에 0을 붙이지 않는다', () => {
  assert.equal(fmtLeft(273), '4:33');
  assert.equal(fmtLeft(540), '9:00');
  assert.equal(fmtLeft(5), '0:05');
  assert.equal(fmtLeft(-3), '0:00');
});

// 복습 채점 (첫 사용 F3)

test('채점 뒤: 맞으면 right, 정답을 감춘 첫 오답은 retry, 정답을 보이면 revealed', () => {
  assert.equal(quizStep({ correct: true, answerEn: 'instead' }), 'right');
  assert.equal(quizStep({ correct: false, answerEn: '' }), 'retry');
  assert.equal(quizStep({ correct: false, answerEn: 'instead' }), 'revealed');
});

test('뜻 고르기 정답 공개: 채점 문장에 따옴표로 든 보기가 정답이다', () => {
  const choices = ['대신', '항상', '먼저'];
  assert.equal(revealedChoice(choices, '정답은 "항상"입니다.'), 1);
  assert.equal(revealedChoice(choices, '맞았습니다.'), -1);
  assert.equal(revealedChoice(undefined, '정답은 "항상"입니다.'), -1);
});

// 회고 마무리 (첫 사용 F9)

test('회고 마무리: 남은 시간이 20초 이하면 closing으로 보낸다', () => {
  assert.equal(retroClosing(159), false);
  assert.equal(retroClosing(160), true);
  assert.equal(retroClosing(180), true);
});

test('회고: 마지막 줄이 마무리가 아닌 코치 줄이면 답을 기다린다', () => {
  const r = (id: string, role: Message['role'], meta: Record<string, unknown> = {}) => msg(id, role, id, { phase: 'retro', meta });
  assert.equal(retroAwaitsAnswer([]), false);
  assert.equal(retroAwaitsAnswer([r('q1', 'coach', { retro_q: 1 })]), true);
  assert.equal(retroAwaitsAnswer([r('q1', 'coach', { retro_q: 1 }), r('u1', 'user')]), false);
  assert.equal(retroAwaitsAnswer([r('u2', 'user'), r('f', 'coach', { retro_stage: 'follow_up' })]), true);
  assert.equal(retroAwaitsAnswer([r('u2', 'user'), r('c', 'coach', { retro_stage: 'closing' })]), false);
  assert.equal(retroAwaitsAnswer([r('c', 'coach', { retro_stage: 'closing' }), msg('b', 'partner', 'B 줄')]), false, '회고 줄만 본다');
});

// 04:00 경계 (QA Q-E)

test('하루 경계: 하루 키가 바뀌거나, 실패로 판정되거나, 그날 행이 없으면(not_found) 끝났다', () => {
  assert.equal(dayEnded('2026-10-18', '2026-10-18', 'progress'), false);
  assert.equal(dayEnded('2026-10-18', '2026-10-19', 'progress'), true, '04:00이 지남');
  assert.equal(dayEnded('2026-10-18', '2026-10-18', 'failed'), true, '서버가 먼저 실패로 판정');
  assert.equal(dayEnded('2026-10-18', '2026-10-18', 'progress', 'not_found'), true, '경계를 넘긴 저장');
  assert.equal(dayEnded('2026-10-18', '2026-10-18', 'progress', 'server'), false, '다른 저장 실패는 경계가 아니다');
  assert.equal(dayEnded('2026-10-18', '2026-10-19', 'done'), false, '완료한 날은 끝난 것이 아니다');
});
