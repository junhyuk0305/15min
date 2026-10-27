// B 표현 보기(hint) 경로. 메모리 DB와 가짜 모델로 돌린다.
import assert from 'node:assert/strict';
import { checkHint, finalizeHint } from '../lesson-turn/core.ts';
import { handle } from '../lesson-turn/handler.ts';
import { fakeTransport, type Transport } from '../_shared/gemini.ts';
import type { HintContext, HintOutput } from '../_shared/prompts/lesson-turn.ts';
import { hasHangul } from '../_shared/text.ts';
import type { ItemRow, MessageRow, UsageRow } from '../_shared/types.ts';
import { call, counting, deps, GOAL, NOW, seed, TODAY, USER } from './helpers.ts';

const PARTNER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const hintBody = { goal_id: GOAL, day: TODAY, hint: true };
const partnerRow: MessageRow = {
  id: PARTNER, user_id: USER, goal_id: GOAL, day: TODAY, phase: 'B', role: 'partner',
  text: 'Hi there! What can I get for you?', meta: { opening: true, episode_index: 0, cursor: 0 }, created_at: '2026-10-20T10:59:00Z',
};
const known = "I'd like …, please.";
const item = (base: string, i: number, p: Partial<ItemRow> = {}): ItemRow => ({
  id: `00000000-0000-4000-8000-00000000010${i}`, user_id: USER, goal_id: GOAL,
  kind: base.includes('…') ? 'expression' : 'word', base, ko: '뜻', note: '설명입니다.',
  state: 'taught', srs_step: 0, next_due_day: '2026-10-21', unaided_streak: 0,
  first_day: TODAY, created_at: '2026-10-20T10:00:00Z', ...p,
});
// 15분 → 하루 새 항목 상한 3. 오늘 표현 3개, 단어 3개를 이미 가르쳤다.
const full = () => [item(known, 0), item('b …', 1), item('c …', 2), item('w1', 3), item('w2', 4), item('w3', 5)];

Deno.test('hint: 상한 안이면 새 표현 모달을 코치 줄로 저장하고 상대 줄은 만들지 않는다', async () => {
  const repo = seed({ messages: [structuredClone(partnerRow)] });
  const c = counting();
  const r = await call(handle, deps(repo, c.transport), hintBody);
  assert.equal(r.status, 200);
  assert.equal(r.body.messages.length, 1);
  const [coach] = r.body.messages;
  assert.equal(coach.role, 'coach');
  assert.equal(coach.meta.hint, true);
  assert.ok(hasHangul(coach.text));
  assert.equal(r.body.modal.expression.en, 'Can I get …, please?');
  assert.equal(repo.t.messages.filter((m) => m.role === 'partner').length, 1, '상대 줄은 그대로');
  assert.ok(coach.created_at > partnerRow.created_at);
  assert.equal(repo.t.items.length, 2, '표현 1, 단어 1');
  assert.ok(repo.t.items.every((i) => i.state === 'taught' && i.first_day === TODAY));
  assert.equal(repo.t.item_events.filter((e) => e.kind === 'taught').length, 2);
  assert.equal(repo.t.item_events.filter((e) => e.kind !== 'taught').length, 0);

  const again = await call(handle, deps(repo, c.transport), hintBody);
  assert.deepEqual(again.body, r.body, '같은 상대 질문에 다시 누르면 저장된 줄');
  assert.deepEqual(c.calls, ['lesson-hint'], '모델은 한 번만');
});

Deno.test('hint: 새 표현 상한이 차면 배운 표현을 주고 새 항목을 만들지 않는다', async () => {
  const repo = seed({ messages: [structuredClone(partnerRow)], items: full() });
  const r = await call(handle, deps(repo), hintBody);
  assert.equal(r.status, 200);
  assert.equal(r.body.modal.expression.en, known);
  assert.equal(repo.t.items.length, 6);
  assert.equal(repo.t.items.find((i) => i.base === known)!.srs_step, 0, '교정처럼 taught로 다시 센다');
});

Deno.test('hint: 상한이 찼는데 모델이 새 표현을 내면 서버가 잘라 쉬운 풀어 쓰기만 남긴다', async () => {
  const repo = seed({ messages: [structuredClone(partnerRow)], items: full() });
  const greedy: Transport = (req) =>
    req.promptId === 'lesson-hint'
      ? Promise.resolve({ text: JSON.stringify({ coach_modal: { expression: { en: 'Could I try …?', ko: '…해 봐도 됩니까?', note: '부탁할 때 씁니다.' }, words: [] }, coach_note: '짧게 원하는 것을 말하십시오.' }), inputTokens: 0, outputTokens: 0 })
      : fakeTransport(req);
  const before = repo.t.items.length;
  const r = await call(handle, deps(repo, greedy), hintBody);
  assert.equal(r.status, 200);
  assert.equal(r.body.modal, null);
  assert.ok(hasHangul(r.body.messages[0].text), 'coach_note는 남는다');
  assert.deepEqual(r.body.messages[0].meta.trimmed, ['expression:Could I try …?']);
  assert.equal(repo.t.items.length, before);
  assert.equal(repo.t.item_events.length, 0);
});

Deno.test('hint: 하루 호출 한도를 다 쓰면 429 limit, 모델을 부르지 않고 아무것도 남기지 않는다', async () => {
  const usage: UsageRow[] = Array.from({ length: 150 }, () => ({
    user_id: USER, day: TODAY, fn: 'lesson-turn', prompt_version: 'v', model: 'm',
    input_tokens: 0, output_tokens: 0, latency_ms: 0, ok: true, created_at: '2026-10-20T10:00:00Z',
  }));
  const repo = seed({ messages: [structuredClone(partnerRow)], ai_usage: usage });
  const c = counting();
  const r = await call(handle, deps(repo, c.transport), hintBody);
  assert.equal(r.status, 429);
  assert.deepEqual(r.body, { error: 'limit' });
  assert.equal(c.calls.length, 0);
  assert.equal(repo.t.messages.length, 1);
  // 149회면 힌트 한 번이 한도 안에서 150번째로 센다
  const repo2 = seed({ messages: [structuredClone(partnerRow)], ai_usage: usage.slice(1) });
  assert.equal((await call(handle, deps(repo2), hintBody)).status, 200);
  assert.equal(repo2.t.ai_usage.length, 150);
  assert.equal(repo2.t.ai_usage.at(-1)!.fn, 'lesson-turn');
});

Deno.test('hint: 한국어로 막힌 뒤에도 마지막 상대 질문에 답할 표현을 주고, 그 표현을 쓰면 도움 후 사용', async () => {
  const repo = seed();
  const contexts: HintContext[] = [];
  const spy: Transport = (req) => {
    if (req.promptId === 'lesson-hint') contexts.push(req.context as HintContext);
    return fakeTransport(req);
  };
  await call(handle, deps(repo, spy), { goal_id: GOAL, day: TODAY });
  const stuck = await call(handle, deps(repo, spy, NOW + 1000), { goal_id: GOAL, day: TODAY, message: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', text: '모르겠어요' } });
  assert.equal(stuck.body.messages.find((m: { role: string }) => m.role === 'coach').meta.verdict, 'not_english');
  const lastPartner = stuck.body.messages.findLast((m: { role: string }) => m.role === 'partner');

  const r = await call(handle, deps(repo, spy, NOW + 2000), hintBody);
  assert.equal(r.status, 200);
  assert.ok(r.body.modal.expression);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].partnerQuestion, lastPartner.text, '한국어 답 뒤 상대가 다시 물은 질문');
  assert.ok(contexts[0].dialogue.some((l) => l.role === 'learner' && hasHangul(l.text)), '한국어 줄은 데이터로 들어간다');

  const used = await call(handle, deps(repo, spy, NOW + 3000), { goal_id: GOAL, day: TODAY, message: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002', text: 'Can I get a latte, please?' } });
  assert.equal(used.status, 200);
  const ev = repo.t.item_events.find((e) => e.kind === 'used');
  assert.equal(ev?.aided, true, '힌트로 배운 표현을 쓰면 도움 후 사용');
});

Deno.test('hint: 상대 질문이 없거나 요청 모양이 틀리면 400', async () => {
  assert.equal((await call(handle, deps(seed()), hintBody)).status, 400);
  const repo = seed({ messages: [structuredClone(partnerRow)] });
  assert.equal((await call(handle, deps(repo), { ...hintBody, hint: 'yes' })).status, 400);
  assert.equal((await call(handle, deps(repo), { ...hintBody, message: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003', text: 'Hi' } })).status, 400);
  assert.equal(repo.t.messages.length, 1);
});

const hctx: HintContext = {
  situation: { place: '카페', my_role: '손님', partner: '바리스타', task: '주문' },
  subsituations: ['주문'], cursor: 0, knownItems: [], budget: { expressions: 3, words: 3 },
  dialogue: [], partnerQuestion: 'What can I get for you?',
};
const good: HintOutput = {
  coach_modal: { expression: { en: "I'd like …, please.", ko: '…로 주십시오.', note: '주문할 때 씁니다.' }, words: [] },
  coach_note: '빈칸에 마실 것을 넣어 답하십시오.',
};

Deno.test('hint 규칙: 한국어 합니다체 안내, 상한이 남으면 표현 하나', () => {
  assert.deepEqual(checkHint(good, hctx), []);
  assert.ok(checkHint({ ...good, coach_note: 'Fill in the blank.' }, hctx).length > 0);
  assert.ok(checkHint({ ...good, coach_note: '빈칸을 채워 보세요.' }, hctx).some((e) => e.includes('말투')));
  assert.ok(checkHint({ ...good, coach_modal: null }, hctx).length > 0);
  assert.deepEqual(checkHint({ ...good, coach_modal: null }, { ...hctx, budget: { expressions: 0, words: 0 } }), []);
  assert.deepEqual(finalizeHint(good, { ...hctx, budget: { expressions: 0, words: 0 } }).trimmed, ["expression:I'd like …, please."]);
});
