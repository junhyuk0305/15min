// _shared 모듈 단위 테스트: 스키마 검증, uuid v5, 글 규칙, 설정, Gemini 호출기.
import assert from 'node:assert/strict';
import { loadConfig } from '../_shared/config.ts';
import { HttpError } from '../_shared/errors.ts';
import { createAi, extractText, geminiTransport, type Transport, TransportError } from '../_shared/gemini.ts';
import { SCHEMA as GOAL_SCHEMA } from '../_shared/prompts/goal-setup.ts';
import { TURN_SCHEMA } from '../_shared/prompts/lesson-turn.ts';
import { GRADE_SCHEMA, QUESTION_SCHEMA } from '../_shared/prompts/review-quiz.ts';
import { forbiddenJudgment, hasHangul, itemAppearsIn, leaksFullAnswer, normalizeAnswer, sameQuestion, toneProblems } from '../_shared/text.ts';
import type { UsageRow } from '../_shared/types.ts';
import { uuidv5 } from '../_shared/uuid.ts';
import { validateSchema } from '../_shared/validate.ts';
import { config } from './helpers.ts';

const goodTurn = {
  verdict: 'needs_correction',
  partner: 'Sure. Which size would you like?',
  coach_modal: { expression: { en: "I'd like …", ko: '…로 하고 싶습니다', note: '정중하게 원할 때 씁니다.' }, words: [] },
  coach_note: null,
  hidden_correction: "I'd like a latte.",
  subsituation_done: false,
};

Deno.test('스키마: 맞는 lesson-turn 출력은 통과한다', () => {
  assert.deepEqual(validateSchema(TURN_SCHEMA, goodTurn), []);
  assert.deepEqual(validateSchema(TURN_SCHEMA, { ...goodTurn, coach_modal: null }), []);
});

Deno.test('스키마: 틀린 lesson-turn 출력을 잡는다', () => {
  assert.ok(validateSchema(TURN_SCHEMA, { ...goodTurn, verdict: 'great' }).length > 0, 'enum');
  assert.ok(validateSchema(TURN_SCHEMA, { ...goodTurn, partner: 3 }).length > 0, 'type');
  const { partner: _p, ...noPartner } = goodTurn;
  assert.ok(validateSchema(TURN_SCHEMA, noPartner).length > 0, 'required');
  const w = { en: 'a', ko: '가', note: '나' };
  assert.ok(validateSchema(TURN_SCHEMA, { ...goodTurn, coach_modal: { expression: null, words: [w, w, w] } }).length > 0, '단어 3개');
  assert.ok(validateSchema(TURN_SCHEMA, null).length > 0, 'null');
});

Deno.test('스키마: goal-setup, 문항, 채점', () => {
  const f = { reason: null, place: '카페', my_role: null, partner: null, task: null, goal_name: null };
  assert.deepEqual(validateSchema(GOAL_SCHEMA, { reply: '장소는 어디입니까?', fields: f, done: false, subsituations: [] }), []);
  assert.ok(validateSchema(GOAL_SCHEMA, { reply: 'x', fields: { ...f, place: 1 }, done: false, subsituations: [] }).length > 0);
  assert.deepEqual(validateSchema(QUESTION_SCHEMA, { partner_line: 'Hi?', choices: [], answer_index: -1, model_answer: 'Hi.' }), []);
  assert.ok(validateSchema(QUESTION_SCHEMA, { partner_line: 'Hi?', choices: [], answer_index: 7, model_answer: 'Hi.' }).length > 0);
  assert.ok(validateSchema(QUESTION_SCHEMA, { partner_line: 'Hi?', choices: [], answer_index: 1.5, model_answer: 'Hi.' }).length > 0);
  assert.deepEqual(validateSchema(GRADE_SCHEMA, { correct: true, feedback: '맞았습니다.' }), []);
  assert.ok(validateSchema(GRADE_SCHEMA, { correct: 'yes', feedback: '맞았습니다.' }).length > 0);
});

Deno.test('uuid v5: RFC 예시 값과 같고, 같은 입력이면 같은 id', async () => {
  assert.equal(await uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
  assert.equal(await uuidv5('abc:partner'), '45eb8141-02f9-5515-9a19-eb57ef7dff16');
  assert.equal(await uuidv5('m1:coach'), await uuidv5('m1:coach'));
  assert.notEqual(await uuidv5('m1:coach'), await uuidv5('m1:partner'));
});

Deno.test('글 규칙: 한글, 항목 등장, 완성 답안 노출, 같은 질문', () => {
  assert.ok(hasHangul('Latte 주세요'));
  assert.ok(!hasHangul("I'd like a latte."));
  assert.ok(itemAppearsIn('expression', 'Could I have … instead?', 'Could I have iced tea instead?'));
  assert.ok(!itemAppearsIn('expression', 'Could I have … instead?', 'Can I get tea?'));
  assert.ok(itemAppearsIn('word', 'try', 'I tried it on.'));
  assert.ok(itemAppearsIn('word', 'prefer', 'I prefers milk'));
  assert.ok(itemAppearsIn('word', 'prefer', 'I preferred tea.'));
  assert.ok(leaksFullAnswer(['Say: I would like to order a latte.'], 'I would like to order a latte.'));
  assert.ok(!leaksFullAnswer(["I'd like to order …"], "I'd like to order a latte, please."));
  assert.ok(sameQuestion('What size would you like?', 'What size would you like today?'));
  assert.ok(!sameQuestion('What size would you like?', 'Would you like it hot or iced?'));
  assert.equal(normalizeAnswer('The Receipt.'), 'receipt');
});

Deno.test('글 규칙: 합니다체와 9.1 금지 표현', () => {
  assert.deepEqual(toneProblems('영어로 다시 답해 주십시오.'), []);
  assert.deepEqual(toneProblems('필요한 표현입니다.'), []);
  assert.ok(toneProblems('영어로 답해 주세요.').length > 0);
  assert.ok(toneProblems('어려우셨죠?').length > 0);
  assert.ok(toneProblems('당신은 할 수 있습니다.').length > 0);
  assert.deepEqual(toneProblems("'주문이 어려워요'라고 쓰셨습니다."), [], '인용은 사용자 말');
  assert.ok(forbiddenJudgment('의지가 약하신 분입니다.').length > 0);
  assert.ok(forbiddenJudgment('원래 끈기가 없으십니다.').length > 0);
  assert.deepEqual(forbiddenJudgment('하루 15분도 못 하셨습니다.'), []);
});

Deno.test('설정: 기본 모델과 상한, 원격에서 AI_FAKE 거부', () => {
  const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
  const c = loadConfig(env({}));
  assert.equal(c.models.main, 'gemini-3.8-flash');
  assert.equal(c.models.light, 'gemini-3.5-flash-lite');
  assert.equal(c.dailyLimit, 150);
  assert.equal(c.goalSetupLimit, 30);
  assert.equal(loadConfig(env({ AI_FAKE: '1', SUPABASE_URL: 'http://kong:8000' })).fake, true);
  assert.throws(() => loadConfig(env({ AI_FAKE: '1', SUPABASE_URL: 'https://abc.supabase.co' })), HttpError);
});

const req = { model: 'm', tier: 'main' as const, system: 's', input: 'i', schema: GRADE_SCHEMA, maxOutputTokens: 100, promptId: 'p', context: null };

Deno.test('Gemini 전송: Interactions 요청 모양과 응답 파싱', async () => {
  let sent: Record<string, unknown> = {};
  const fetchFn = ((_url: string | URL | Request, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(
      JSON.stringify({
        status: 'completed',
        steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'text', text: '{"correct":true,' }, { type: 'text', text: '"feedback":"맞았습니다."}' }] }],
        usage: { total_input_tokens: 10, total_output_tokens: 5, total_thought_tokens: 3, total_tokens: 18 },
      }),
      { status: 200 },
    ));
  }) as typeof fetch;
  const r = await geminiTransport('k', fetchFn)(req);
  assert.equal(r.text, '{"correct":true,"feedback":"맞았습니다."}');
  assert.equal(r.inputTokens, 10);
  assert.equal(r.outputTokens, 8);
  assert.equal(sent.store, false);
  assert.deepEqual((sent.response_format as Record<string, unknown>).mime_type, 'application/json');
  assert.equal((sent.generation_config as Record<string, unknown>).thinking_level, 'low');
  assert.equal(extractText({ output_text: 'x' }), 'x');
});

Deno.test('Gemini 전송: 5xx는 재시도 대상, 4xx는 아님, 20초 초과는 timeout', async () => {
  const status = (n: number) => (() => Promise.resolve(new Response('err', { status: n }))) as unknown as typeof fetch;
  await assert.rejects(geminiTransport('k', status(503))(req), (e) => e instanceof TransportError && e.kind === 'retryable');
  await assert.rejects(geminiTransport('k', status(400))(req), (e) => e instanceof TransportError && e.kind === 'fatal');
  const hang = ((_u: unknown, init?: RequestInit) =>
    new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
  await assert.rejects(geminiTransport('k', hang, 20)(req), (e) => e instanceof TransportError && e.kind === 'timeout');
});

function aiWith(transport: Transport, usage: Omit<UsageRow, 'user_id' | 'day'>[]) {
  return createAi({ config: { ...config, fake: false, apiKey: 'k' }, transport, record: (r) => Promise.resolve(void usage.push(r)) });
}

const gradeReq = (check?: (v: { correct: boolean; feedback: string }) => string[]) => ({
  fn: 'review-quiz',
  promptId: 'quiz-grade',
  promptVersion: 'v1',
  tier: 'light' as const,
  system: 's',
  input: 'i',
  schema: GRADE_SCHEMA,
  context: null,
  check,
});

Deno.test('createAi: 네트워크 오류 1회는 재시도해서 성공하고, 호출마다 사용량을 남긴다', async () => {
  const usage: Omit<UsageRow, 'user_id' | 'day'>[] = [];
  let n = 0;
  const t: Transport = () => {
    n++;
    if (n === 1) return Promise.reject(new TransportError('retryable', 'reset'));
    return Promise.resolve({ text: '{"correct":true,"feedback":"맞았습니다."}', inputTokens: 1, outputTokens: 1 });
  };
  const v = await aiWith(t, usage).generate(gradeReq());
  assert.equal(v.correct, true);
  assert.equal(n, 2);
  assert.deepEqual(usage.map((u) => u.ok), [false, true]);
  assert.equal(usage[1].model, 'test-light');
  assert.equal(usage[1].prompt_version, 'v1');
});

Deno.test('createAi: 빈 출력과 깨진 JSON은 성공이 아니다. 1회 재요청 뒤 ai_failed', async () => {
  const usage: Omit<UsageRow, 'user_id' | 'day'>[] = [];
  const outs = ['', '{not json'];
  const t: Transport = () => Promise.resolve({ text: outs.shift() ?? '', inputTokens: 0, outputTokens: 0 });
  await assert.rejects(aiWith(t, usage).generate(gradeReq()), (e) => e instanceof HttpError && e.code === 'ai_failed');
  assert.equal(usage.length, 2);
  assert.ok(usage.every((u) => !u.ok));
});

Deno.test('createAi: 내용 검사 실패면 문제를 적어 1회 재요청한다', async () => {
  const inputs: string[] = [];
  const outs = ['{"correct":true,"feedback":"맞았어요."}', '{"correct":true,"feedback":"맞았습니다."}'];
  const t: Transport = (r) => {
    inputs.push(r.input);
    return Promise.resolve({ text: outs.shift()!, inputTokens: 0, outputTokens: 0 });
  };
  const v = await aiWith(t, []).generate(gradeReq((x) => toneProblems(x.feedback)));
  assert.equal(v.feedback, '맞았습니다.');
  assert.ok(inputs[1].includes('rejected_previous_output'));
});

Deno.test('createAi: timeout은 재시도하지 않고 504 timeout', async () => {
  let n = 0;
  const t: Transport = () => {
    n++;
    return Promise.reject(new TransportError('timeout', 'slow'));
  };
  await assert.rejects(aiWith(t, []).generate(gradeReq()), (e) => e instanceof HttpError && e.code === 'timeout');
  assert.equal(n, 1);
});
