import assert from 'node:assert/strict';
import { runTurn } from '../lesson-turn/core.ts';
import { createAi, type Transport, type TransportRequest } from '../_shared/gemini.ts';
import type { Tier } from '../_shared/config.ts';
import type { TurnContext, TurnOutput } from '../_shared/prompts/lesson-turn.ts';

const context: TurnContext = {
  situation: { place: '카페', my_role: '손님', partner: '바리스타', task: '주문' },
  subsituations: ['주문', '결제'], cursor: 0, knownItems: [], budget: { expressions: 3, words: 3 },
  dialogue: [], previousPartner: 'What can I get for you?', koreanDetected: false,
  learnerText: 'I want order coffee.',
};
const natural: TurnOutput = {
  verdict: 'natural', partner: 'Sure. Hot or iced?', coach_modal: null, coach_note: null,
  hidden_correction: null, subsituation_done: false,
};
const correction: TurnOutput = {
  verdict: 'needs_correction', partner: 'And which snack would you like?',
  coach_modal: { expression: { en: "I'd like …, please.", ko: '…로 하고 싶습니다.', note: '원할 때 씁니다.' }, words: [] },
  coach_note: "'want order'에서 두 동사를 잇는 말을 확인하십시오.",
  hidden_correction: 'I want to order coffee.', subsituation_done: false,
};

/** 등급별로 정해 둔 답을 돌려주고 부른 등급을 기록한다. */
function scripted(byTier: Record<Tier, TurnOutput>) {
  const calls: Tier[] = [];
  const transport: Transport = (r: TransportRequest) => {
    calls.push(r.tier);
    return Promise.resolve({ text: JSON.stringify(byTier[r.tier]), inputTokens: 0, outputTokens: 0 });
  };
  const ai = createAi({
    config: { fake: false, apiKey: 'x', models: { main: 'main-model', light: 'light-model' }, dailyLimit: 9, goalSetupLimit: 9, globalDailyLimit: 9 },
    transport,
    meter: { reserve: () => Promise.resolve(0), finish: () => Promise.resolve() },
  });
  return { ai, calls };
}

Deno.test('routing: 교정이 필요 없는 턴은 light 한 번으로 끝낸다', async () => {
  const { ai, calls } = scripted({ light: natural, main: correction });
  const r = await runTurn(ai, { ...context, learnerText: "I'd like a latte, please." });
  assert.deepEqual(calls, ['light']);
  assert.equal(r.verdict, 'natural');
  assert.equal(r.partner, natural.partner);
});

Deno.test('routing: light가 교정이 필요하다고 보면 main이 교정을 쓴다', async () => {
  const lightCorrection = { ...correction, partner: 'light partner line', coach_note: 'light note' };
  const { ai, calls } = scripted({ light: lightCorrection, main: correction });
  const r = await runTurn(ai, context);
  assert.deepEqual(calls, ['light', 'main']);
  assert.equal(r.verdict, 'needs_correction');
  assert.equal(r.partner, correction.partner);
});

Deno.test('routing: light의 교정 내용이 규칙을 어겨도 light로 다시 묻지 않고 main으로 넘긴다', async () => {
  const broken = { ...correction, coach_modal: null, hidden_correction: null };
  const { ai, calls } = scripted({ light: broken, main: correction });
  const r = await runTurn(ai, context);
  assert.deepEqual(calls, ['light', 'main']);
  assert.equal(r.verdict, 'needs_correction');
});
