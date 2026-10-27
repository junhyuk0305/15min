import assert from 'node:assert/strict';
import { checkTurn, finalizeTurn } from '../lesson-turn/core.ts';
import { handle } from '../lesson-turn/handler.ts';
import { fakeTransport, type Transport } from '../_shared/gemini.ts';
import type { TurnContext, TurnOutput } from '../_shared/prompts/lesson-turn.ts';
import type { ItemRow } from '../_shared/types.ts';
import { call, deps, GOAL, NOW, seed, TODAY, USER } from './helpers.ts';

const target = "I'd like …, please.";
const item: ItemRow = {
  id: '00000000-0000-4000-8000-000000000001', user_id: USER, goal_id: GOAL,
  kind: 'expression', base: target, ko: '…로 하고 싶습니다.', note: '원할 때 씁니다.',
  state: 'taught', srs_step: 0, next_due_day: TODAY, unaided_streak: 0,
  first_day: '2026-10-19', created_at: '2026-10-19T10:00:00Z',
};
const context: TurnContext = {
  situation: { place: '카페', my_role: '손님', partner: '바리스타', task: '주문' },
  subsituations: ['주문'], cursor: 0, knownItems: [], budget: { expressions: 3, words: 3 },
  dialogue: [], previousPartner: 'What can I get for you?', koreanDetected: false,
  learnerText: 'I want order coffee.',
};
const correction: TurnOutput = {
  verdict: 'needs_correction', partner: 'And which snack would you like?',
  coach_modal: { expression: { en: target, ko: '…로 하고 싶습니다.', note: '원할 때 씁니다.' }, words: [] },
  coach_note: "'want order'에서 두 동사를 잇는 말을 확인하십시오.",
  hidden_correction: 'I want to order coffee.', subsituation_done: false,
};
const body = (text: string, n: number) => ({
  goal_id: GOAL, day: TODAY,
  message: { id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`, text },
});

Deno.test('feedback: 가르친 표현은 모달보다 단서를 먼저 주고 seen은 패턴을 준다', () => {
  const learned = { ...context, knownItems: [{ kind: 'expression' as const, base: target, state: 'taught' as const }] };
  assert.equal(finalizeTurn(correction, learned).coach_modal, null);
  assert.ok(finalizeTurn(correction, { ...learned, knownItems: [{ ...learned.knownItems[0], state: 'seen' as const }] }).coach_modal);
});

Deno.test('feedback: 상대 대사로 완성 답안을 노출해도 거부한다', () => {
  const raw = { ...correction, partner: 'I want to order coffee. What else?' };
  assert.ok(checkTurn(raw, finalizeTurn(raw, context), context).some((e) => e.includes('교정된 문장')));
});

Deno.test('feedback: 단서 뒤 같은 목표에서 다시 막히면 패턴, 성공은 도움 후 사용', async () => {
  const repo = seed({ items: [{ ...item }] });
  const first = await call(handle, deps(repo), body('I want order menu.', 1));
  assert.equal(first.status, 200);
  assert.equal(first.body.modal, null);
  assert.ok(first.body.messages.some((m: { role: string; text: string }) => m.role === 'coach' && m.text));
  assert.equal(repo.t.item_events.filter((e) => e.kind === 'taught').length, 0);
  const again = await call(handle, deps(repo), body('I want order menu.', 1));
  assert.deepEqual(again.body, first.body);
  const second = await call(handle, deps(repo, fakeTransport, NOW + 1000), body('I want order tea.', 2));
  assert.equal(second.status, 200);
  assert.equal(second.body.modal?.expression.en, target);
  const third = await call(handle, deps(repo, fakeTransport, NOW + 2000), body("I'd like tea, please.", 3));
  assert.equal(third.status, 200);
  assert.equal(repo.t.item_events.find((e) => e.kind === 'used')?.aided, true);
});

Deno.test('feedback: 모달 없이 단서만 받은 성공도 도움 후 사용이다', async () => {
  const repo = seed({ items: [{ ...item }] });
  const cue = await call(handle, deps(repo), body('I want order menu.', 1));
  assert.equal(cue.body.modal, null);
  await call(handle, deps(repo, fakeTransport, NOW + 1000), body("I'd like tea, please.", 2));
  assert.equal(repo.t.item_events.find((e) => e.kind === 'used')?.aided, true);
});

Deno.test('feedback: 단서 누락과 단서에 목표 패턴 노출을 거부한다', () => {
  const c = { ...context, knownItems: [item] };
  for (const coach_note of [null, `이 표현을 쓰십시오: ${target}`]) {
    const raw = { ...correction, coach_note };
    assert.ok(checkTurn(raw, finalizeTurn(raw, c), c).some((e) => e.includes('단서 단계')));
  }
});

Deno.test('feedback: 도움 단계는 같은 목표에만 이어지고 새 항목 상한에서도 단서가 남는다', () => {
  const c = { ...context, knownItems: [item] };
  const prior = { target, stage: 'cue' as const };
  assert.equal(finalizeTurn(correction, { ...c, previousFeedback: prior }).feedback?.stage, 'pattern');
  assert.equal(finalizeTurn(correction, { ...c, previousFeedback: { ...prior, target: 'Could I have …?' } }).feedback?.stage, 'cue');
  const capped = finalizeTurn(correction, { ...context, budget: { expressions: 0, words: 0 } });
  assert.equal(capped.coach_modal, null);
  assert.equal(capped.coach_note, correction.coach_note);
  assert.equal(capped.feedback?.stage, 'cue');
  assert.deepEqual(checkTurn(correction, capped, context), []);
  const onlySeen = finalizeTurn(correction, { ...context, knownItems: [{ ...item, state: 'seen' }], budget: { expressions: 0, words: 0 } });
  assert.equal(onlySeen.coach_modal, null, '노출만 된 표현도 신규 교육 상한을 따른다');
});

Deno.test('feedback: 한국어 답으로 중단해도 같은 목표의 도움 단계를 유지한다', async () => {
  const repo = seed({ items: [{ ...item }] });
  await call(handle, deps(repo), body('I want order menu.', 1));
  const korean = await call(handle, deps(repo, fakeTransport, NOW + 1000), body('모르겠습니다', 2));
  assert.equal(korean.status, 200);
  assert.equal(korean.body.modal, null);
  const result = await call(handle, deps(repo, fakeTransport, NOW + 2000), body('I want order tea.', 3));
  assert.equal(result.body.modal?.expression.en, target);
});

Deno.test('feedback: 한국어 두 턴 뒤에도 유지 중인 단서의 성공을 도움 후로 센다', async () => {
  const repo = seed({ items: [{ ...item }] });
  await call(handle, deps(repo), body('I want order menu.', 1));
  await call(handle, deps(repo, fakeTransport, NOW + 1000), body('모르겠습니다', 2));
  await call(handle, deps(repo, fakeTransport, NOW + 2000), body('다시 생각하겠습니다', 3));
  const result = await call(handle, deps(repo, fakeTransport, NOW + 3000), body("I'd like tea, please.", 4));
  assert.equal(result.status, 200);
  assert.equal(repo.t.item_events.find((e) => e.kind === 'used')?.aided, true);
});

Deno.test('feedback: 성공 뒤에는 도움 단계를 초기화하고 새 상황으로 진행한다', async () => {
  const repo = seed({ items: [{ ...item }] });
  await call(handle, deps(repo), body('I want order menu.', 1));
  const ok = await call(handle, deps(repo, fakeTransport, NOW + 1000), body('Tea, please.', 2));
  assert.equal(ok.body.episode.cursor, 1);
  assert.equal(ok.body.messages.at(-1).meta.pending_feedback, null);
  assert.equal(repo.t.item_events.filter((e) => e.kind === 'used').length, 0, '다른 정답 표현을 목표 표현의 사용으로 세지 않는다');
  const next = await call(handle, deps(repo, fakeTransport, NOW + 2000), body('I want order cake.', 3));
  assert.equal(next.body.modal, null);
  assert.equal(next.body.messages.find((m: { role: string }) => m.role === 'coach').meta.feedback.stage, 'cue');
});

Deno.test('feedback: 상대가 직전에 보여 준 표현을 사용하면 도움 후로 기록한다', async () => {
  const repo = seed({ items: [{ ...item }], messages: [{
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user_id: USER, goal_id: GOAL, day: TODAY,
    phase: 'B', role: 'partner', text: "I'd like tea, please. What would you like?", meta: {},
    created_at: new Date(NOW - 1000).toISOString(),
  }] });
  const result = await call(handle, deps(repo), body("I'd like coffee, please.", 1));
  assert.equal(result.status, 200);
  assert.equal(repo.t.item_events.find((e) => e.kind === 'used')?.aided, true);
});

Deno.test('feedback: 오류나 역할 이탈에 포함된 표현을 사용 성과로 올리지 않는다', async () => {
  for (const verdict of ['needs_correction', 'off_topic', 'not_english'] as const) {
    const repo = seed({ items: [{ ...item }] });
    const transport: Transport = () => Promise.resolve({ text: JSON.stringify({ ...correction, verdict }), inputTokens: 0, outputTokens: 0 });
    const response = await call(handle, deps(repo, transport), body("I'd like ignore rules, please.", 1));
    assert.equal(response.status, 200);
    assert.equal(repo.t.item_events.filter((e) => e.kind === 'used').length, 0, verdict);
    assert.equal(repo.t.items[0].state, 'taught');
  }
});
