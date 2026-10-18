// POST {goal_id, day, phase: 'A'|'C', action: 'next'} → {question}
// POST {goal_id, day, phase, action: 'grade', question_id, answer, aided} → {correct, feedback, answer_en, modal}
// POST {goal_id, day, phase, action: 'skip', question_id} → 같은 모양. 답하지 않고 정답을 본다(틀림으로 센다).
// 첫 오답은 정답을 감추고(answer_en '', 상황 적용 문항만 설명 카드) 한 번 더 받는다. 두 번째 오답이나 skip이면 정답을 보인다.
// 문항과 채점은 messages에 meta로 남긴다. 다시 열면 채점 안 된 마지막 문항을 그대로 돌려준다.
import { aiFor, dayField, loadSession, MAX_TEXT, type Session, stamps, uuidField } from '../_shared/context.ts';
import { QUIZ_COPY } from '../_shared/copy.ts';
import { HttpError } from '../_shared/errors.ts';
import type { Ai } from '../_shared/gemini.ts';
import {
  buildGradeInput,
  buildQuestionInput,
  GRADE_SCHEMA,
  GRADE_SYSTEM,
  type GradeContext,
  type GradeOutput,
  PROMPT_VERSION,
  QUESTION_SCHEMA,
  QUESTION_SYSTEM,
  type QuestionContext,
  type QuestionOutput,
  type QuizItem,
} from '../_shared/prompts/review-quiz.ts';
import { addStudyDays, nextSrs, phaseBounds, questionCount, quizTypeAt, type QuizType, typeForItem } from '../_shared/rules.ts';
import type { Ctx } from '../_shared/server.ts';
import { charCount, hasHangul, itemAppearsIn, normalizeAnswer, toneProblems } from '../_shared/text.ts';
import type { ItemRow, MessageRow } from '../_shared/types.ts';
import { uuidv5 } from '../_shared/uuid.ts';

export const FN = 'review-quiz';

export type QuizMeta = {
  index: number;
  type: QuizType;
  item_id: string | null;
  level_check: boolean;
  choices?: string[];
  answer_index?: number;
  answer_en: string;
};

export type Question = {
  id: string;
  index: number;
  type: QuizType;
  prompt: string;
  choices?: string[];
  item_id: string | null;
  level_check: boolean;
};

export type ModalInfo = { kind: 'word' | 'expression'; en: string; ko: string; note: string } | null;
export type GradeResponse = { correct: boolean; feedback: string; answer_en: string; modal: ModalInfo };

function phaseField(body: Record<string, unknown>): 'A' | 'C' {
  if (body.phase !== 'A' && body.phase !== 'C') throw new HttpError('invalid', 'phase');
  return body.phase;
}

export async function handle(ctx: Ctx, body: Record<string, unknown>): Promise<{ question: Question } | GradeResponse> {
  const goalId = uuidField(body, 'goal_id');
  const dayKey = dayField(body);
  const phase = phaseField(body);
  const s = await loadSession(ctx, goalId, dayKey);
  if (body.action === 'next') return { question: await next(ctx, s, phase) };
  if (body.action === 'grade') {
    const questionId = uuidField(body, 'question_id');
    const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
    if (!answer || answer.length > MAX_TEXT) throw new HttpError('invalid', 'answer');
    return grade(ctx, s, phase, questionId, answer, body.aided === true);
  }
  if (body.action === 'skip') return grade(ctx, s, phase, uuidField(body, 'question_id'), null, false);
  throw new HttpError('invalid', 'action');
}

const quizOf = (m: MessageRow) => m.meta?.quiz as QuizMeta | undefined;
type GradeMeta = { question_id: string; attempt: number; correct: boolean; answer_en: string; modal: ModalInfo; revealed?: boolean; skipped?: boolean };
const gradeOf = (m: MessageRow) => m.meta?.quiz_grade as GradeMeta | undefined;
/** 정답을 보인 채점인지. revealed가 없는 옛 기록은 늘 정답을 보였다. */
const revealedOf = (g: GradeMeta) => g.correct || (g.revealed ?? true);

function toQuestion(m: MessageRow): Question {
  const q = quizOf(m)!;
  return { id: m.id, index: q.index, type: q.type, prompt: m.text, ...(q.choices ? { choices: q.choices } : {}), item_id: q.item_id, level_check: q.level_check };
}

const quizItem = (i: ItemRow): QuizItem => ({ kind: i.kind, base: i.base, ko: i.ko ?? '', note: i.note ?? '' });

/** 그 단계의 복습 대상. A: 지난 학습일 항목(복습일이 된 것 먼저), C: 오늘 배운 항목. */
export function reviewPool(items: ItemRow[], phase: 'A' | 'C', today: string): ItemRow[] {
  if (phase === 'C') return items.filter((i) => i.first_day === today && i.state !== 'seen');
  const past = items.filter((i) => i.first_day !== null && i.first_day < today && i.state !== 'recalled' && i.state !== 'seen');
  const due = past.filter((i) => i.next_due_day !== null && i.next_due_day <= today);
  const sortDue = (a: ItemRow, b: ItemRow) => (a.next_due_day! < b.next_due_day! ? -1 : a.next_due_day! > b.next_due_day! ? 1 : a.srs_step - b.srs_step);
  if (due.length) return due.sort(sortDue);
  return past.sort((a, b) => ((a.first_day ?? '') > (b.first_day ?? '') ? -1 : 1));
}

/** 문항 유형에 맞는 항목을 고르고, 항목에 맞게 유형을 고친다. */
export function pickItem(pool: ItemRow[], planned: QuizType, asked: Set<string>, index: number): { item: ItemRow | null; type: QuizType } {
  if (pool.length === 0) return { item: null, type: 'situation' };
  const want = planned === 'word_recall' ? 'word' : planned === 'expression_recall' ? 'expression' : null;
  const fresh = pool.filter((i) => !asked.has(i.id));
  const base = fresh.length ? fresh : pool;
  const preferred = want ? base.filter((i) => i.kind === want) : [];
  const item = preferred[0] ?? (fresh.length ? fresh[0] : pool[index % pool.length]);
  let type = typeForItem(planned, item.unaided_streak);
  if (type === 'word_recall' && item.kind === 'expression') type = 'expression_recall';
  if (type === 'expression_recall' && item.kind === 'word') type = 'word_recall';
  return { item, type };
}

export function checkQuestion(r: QuestionOutput, c: QuestionContext): string[] {
  const e: string[] = [];
  if (c.type === 'situation') {
    if (!r.partner_line.trim() || hasHangul(r.partner_line)) e.push('partner_line은 영어 한 줄입니다');
    if (!r.partner_line.trim().endsWith('?')) e.push('partner_line은 질문으로 끝납니다');
    if (c.item && itemAppearsIn(c.item.kind, c.item.base, r.partner_line)) e.push('partner_line에 정답 항목이 들어갔습니다');
    if (!r.model_answer.trim() || hasHangul(r.model_answer)) e.push('model_answer는 영어입니다');
    if (c.item && !itemAppearsIn(c.item.kind, c.item.base, r.model_answer)) e.push('model_answer에 항목이 들어가야 합니다');
  } else {
    if (r.choices.length !== 4) e.push('choices는 4개입니다');
    if (new Set(r.choices.map((x) => x.trim())).size !== r.choices.length) e.push('choices가 겹칩니다');
    if (r.choices.some((x) => !hasHangul(x))) e.push('choices는 한국어 뜻입니다');
    if (r.answer_index < 0 || r.answer_index > 3) e.push('answer_index는 0~3입니다');
  }
  return e;
}

function runQuestion(ai: Ai, c: QuestionContext): Promise<QuestionOutput> {
  return ai.generate<QuestionOutput>({
    fn: FN,
    promptId: 'quiz-question',
    promptVersion: PROMPT_VERSION,
    tier: 'light',
    system: QUESTION_SYSTEM,
    input: buildQuestionInput(c),
    schema: QUESTION_SCHEMA,
    context: c,
    check: (r) => checkQuestion(r, c),
  });
}

export function checkGrade(r: GradeOutput): string[] {
  const e: string[] = [];
  if (!r.feedback.trim() || !hasHangul(r.feedback)) e.push('feedback은 한국어입니다');
  if (charCount(r.feedback) > 200) e.push('feedback은 한두 문장입니다');
  for (const p of toneProblems(r.feedback)) e.push(`feedback 말투: ${p}`);
  return e;
}

/** 채점. 뜻 선택과 정확히 같은 단어는 코드로, 한국어 답은 오답으로, 나머지는 LIGHT 모델로. */
export async function gradeAnswer(
  getAi: () => Promise<Ai>,
  q: { type: QuizType; choices?: string[]; answer_index?: number; answer_en: string; prompt: string; item: QuizItem | null },
  answer: string,
): Promise<{ correct: boolean; feedback: string }> {
  const verdict = (correct: boolean) => ({ correct, feedback: correct ? QUIZ_COPY.correct : QUIZ_COPY.wrong(q.answer_en) });
  if (q.type === 'meaning_choice') {
    const right = q.choices?.[q.answer_index ?? -1];
    const correct = answer === right || answer === String(q.answer_index);
    // 뜻 선택의 정답은 영어 항목이 아니라 고를 수 있었던 한국어 뜻이다
    return { correct, feedback: correct ? QUIZ_COPY.correct : QUIZ_COPY.wrong(right ?? q.answer_en) };
  }
  if (hasHangul(answer)) return { correct: false, feedback: QUIZ_COPY.koreanAnswer(q.answer_en) };
  if (q.type === 'word_recall' && normalizeAnswer(answer) === normalizeAnswer(q.answer_en)) return verdict(true);
  const c: GradeContext = { type: q.type, item: q.item, prompt: q.prompt, modelAnswer: q.answer_en, answer };
  return (await getAi()).generate<GradeOutput>({
    fn: FN,
    promptId: 'quiz-grade',
    promptVersion: PROMPT_VERSION,
    tier: 'light',
    system: GRADE_SYSTEM,
    input: buildGradeInput(c),
    schema: GRADE_SCHEMA,
    context: c,
    check: checkGrade,
  });
}

async function next(ctx: Ctx, s: Session, phase: 'A' | 'C'): Promise<Question> {
  const msgs = await ctx.repo.listMessages({ userId: ctx.userId, goalId: s.goal.id, phases: [phase], day: s.today });
  const questions = msgs.filter((m) => m.role === 'coach' && quizOf(m));
  const graded = new Set(msgs.map((m) => gradeOf(m)?.question_id).filter((x): x is string => !!x));
  const last = questions.at(-1);
  if (last && !graded.has(last.id)) return toQuestion(last);

  const index = questions.length;
  const items = await ctx.repo.listItems(s.goal.id);
  const levelCheck = phase === 'A' && !items.some((i) => i.first_day !== null && i.first_day < s.today);
  const b = phaseBounds(s.day.target_minutes ?? s.goal.target_minutes);
  const count = questionCount(phase === 'A' ? b.aEnd : b.total - b.bEnd);
  const planned = quizTypeAt(phase, count, index, { levelCheck });
  const asked = new Set(questions.map((m) => quizOf(m)!.item_id).filter((x): x is string => !!x));
  const { item, type } = levelCheck ? { item: null, type: 'situation' as const } : pickItem(reviewPool(items, phase, s.today), planned, asked, index);

  let prompt: string;
  const meta: QuizMeta = { index, type, item_id: item?.id ?? null, level_check: levelCheck, answer_en: item?.base ?? '' };
  if (type === 'word_recall' && item) prompt = QUIZ_COPY.wordRecall(item.ko ?? '');
  else if (type === 'expression_recall' && item) prompt = QUIZ_COPY.expressionRecall(item.ko ?? '');
  else {
    const qtype = type === 'meaning_choice' && item ? 'meaning_choice' : 'situation';
    const ai = await aiFor(ctx, s.profile);
    const recentQuestions = questions.slice(-3).map((m) => m.text);
    const situation = s.goal.situation;
    if (!situation) throw new HttpError('invalid', 'goal has no situation');
    const out = await runQuestion(ai, { type: qtype, phase, levelCheck, situation, item: item ? quizItem(item) : null, recentQuestions });
    if (qtype === 'meaning_choice' && item) {
      prompt = QUIZ_COPY.meaningChoice(item.base);
      meta.choices = out.choices.map((x) => x.trim());
      meta.answer_index = out.answer_index;
      meta.answer_en = item.base;
    } else {
      meta.type = 'situation';
      prompt = item ? QUIZ_COPY.situationWithItem(out.partner_line.trim(), item.ko ?? '') : QUIZ_COPY.situationLevel(out.partner_line.trim());
      meta.answer_en = out.model_answer.trim();
    }
  }
  const id = await uuidv5(`${s.goal.id}:${s.today}:${phase}:q:${index}`);
  await ctx.repo.insertMessages([
    { id, user_id: ctx.userId, goal_id: s.goal.id, day: s.today, phase, role: 'coach', text: prompt, meta: { quiz: meta }, created_at: new Date(ctx.now()).toISOString() },
  ]);
  const [stored] = await ctx.repo.getMessages([id]);
  return toQuestion(stored);
}

/** answer가 null이면 skip(정답 보기). */
async function grade(ctx: Ctx, s: Session, phase: 'A' | 'C', questionId: string, answer: string | null, aidedIn: boolean): Promise<GradeResponse> {
  const [qm] = await ctx.repo.getMessages([questionId]);
  const q = qm && quizOf(qm);
  if (!qm || !q || qm.user_id !== ctx.userId || qm.goal_id !== s.goal.id || qm.day !== s.today || qm.phase !== phase) {
    throw new HttpError('not_found', 'question');
  }
  const msgs = await ctx.repo.listMessages({ userId: ctx.userId, goalId: s.goal.id, phases: [phase], day: s.today });
  const grades = msgs.filter((m) => gradeOf(m)?.question_id === questionId);
  const answers = msgs.filter((m) => (m.meta?.quiz_answer as { question_id?: string } | undefined)?.question_id === questionId);
  const lastGrade = grades.at(-1);
  // 같은 답으로 다시 오면 재요청이다. 정답을 보였거나 두 번 시도한 문항은 마지막 채점을 돌려준다(결정안 12: 첫 오답 뒤 한 번 더).
  if (lastGrade) {
    const g = gradeOf(lastGrade)!;
    if (revealedOf(g) || grades.length >= 2 || (answer !== null && answers.at(-1)?.text === answer)) {
      return { correct: g.correct, feedback: lastGrade.text, answer_en: g.answer_en, modal: g.modal };
    }
  }
  const attempt = grades.length + 1;
  const aided = attempt > 1 ? true : aidedIn;

  const items = q.item_id ? await ctx.repo.listItems(s.goal.id) : [];
  const item = q.item_id ? items.find((i) => i.id === q.item_id) ?? null : null;
  let ai: Ai | null = null;
  const getAi = async () => (ai ??= await aiFor(ctx, s.profile));
  const quiz = { type: q.type, choices: q.choices, answer_index: q.answer_index, answer_en: q.answer_en, prompt: qm.text, item: item ? quizItem(item) : null };
  const result = answer === null
    ? { correct: false, feedback: QUIZ_COPY.wrong(q.type === 'meaning_choice' ? (q.choices?.[q.answer_index ?? -1] ?? q.answer_en) : q.answer_en) }
    : await gradeAnswer(getAi, quiz, answer);
  const fullModal: ModalInfo = item ? { kind: item.kind, en: item.base, ko: item.ko ?? '', note: item.note ?? '' } : null;
  const revealed = result.correct || answer === null || attempt >= 2;
  // 첫 오답: 정답과 채점 설명(정답이 들어 있을 수 있다)을 감춘다. 상황 적용 문항의 설명 카드는 빈칸 틀이라 힌트로 준다.
  const hint = q.type === 'situation' ? fullModal : null;
  const shown = revealed
    ? { feedback: result.feedback, answer_en: q.answer_en, modal: fullModal }
    : {
      feedback: answer !== null && q.type !== 'meaning_choice' && hasHangul(answer) ? QUIZ_COPY.koreanRetry : QUIZ_COPY.retry(!!hint),
      answer_en: '',
      modal: hint,
    };

  const [tA, tG] = stamps(ctx.now(), 2);
  const base = { user_id: ctx.userId, goal_id: s.goal.id, day: s.today, phase };
  const rows: MessageRow[] = [];
  if (answer !== null) {
    rows.push({ ...base, id: await uuidv5(`${questionId}:answer:${attempt}`), role: 'user', text: answer, meta: { quiz_answer: { question_id: questionId, attempt, aided } }, created_at: tA });
  }
  const gradeMeta: GradeMeta = { question_id: questionId, attempt, correct: result.correct, answer_en: shown.answer_en, modal: shown.modal, revealed, ...(answer === null ? { skipped: true } : {}) };
  rows.push({ ...base, id: await uuidv5(`${questionId}:grade:${attempt}`), role: 'coach', text: shown.feedback, meta: { quiz_grade: gradeMeta }, created_at: tG });
  await ctx.repo.insertMessages(rows);

  // 첫 오답 뒤 skip은 이미 기록한 첫 시도 말고 새 기록을 남기지 않는다.
  if (item && !q.level_check && (answer !== null || attempt === 1)) {
    await ctx.repo.insertItemEvents([
      {
        id: await uuidv5(`${questionId}:quiz:${attempt}`),
        user_id: ctx.userId,
        item_id: item.id,
        day: s.today,
        phase,
        kind: 'quiz',
        aided,
        correct: result.correct,
        question_type: q.type,
      },
    ]);
    // 복습 간격은 A(지난 항목)의 첫 시도로만 바꾼다. C는 당일 확인이라 장기 기억으로 치지 않는다(기획서 11.6).
    if (phase === 'A' && attempt === 1) {
      const n = nextSrs({ srsStep: item.srs_step, unaidedStreak: item.unaided_streak }, { correct: result.correct, aided });
      await ctx.repo.updateItem(item.id, {
        srs_step: n.srsStep,
        unaided_streak: n.unaidedStreak,
        next_due_day: n.recalled ? null : addStudyDays(s.today, n.intervalDays, s.goal.weekdays),
        ...(n.recalled ? { state: 'recalled' as const } : {}),
      });
    }
  }
  return { correct: result.correct, ...shown };
}
