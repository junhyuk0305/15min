// AI 학습 평가 (MP 7.1). `npm run eval` = deno run -A evals/run.ts
// 함수와 같은 프롬프트 모듈, 같은 Gemini 호출기, 같은 서버 규칙을 DB 없이 부른다(회고만 메모리 DB로 핸들러를 돌린다).
// 코드로 잴 수 있는 기준은 코드로 재고, 언어 판단이 필요한 것만 판정 모델(evals/judge/*.md)을 부른다.
//
// 모드
// - GEMINI_API_KEY 있음: 실제 평가. evals/report.md, evals/sample-for-human.md. 합격선 하나라도 못 넘으면 종료 코드 1.
// - AI_FAKE=1: 하네스 자체 점검. 고정 응답이라 품질 결과가 아니다. evals/report.selftest.md, evals/sample-for-human.selftest.md.
// - 둘 다 없음: 평가를 돌리지 않았다는 보고서를 쓰고 종료 코드 1.
import { DEFAULT_MODEL_LIGHT, DEFAULT_MODEL_MAIN, type Config } from '../supabase/functions/_shared/config.ts';
import { RETRO_Q1, RETRO_Q2 } from '../supabase/functions/_shared/copy.ts';
import { type AttemptEvent, createAi, fakeTransport, geminiTransport, type Transport } from '../supabase/functions/_shared/gemini.ts';
import { MemoryRepo } from '../supabase/functions/_shared/memory.ts';
import { PROMPT_VERSION as GOAL_V } from '../supabase/functions/_shared/prompts/goal-setup.ts';
import { PROMPT_VERSION as LESSON_V, type TurnContext } from '../supabase/functions/_shared/prompts/lesson-turn.ts';
import { PROMPT_VERSION as REFLECTION_V, type ReflectionRecords } from '../supabase/functions/_shared/prompts/reflection.ts';
import { PROMPT_VERSION as RETRO_V } from '../supabase/functions/_shared/prompts/retro.ts';
import { PROMPT_VERSION as QUIZ_V, type QuizItem } from '../supabase/functions/_shared/prompts/review-quiz.ts';
import type { QuizType } from '../supabase/functions/_shared/rules.ts';
import type { Ctx } from '../supabase/functions/_shared/server.ts';
import { forbiddenJudgment, hasHangul, leaksFullAnswer, sameQuestion } from '../supabase/functions/_shared/text.ts';
import type { Message } from '../supabase/functions/_shared/types.ts';
import { S } from '../supabase/functions/_shared/validate.ts';
import { missingFields, runGoalSetup } from '../supabase/functions/goal-setup/handler.ts';
import { type FinalTurn, modalTexts, runTurn } from '../supabase/functions/lesson-turn/core.ts';
import { runReflection } from '../supabase/functions/reflection/handler.ts';
import { handle as retroHandle } from '../supabase/functions/retro/handler.ts';
import { gradeAnswer } from '../supabase/functions/review-quiz/handler.ts';

const here = (p: string) => new URL(p, import.meta.url);
const readJson = async <T>(p: string): Promise<T> => JSON.parse(await Deno.readTextFile(here(p))) as T;
const nowIso = () => new Date().toISOString();

const FAKE = Deno.env.get('AI_FAKE') === '1';
const API_KEY = Deno.env.get('GEMINI_API_KEY') || null;
const OUT = FAKE
  ? { report: here('./report.selftest.md'), sample: here('./sample-for-human.selftest.md') }
  : { report: here('./report.md'), sample: here('./sample-for-human.md') };

const config: Config = {
  fake: FAKE,
  apiKey: API_KEY,
  models: { main: Deno.env.get('AI_MODEL_MAIN') || DEFAULT_MODEL_MAIN, light: Deno.env.get('AI_MODEL_LIGHT') || DEFAULT_MODEL_LIGHT },
  dailyLimit: 1_000_000,
  goalSetupLimit: 1_000_000,
  globalDailyLimit: 1_000_000,
};

// ---------- 평가를 못 돌리는 경우 ----------

if (!FAKE && !API_KEY) {
  const why = 'GEMINI_API_KEY가 환경에 없다. 실제 모델을 부르지 못해서 평가를 돌리지 않았다.';
  const body = `# AI 학습 평가 보고서

**평가 미실행.** ${why}

- 시각: ${nowIso()}
- 합격 여부: 판정 없음. 이 상태로는 출시 기준(MP 7.1-2)을 통과했다고 볼 수 없다.
- 돌리는 법: \`GEMINI_API_KEY=<키> npm run eval\`. 모델을 바꾸려면 \`AI_MODEL_MAIN\`, \`AI_MODEL_LIGHT\`를 같이 넣는다.
- 하네스만 확인하려면 \`AI_FAKE=1 npm run eval\`. 결과는 \`evals/report.selftest.md\`에 따로 쓰고 품질 결과가 아니다.
`;
  await Deno.writeTextFile(OUT.report, body);
  await Deno.writeTextFile(OUT.sample, `# 사람이 볼 평가 표본\n\n**평가 미실행.** ${why}\n`);
  console.error(`eval NOT RUN: ${why}`);
  Deno.exit(1);
}

// ---------- 호출기와 측정 ----------

const attempts: AttemptEvent[] = [];
let transportFailures = 0;
const base: Transport = FAKE ? fakeTransport : geminiTransport(API_KEY!);
const counted: Transport = async (r) => {
  try {
    return await base(r);
  } catch (e) {
    transportFailures++;
    throw e;
  }
};
const noMeter = { reserve: () => Promise.resolve(0), finish: () => Promise.resolve() };
const ai = createAi({ config, transport: counted, meter: noMeter, observe: (e) => attempts.push(e) });
const judgeAi = createAi({ config, transport: base, meter: noMeter });

type Latency = { fn: string; ms: number };
const latencies: Latency[] = [];
type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

/** 함수 호출 하나를 재고, 모델을 불렀을 때만 응답 시간에 넣는다. */
async function timed<T>(fn: string, f: () => Promise<T>): Promise<Outcome<T>> {
  const before = attempts.length;
  const t0 = performance.now();
  try {
    const value = await f();
    if (attempts.length > before) latencies.push({ fn, ms: performance.now() - t0 });
    return { ok: true, value };
  } catch (e) {
    if (attempts.length > before) latencies.push({ fn, ms: performance.now() - t0 });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const JUDGE_SYSTEM = 'You are a strict, fair evaluator for an English learning app. Follow the rule given in the input. Output JSON only.';
const JUDGE_SCHEMA = S.obj({ violation: S.bool(), reason: S.str() });
const judgeTemplates = new Map<string, string>();
let judgeFailures = 0;

/** 판정 모델. 실패하면 위반으로 친다(통과를 증명하지 못했다). */
async function judge(name: string, vars: Record<string, string>): Promise<{ violation: boolean; reason: string }> {
  if (!judgeTemplates.has(name)) judgeTemplates.set(name, await Deno.readTextFile(here(`./judge/${name}.md`)));
  const input = judgeTemplates.get(name)!.replace(/<!--[\s\S]*?-->\s*/, '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  try {
    return await judgeAi.generate<{ violation: boolean; reason: string }>({
      fn: 'eval-judge',
      promptId: 'judge',
      promptVersion: name,
      tier: 'main',
      system: JUDGE_SYSTEM,
      input,
      schema: JUDGE_SCHEMA,
      context: vars,
    });
  } catch (e) {
    judgeFailures++;
    return { violation: true, reason: `judge failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await f(items[k]);
      }
    }),
  );
  return out;
}

type Sample = { fn: string; id: string; input: unknown; output: unknown };
const samples: Sample[] = [];
const failures: { fn: string; id: string; why: string }[] = [];
const CONCURRENCY = 3;

// ---------- lesson-turn ----------

type LessonCases = {
  situations: Record<string, { scene: TurnContext['situation']; subsituations: string[] }>;
  cases: { id: string; situation: string; type: 'correct' | 'short' | 'wrong' | 'korean' | 'escape'; cursor: number; partner: string; user: string }[];
};

async function evalLesson() {
  const data = await readJson<LessonCases>('./cases/lesson-turn.json');
  const rows = await pool(data.cases, CONCURRENCY, async (c) => {
    const sit = data.situations[c.situation];
    const ctx: TurnContext = {
      situation: sit.scene,
      subsituations: sit.subsituations,
      cursor: c.cursor,
      knownItems: [],
      budget: { expressions: 3, words: 3 },
      dialogue: [{ role: 'partner', text: c.partner }],
      previousPartner: c.partner,
      koreanDetected: hasHangul(c.user),
      learnerText: c.user,
    };
    const r = await timed('lesson-turn', () => runTurn(ai, ctx));
    samples.push({ fn: 'lesson-turn', id: c.id, input: { partner: c.partner, learner: c.user }, output: r.ok ? r.value : { error: r.error } });
    if (!r.ok) {
      failures.push({ fn: 'lesson-turn', id: c.id, why: `호출 실패: ${r.error}` });
      return { c, r: null as FinalTurn | null, leak: false, repeat: false, redirectOk: false };
    }
    const v = r.value;
    let leak = false;
    if (v.coach_modal) {
      const shown = modalTexts(v.coach_modal, v.coach_note);
      leak = leaksFullAnswer(shown, v.hidden_correction);
      if (!leak) leak = (await judge('lesson-leak', { partner: c.partner, learner: c.user, shown: shown.join('\n') })).violation;
    }
    let repeat = false;
    if (v.verdict === 'needs_correction') {
      repeat = sameQuestion(v.partner, c.partner) || (await judge('lesson-repeat', { previous: c.partner, partner: v.partner })).violation;
    }
    let redirectOk = false;
    if (c.type === 'escape') {
      const j = await judge('lesson-redirect', { scene: JSON.stringify(sit.scene), learner: c.user, partner: v.partner });
      redirectOk = v.verdict === 'off_topic' && !j.violation;
      if (!redirectOk) failures.push({ fn: 'lesson-turn', id: c.id, why: `되돌리지 못함 (verdict ${v.verdict}; ${j.reason})` });
    }
    return { c, r: v, leak, repeat, redirectOk };
  });

  const of = (t: string) => rows.filter((x) => x.c.type === t);
  const shortBad = of('short').filter((x) => x.r && x.r.verdict !== 'natural');
  const wrongBad = of('wrong').filter((x) => !x.r || x.r.verdict !== 'needs_correction' || !x.r.coach_modal);
  const modalBad = rows.filter((x) => x.r?.coach_modal && (x.r.coach_modal.words.length > 2 || x.leak));
  const hangulBad = rows.filter((x) => x.r && hasHangul(x.r.partner));
  const repeatBad = rows.filter((x) => x.repeat);
  for (const x of shortBad) failures.push({ fn: 'lesson-turn', id: x.c.id, why: `짧지만 맞는 답을 ${x.r!.verdict}로 판정` });
  for (const x of wrongBad) failures.push({ fn: 'lesson-turn', id: x.c.id, why: `틀린 답을 교정하지 않음 (${x.r?.verdict ?? '호출 실패'})` });
  for (const x of modalBad) failures.push({ fn: 'lesson-turn', id: x.c.id, why: '모달 규칙 위반(단어 3개 이상 또는 완성 답안 노출)' });
  for (const x of hangulBad) failures.push({ fn: 'lesson-turn', id: x.c.id, why: '상대 대사에 한국어' });
  for (const x of repeatBad) failures.push({ fn: 'lesson-turn', id: x.c.id, why: '교정 뒤 같은 질문 반복' });

  const correctOk = of('correct').filter((x) => x.r?.verdict === 'natural').length;
  const koreanOk = of('korean').filter((x) => x.r?.verdict === 'not_english' && !!x.r.coach_note).length;
  const escapeOk = of('escape').filter((x) => x.redirectOk).length;
  const wrongN = of('wrong').length;
  return {
    gates: [
      gate('lesson-turn', '짧지만 맞는 답을 오답 처리', '0건', `${shortBad.length}건 / ${of('short').length}`, shortBad.length === 0),
      gate('lesson-turn', '틀린 답을 교정하지 않음', '5% 이하', `${pct(wrongBad.length, wrongN)} (${wrongBad.length}/${wrongN})`, wrongBad.length / wrongN <= 0.05),
      gate('lesson-turn', '모달 규칙 위반(표현 2개 이상, 단어 3개 이상, 완성 답안 노출)', '0건', `${modalBad.length}건 / 모달 ${rows.filter((x) => x.r?.coach_modal).length}`, modalBad.length === 0),
      gate('lesson-turn', '상대 대사에 한국어', '0건', `${hangulBad.length}건 / ${rows.filter((x) => x.r).length}`, hangulBad.length === 0),
      gate('lesson-turn', '교정 뒤 같은 질문 반복', '0건', `${repeatBad.length}건 / 교정 ${rows.filter((x) => x.r?.verdict === 'needs_correction').length}`, repeatBad.length === 0),
    ],
    info: [
      `맞는 답을 교정 없이 넘김: ${correctOk}/${of('correct').length}`,
      `한국어 섞인 답에 영어로 답하라는 코치 안내: ${koreanOk}/${of('korean').length}`,
      `역할 이탈 시도를 장면 안으로 되돌림(off_topic + 판정 모델): ${escapeOk}/${of('escape').length}`,
      `호출 실패(ai_failed, timeout): ${rows.filter((x) => !x.r).length}/${rows.length}`,
    ],
  };
}

// ---------- goal-setup ----------

type GoalCases = { fallback: string; maxTurns: number; cases: { id: string; answers: string[] }[] };

async function evalGoalSetup() {
  const data = await readJson<GoalCases>('./cases/goal-setup.json');
  const rows = await pool(data.cases, CONCURRENCY, async (c) => {
    const messages: { role: 'user' | 'coach'; text: string }[] = [];
    let k = 0;
    for (let turn = 1; turn <= data.maxTurns; turn++) {
      const r = await timed('goal-setup', () => runGoalSetup(ai, { messages: [...messages] }));
      if (!r.ok) {
        failures.push({ fn: 'goal-setup', id: c.id, why: `${turn}턴 호출 실패: ${r.error}` });
        samples.push({ fn: 'goal-setup', id: c.id, input: messages, output: { error: r.error } });
        return { id: c.id, ok: false, turns: turn };
      }
      if (r.value.done) {
        const f = { reason: null, place: null, my_role: null, partner: null, task: null, goal_name: null, ...r.value.fields };
        const ok = missingFields(f).length === 0;
        samples.push({ fn: 'goal-setup', id: c.id, input: messages, output: r.value });
        if (!ok) failures.push({ fn: 'goal-setup', id: c.id, why: `done인데 빈 항목: ${missingFields(f).join(', ')}` });
        return { id: c.id, ok, turns: turn };
      }
      messages.push({ role: 'coach', text: r.value.reply }, { role: 'user', text: c.answers[k++] ?? data.fallback });
    }
    failures.push({ fn: 'goal-setup', id: c.id, why: `${data.maxTurns}턴 안에 끝나지 않음` });
    samples.push({ fn: 'goal-setup', id: c.id, input: messages, output: 'not done' });
    return { id: c.id, ok: false, turns: data.maxTurns };
  });
  const ok = rows.filter((r) => r.ok);
  const avgTurns = ok.length ? (ok.reduce((a, r) => a + r.turns, 0) / ok.length).toFixed(1) : '-';
  return {
    gates: [gate('goal-setup', '10턴 안에 필수 필드를 다 채움', '90% 이상', `${pct(ok.length, rows.length)} (${ok.length}/${rows.length})`, ok.length / rows.length >= 0.9)],
    info: [`완료까지 평균 턴: ${avgTurns}`],
  };
}

// ---------- review-quiz ----------

type QuizCases = {
  cases: { id: string; type: QuizType; item: QuizItem | null; prompt: string; choices?: string[]; answer_index?: number; answer_en: string; answer: string; expected: boolean }[];
};

async function evalQuiz() {
  const data = await readJson<QuizCases>('./cases/review-quiz.json');
  const rows = await pool(data.cases, CONCURRENCY, async (c) => {
    const q = { type: c.type, choices: c.choices, answer_index: c.answer_index, answer_en: c.answer_en, prompt: c.prompt, item: c.item };
    const r = await timed('review-quiz', () => gradeAnswer(() => Promise.resolve(ai), q, c.answer));
    samples.push({ fn: 'review-quiz', id: c.id, input: { type: c.type, answer: c.answer, expected: c.expected }, output: r.ok ? r.value : { error: r.error } });
    const match = r.ok && r.value.correct === c.expected;
    if (!match) failures.push({ fn: 'review-quiz', id: c.id, why: r.ok ? `기대 ${c.expected}, 채점 ${r.value.correct}` : `호출 실패: ${r.error}` });
    return match;
  });
  const n = rows.filter(Boolean).length;
  return { gates: [gate('review-quiz', '채점이 기대 정답과 일치', '95% 이상', `${pct(n, rows.length)} (${n}/${rows.length})`, n / rows.length >= 0.95)], info: [] as string[] };
}

// ---------- retro (메모리 DB로 핸들러 실행) ----------

type RetroCases = { cases: { id: string; todayItems: { kind: 'word' | 'expression'; base: string; ko: string }[]; answers: string[] }[] };

async function evalRetro() {
  const data = await readJson<RetroCases>('./cases/retro.json');
  const USER = '11111111-1111-4111-8111-111111111111';
  const GOAL = '33333333-3333-4333-8333-333333333333';
  const DAY = '2026-10-20';
  const rows = await pool(data.cases, CONCURRENCY, async (c) => {
    const repo = new MemoryRepo({
      profiles: [{ user_id: USER, suspended_until: null, suspended_goal_id: null, suspended_start_minutes: null, suspended_target_minutes: null, banned: false, giveup_confirmed_count: 0 }],
      goals: [{
        id: GOAL, user_id: USER, name: 'g', reason: '평가용 목표 이유입니다. 스무 자를 넘깁니다.', period_days: 14, weekdays: [0, 1, 2, 3, 4, 5, 6],
        start_minutes: 1190, target_minutes: 15, situation: { place: '카페', my_role: '손님', partner: '직원', task: '주문' }, subsituations: ['주문'],
        first_day: '2026-10-18', status: 'active', created_at: '2026-10-17T00:00:00Z',
      }],
      days: [{
        goal_id: GOAL, day: DAY, user_id: USER, status: 'progress', today_reason: null, phase: 'retro', target_minutes: 15,
        session_started_at: '2026-10-20T10:40:00Z', active_seconds: 900, retro_started_at: '2026-10-20T10:58:00Z', retro_seconds: 0, completed_at: null,
      }],
      items: c.todayItems.map((it, i) => ({
        id: `00000000-0000-4000-8000-00000000000${i}`, user_id: USER, goal_id: GOAL, kind: it.kind, base: it.base, ko: it.ko, note: null,
        state: 'taught' as const, srs_step: 0, next_due_day: '2026-10-21', unaided_streak: 0, first_day: DAY, created_at: '2026-10-20T10:50:00Z',
      })),
    });
    let clock = Date.parse('2026-10-20T11:00:00Z');
    const ctx = (): Ctx => ({ repo, config, transport: counted, now: () => (clock += 20_000), observe: (e) => attempts.push(e), userId: USER });
    const problems: string[] = [];
    const call = (message?: { id: string; text: string }) =>
      timed('retro', () => retroHandle(ctx(), { goal_id: GOAL, day: DAY, ...(message ? { message } : {}) }) as Promise<{ messages: Message[] }>);
    const first = await call();
    if (!first.ok) problems.push(`시작 실패: ${first.error}`);
    else if (first.value.messages.map((m) => m.text).join('|') !== RETRO_Q1) problems.push('첫 메시지가 고정 질문 1이 아님');
    for (let i = 0; i < c.answers.length && first.ok; i++) {
      const r = await call({ id: crypto.randomUUID(), text: c.answers[i] });
      if (!r.ok) {
        problems.push(`${i + 1}번 답 처리 실패: ${r.error}`);
        break;
      }
      const replies = r.value.messages.filter((m) => m.role === 'coach').map((m) => m.text);
      if (i === 0) {
        if (replies.length !== 2 || replies[1] !== RETRO_Q2) problems.push('1번 답 뒤 고정 질문 2가 오지 않음');
        if (replies[0]?.includes('?')) problems.push('1번 답 뒤 반응에 질문이 섞임');
      } else {
        if (replies.length !== 1 || !replies[0].trim().endsWith('?')) problems.push(`${i + 1}번 답 뒤 후속 질문이 하나가 아님`);
        if (replies.some((t) => sameQuestion(t, RETRO_Q1) || sameQuestion(t, RETRO_Q2))) problems.push('고정 질문을 다시 물음');
      }
      if (replies.some((t) => hasHangul(t))) problems.push('회고 응답에 한국어');
    }
    const all = await repo.listMessages({ userId: USER, goalId: GOAL, phases: ['retro'], day: DAY });
    const coach = all.filter((m) => m.role === 'coach').map((m) => m.text);
    if (coach.filter((t) => t === RETRO_Q1).length !== 1 || coach.filter((t) => t === RETRO_Q2).length !== 1) problems.push('고정 질문이 한 번씩이 아님');
    if (coach.indexOf(RETRO_Q1) > coach.indexOf(RETRO_Q2)) problems.push('질문 순서가 바뀜');
    samples.push({ fn: 'retro', id: c.id, input: c.answers, output: all.map((m) => `${m.role}: ${m.text}`) });
    for (const p of problems) failures.push({ fn: 'retro', id: c.id, why: p });
    return problems.length === 0;
  });
  const n = rows.filter(Boolean).length;
  return { gates: [gate('retro', '질문 2개 순서 준수', '100%', `${pct(n, rows.length)} (${n}/${rows.length})`, n === rows.length)], info: [] as string[] };
}

// ---------- reflection ----------

type ReflectionCases = { cases: { id: string; records: ReflectionRecords; userLines: string[] }[] };

async function evalReflection() {
  const data = await readJson<ReflectionCases>('./cases/reflection.json');
  let replies = 0;
  const rows = await pool(data.cases, CONCURRENCY, async (c) => {
    const conversation: { role: 'coach' | 'user'; text: string }[] = [];
    let bad = 0;
    const lines = [null, ...c.userLines];
    for (const line of lines) {
      if (line) conversation.push({ role: 'user', text: line });
      const r = await timed('reflection', () => runReflection(ai, { records: c.records, conversation: [...conversation] }));
      if (!r.ok) {
        failures.push({ fn: 'reflection', id: c.id, why: `호출 실패: ${r.error}` });
        break;
      }
      replies++;
      const reply = r.value.reply;
      conversation.push({ role: 'coach', text: reply });
      const code = forbiddenJudgment(reply);
      const j = code.length ? { violation: true, reason: `code: ${code.join(', ')}` } : await judge('reflection-forbidden', { user: line ?? '(first message)', reply });
      if (j.violation) {
        bad++;
        failures.push({ fn: 'reflection', id: c.id, why: `9.1 금지 표현: ${j.reason} / "${reply}"` });
      }
    }
    samples.push({ fn: 'reflection', id: c.id, input: c.userLines, output: conversation });
    return bad;
  });
  const bad = rows.reduce((a, b) => a + b, 0);
  return { gates: [gate('reflection', '9.1 금지 표현(성격, 의지 단정)', '0건', `${bad}건 / 응답 ${replies}`, bad === 0)], info: [] as string[] };
}

// ---------- 보고서 ----------

type Gate = { fn: string; criterion: string; threshold: string; result: string; pass: boolean };
function gate(fn: string, criterion: string, threshold: string, result: string, pass: boolean): Gate {
  return { fn, criterion, threshold, result, pass };
}
function pct(a: number, b: number): string {
  return b === 0 ? '-' : `${((a / b) * 100).toFixed(1)}%`;
}
function p95(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * 0.95) - 1)];
}

function seededShuffle<T>(xs: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const started = performance.now();
const startedAt = nowIso();
const parts = [];
for (const [name, f] of [['lesson-turn', evalLesson], ['goal-setup', evalGoalSetup], ['review-quiz', evalQuiz], ['retro', evalRetro], ['reflection', evalReflection]] as const) {
  console.info(`eval ${name} ...`);
  parts.push(await f());
}

const totalAttempts = attempts.length + transportFailures;
const schemaOk = attempts.filter((a) => a.schemaOk).length;
const lat = latencies.map((l) => l.ms);
const overall = [
  gate('전체', '구조화 출력 검증 통과', '99% 이상', `${pct(schemaOk, totalAttempts)} (${schemaOk}/${totalAttempts} 호출)`, totalAttempts > 0 && schemaOk / totalAttempts >= 0.99),
  gate('전체', '응답 시간 p95', '6초 이하', `${(p95(lat) / 1000).toFixed(2)}초 (${lat.length}건)`, p95(lat) <= 6000),
];
const gates = [...parts.flatMap((p) => p.gates), ...overall];
const allPass = gates.every((g) => g.pass);
const reRequests = attempts.filter((a) => a.attempt === 2).length;

const title = FAKE ? '# AI 학습 평가: 하네스 자체 점검 (AI_FAKE=1)' : '# AI 학습 평가 보고서';
const banner = FAKE
  ? '> 이 결과는 품질 결과가 아니다. 모델 대신 고정 응답(`supabase/functions/_shared/fake.ts`)과 항상 통과하는 판정을 썼다. 하네스가 처음부터 끝까지 돌고 표를 쓰는지만 확인한다. 출시 판단에 쓰지 않는다.\n'
  : `> 종합: **${allPass ? '합격' : '불합격'}**. 합격선은 MP 7.1-2 표 그대로다. 하나라도 못 넘으면 출시하지 않는다.\n`;

const report = `${title}

${banner}
- 시작: ${startedAt}, 걸린 시간 ${((performance.now() - started) / 1000).toFixed(1)}초
- 모델: MAIN \`${FAKE ? 'fake' : config.models.main}\`, LIGHT \`${FAKE ? 'fake' : config.models.light}\`, 판정 \`${FAKE ? 'fake' : config.models.main}\`
- 프롬프트: ${[LESSON_V, GOAL_V, QUIZ_V, RETRO_V, REFLECTION_V].map((v) => `\`${v}\``).join(', ')}
- 모델 호출 ${totalAttempts}회(재요청 ${reRequests}회, 전송 실패 ${transportFailures}회), 판정 모델 실패 ${judgeFailures}회(위반으로 셈)

## 합격선

| 함수 | 기준 | 합격선 | 결과 | 판정 |
|---|---|---|---|---|
${gates.map((g) => `| ${g.fn} | ${g.criterion} | ${g.threshold} | ${g.result} | ${g.pass ? '통과' : '실패'} |`).join('\n')}

## 참고 지표 (합격선 없음)

${parts.flatMap((p) => p.info).map((s) => `- ${s}`).join('\n')}
- 함수별 응답 시간 p95: ${[...new Set(latencies.map((l) => l.fn))].map((fn) => `${fn} ${(p95(latencies.filter((l) => l.fn === fn).map((l) => l.ms)) / 1000).toFixed(2)}초`).join(', ')}

## 측정 방법

- 코드로 잰 것: 판정(verdict) 값, 모달 단어 수, 상대 대사의 한글, 완성 답안 노출(모델이 따로 낸 교정 문장이 화면 글에 들어갔는지), 같은 질문 반복(낱말 겹침 0.7 이상), 목표 설정 필드, 채점 일치, 회고 질문 순서, 9.1 금지 표현 정규식, 스키마 통과, 응답 시간.
- 판정 모델로 잰 것(evals/judge/): 완성 답안 노출(코드가 못 잡은 것), 교정 뒤 같은 질문, 역할 이탈 되돌림, 9.1 금지 표현(코드가 못 잡은 것).
- 서버 규칙(상한 자르기, 단어 2개 자르기, 한국어 답 고정)을 입힌 최종 출력을 잰다. 사용자가 보는 것과 같다.
- 구조화 출력 통과율은 모델 호출 1회마다 JSON 파싱과 스키마 검사를 본다. 내용 규칙 위반으로 재요청한 것은 스키마 통과로 센다.
- 응답 시간은 함수 호출 하나(재요청 포함) 기준이고, 모델을 부르지 않은 채점(코드 채점)은 뺀다. 동시 ${CONCURRENCY}건으로 돌렸다.

## 실패 사례

${failures.length ? failures.slice(0, 60).map((f) => `- ${f.fn} \`${f.id}\`: ${f.why.replace(/\n/g, ' ')}`).join('\n') : '- 없음'}
`;

await Deno.writeTextFile(OUT.report, report);

const pick = seededShuffle(samples, 20261018).slice(0, 20);
const sample = `# 사람이 볼 평가 표본${FAKE ? ' (하네스 자체 점검, AI_FAKE=1)' : ''}

${FAKE ? '> 고정 응답이라 품질을 볼 자료가 아니다. 모양만 확인한다.\n' : '> 무작위 20건(시드 20261018). 코치 말투, 교정 내용, 상대 대사의 자연스러움을 훑어본다.\n'}
- 생성: ${nowIso()}

${pick
  .map((s, i) => `## ${i + 1}. ${s.fn} / ${s.id}\n\n입력\n\n\`\`\`json\n${JSON.stringify(s.input, null, 2)}\n\`\`\`\n\n출력\n\n\`\`\`json\n${JSON.stringify(s.output, null, 2)}\n\`\`\`\n`)
  .join('\n')}`;
await Deno.writeTextFile(OUT.sample, sample);

console.info(`${FAKE ? 'harness self-test' : 'eval'} done: ${gates.filter((g) => g.pass).length}/${gates.length} gates pass -> ${OUT.report.pathname}`);
if (!FAKE && !allPass) Deno.exit(1);
