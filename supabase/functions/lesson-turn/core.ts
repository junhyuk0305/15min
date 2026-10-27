// lesson-turn의 모델 호출과 서버 규칙. 핸들러와 평가(evals)가 같은 함수를 쓴다.
import { COACH_COPY } from '../_shared/copy.ts';
import type { Ai } from '../_shared/gemini.ts';
import {
  buildHintInput,
  buildOpeningInput,
  buildTurnInput,
  buildVariantInput,
  type CoachModal,
  type Feedback,
  HINT_PROMPT_VERSION,
  HINT_SCHEMA,
  HINT_SYSTEM,
  type HintContext,
  type HintOutput,
  OPENING_SCHEMA,
  OPENING_SYSTEM,
  type OpeningContext,
  type OpeningOutput,
  PROMPT_VERSION,
  SYSTEM,
  TURN_SCHEMA,
  type TurnContext,
  type TurnOutput,
  VARIANT_SCHEMA,
  VARIANT_SYSTEM,
  type VariantContext,
  type VariantOutput,
} from '../_shared/prompts/lesson-turn.ts';
import { charCount, hasHangul, itemAppearsIn, leaksFullAnswer, normalizeBase, sameQuestion, toneProblems } from '../_shared/text.ts';

export const FN = 'lesson-turn';

export const NOT_ENGLISH_NOTE = COACH_COPY.notEnglish;
export const MAX_PARTNER_CHARS = 400;

export type FinalTurn = TurnOutput & { trimmed: string[]; feedback: Feedback | null };

function isKnown(c: Pick<TurnContext, 'knownItems'>, kind: 'word' | 'expression', en: string): boolean {
  const b = normalizeBase(kind, en).toLowerCase();
  return c.knownItems.some((i) => i.kind === kind && i.state !== 'seen' && i.base.toLowerCase() === b);
}

/**
 * 모델 출력에 서버 규칙을 입힌다.
 * - 한글이 섞인 답은 not_english로 고정(코드로 확실히 안다).
 * - natural, not_english, off_topic이면 모달을 없앤다.
 * - 단어는 2개까지. 하루 새 항목 상한을 넘는 새 항목은 잘라낸다.
 * - subsituation_done은 교정 없이(natural) 답했을 때만.
 */
export function finalizeTurn(raw: TurnOutput, c: TurnContext): FinalTurn {
  const out: FinalTurn = { ...raw, trimmed: [], feedback: null };
  if (c.koreanDetected) out.verdict = 'not_english';
  if (out.verdict !== 'needs_correction') {
    out.coach_modal = null;
    out.hidden_correction = null;
  }
  if (out.verdict === 'natural') out.coach_note = null;
  if (out.verdict === 'not_english' && (!out.coach_note || !hasHangul(out.coach_note))) out.coach_note = NOT_ENGLISH_NOTE;
  if (out.verdict !== 'natural') out.subsituation_done = false;

  const target = out.coach_modal?.expression?.en;
  if (out.verdict === 'needs_correction' && target) {
    const key = normalizeBase('expression', target).toLowerCase();
    const taught = c.knownItems.some((i) => i.kind === 'expression'
      && i.state !== undefined && i.state !== 'seen'
      && normalizeBase('expression', i.base).toLowerCase() === key);
    const supported = c.previousFeedback
      && normalizeBase('expression', c.previousFeedback.target).toLowerCase() === key;
    out.feedback = { target: normalizeBase('expression', target), stage: taught && !supported ? 'cue' : 'pattern' };
    if (out.feedback.stage === 'cue') out.coach_modal = null;
  }

  if (out.coach_modal) {
    const b = applyBudget(out.coach_modal, c);
    out.coach_modal = b.modal;
    out.trimmed.push(...b.trimmed);
  }
  // 새 표현 상한으로 패턴을 못 보여 주면 구체적인 단서로 이어 간다.
  if (out.feedback && !out.coach_modal?.expression) out.feedback.stage = 'cue';
  return out;
}

/** 모달에 하루 새 항목 상한을 입힌다. 단어는 2개까지. 상한을 넘는 새 항목은 잘라 trimmed에 남긴다. 교정과 힌트가 같이 쓴다. */
function applyBudget(m: CoachModal, c: Pick<TurnContext, 'knownItems' | 'budget'>): { modal: CoachModal | null; trimmed: string[] } {
  const trimmed: string[] = [];
  let exprLeft = c.budget.expressions;
  let wordsLeft = c.budget.words;
  let expression = m.expression;
  if (expression && !isKnown(c, 'expression', expression.en)) {
    if (exprLeft <= 0) {
      trimmed.push(`expression:${expression.en}`);
      expression = null;
    } else exprLeft--;
  }
  const words = [];
  for (const w of m.words.slice(0, 2)) {
    if (isKnown(c, 'word', w.en)) words.push(w);
    else if (wordsLeft > 0) {
      words.push(w);
      wordsLeft--;
    } else trimmed.push(`word:${w.en}`);
  }
  for (const w of m.words.slice(2)) trimmed.push(`word:${w.en}`);
  return { modal: expression || words.length ? { expression, words } : null, trimmed };
}

export type FinalHint = HintOutput & { trimmed: string[] };

/** 힌트 출력에 교정과 같은 상한 규칙을 입힌다. 새 표현이 잘리면 coach_note(쉬운 풀어 쓰기)만 남는다. */
export function finalizeHint(raw: HintOutput, c: HintContext): FinalHint {
  if (!raw.coach_modal) return { ...raw, trimmed: [] };
  const b = applyBudget(raw.coach_modal, c);
  return { coach_modal: b.modal, coach_note: raw.coach_note, trimmed: b.trimmed };
}

/** 다시 요청해야 하는 힌트 위반. */
export function checkHint(raw: HintOutput, c: HintContext): string[] {
  const e: string[] = [];
  if (!raw.coach_note.trim() || !hasHangul(raw.coach_note)) e.push('coach_note는 한국어 한 문장입니다');
  for (const p of toneProblems(raw.coach_note)) e.push(`coach_note 말투: ${p}`);
  const m = raw.coach_modal;
  if (!m?.expression && c.budget.expressions > 0) e.push('새 표현을 가르칠 수 있으면 coach_modal.expression이 하나 있어야 합니다');
  if (m?.expression) {
    if (hasHangul(m.expression.en) || !m.expression.en.trim()) e.push('expression.en은 영어 패턴입니다');
    if (!hasHangul(m.expression.ko)) e.push('expression.ko는 한국어 뜻입니다');
    for (const p of toneProblems(m.expression.note)) e.push(`expression.note 말투: ${p}`);
  }
  for (const w of m?.words ?? []) {
    if (hasHangul(w.en) || !w.en.trim()) e.push('words.en은 영어 낱말입니다');
    if (!hasHangul(w.ko)) e.push('words.ko는 한국어 뜻입니다');
    for (const p of toneProblems(w.note)) e.push(`word.note 말투: ${p}`);
  }
  return e;
}

export async function runHint(ai: Ai, c: HintContext): Promise<FinalHint> {
  const raw = await ai.generate<HintOutput>({
    fn: FN,
    promptId: 'lesson-hint',
    promptVersion: HINT_PROMPT_VERSION,
    tier: 'main',
    system: HINT_SYSTEM,
    input: buildHintInput(c),
    schema: HINT_SCHEMA,
    context: c,
    check: (r) => checkHint(r, c),
  });
  return finalizeHint(raw, c);
}

/** 모달에서 화면에 보이는 글. */
export function modalTexts(m: CoachModal | null, note: string | null): string[] {
  const out: string[] = [];
  if (m?.expression) out.push(m.expression.en, m.expression.ko, m.expression.note);
  for (const w of m?.words ?? []) out.push(w.en, w.ko, w.note);
  if (note) out.push(note);
  return out;
}

/** 다시 요청해야 하는 위반. raw는 상한 자르기 전, f는 서버 규칙을 입힌 뒤. */
export function checkTurn(raw: TurnOutput, f: FinalTurn, c: TurnContext): string[] {
  const e: string[] = [];
  if (!f.partner.trim()) e.push('partner가 비었습니다');
  if (hasHangul(f.partner)) e.push('partner에 한국어가 있습니다. 영어만 씁니다');
  if (charCount(f.partner) > MAX_PARTNER_CHARS) e.push('partner가 너무 깁니다');
  if (f.coach_note) for (const p of toneProblems(f.coach_note)) e.push(`coach_note 말투: ${p}`);
  if (f.verdict === 'needs_correction') {
    if (!raw.coach_modal?.expression) e.push('needs_correction에는 coach_modal.expression이 하나 있어야 합니다');
    if (!raw.hidden_correction?.trim()) e.push('needs_correction에는 hidden_correction이 있어야 합니다');
    if (f.feedback?.stage === 'cue' && (!f.coach_note?.trim() || !hasHangul(f.coach_note))) {
      e.push('단서 단계에는 카드 없이도 이해되는 한국어 coach_note가 있어야 합니다');
    }
    if (f.feedback?.stage === 'cue' && itemAppearsIn('expression', f.feedback.target, f.coach_note ?? '')) {
      e.push('단서 단계 coach_note에 목표 패턴을 주지 않습니다. 오류 위치와 규칙만 짚습니다');
    }
    const m = raw.coach_modal;
    if (m?.expression) {
      if (hasHangul(m.expression.en) || !m.expression.en.trim()) e.push('expression.en은 영어 패턴입니다');
      if (!hasHangul(m.expression.ko)) e.push('expression.ko는 한국어 뜻입니다');
      for (const p of toneProblems(m.expression.note)) e.push(`expression.note 말투: ${p}`);
    }
    for (const w of m?.words ?? []) {
      if (hasHangul(w.en) || !w.en.trim()) e.push('words.en은 영어 낱말입니다');
      if (!hasHangul(w.ko)) e.push('words.ko는 한국어 뜻입니다');
      for (const p of toneProblems(w.note)) e.push(`word.note 말투: ${p}`);
    }
    if (leaksFullAnswer([...modalTexts(raw.coach_modal, raw.coach_note), f.partner], raw.hidden_correction)) {
      e.push('모달, 코치 안내 또는 상대 대사에 교정된 문장 전체가 들어갔습니다. 패턴만 가르칩니다');
    }
    if (c.previousPartner && sameQuestion(f.partner, c.previousPartner)) {
      e.push('교정 뒤 같은 질문을 반복했습니다. 말투와 내용이 다른 새 질문을 씁니다');
    }
  }
  return e;
}

export async function runTurn(ai: Ai, c: TurnContext): Promise<FinalTurn> {
  const raw = await ai.generate<TurnOutput>({
    fn: FN,
    promptId: 'lesson-turn',
    promptVersion: PROMPT_VERSION,
    tier: 'main',
    system: SYSTEM,
    input: buildTurnInput(c),
    schema: TURN_SCHEMA,
    context: c,
    check: (r) => checkTurn(r, finalizeTurn(r, c), c),
  });
  return finalizeTurn(raw, c);
}

export function checkEnglishLine(s: string, what: string): string[] {
  const e: string[] = [];
  if (!s.trim()) e.push(`${what}가 비었습니다`);
  if (hasHangul(s)) e.push(`${what}에 한국어가 있습니다. 영어만 씁니다`);
  if (charCount(s) > MAX_PARTNER_CHARS) e.push(`${what}가 너무 깁니다`);
  return e;
}

export function runOpening(ai: Ai, c: OpeningContext): Promise<OpeningOutput> {
  return ai.generate<OpeningOutput>({
    fn: FN,
    promptId: 'lesson-opening',
    promptVersion: PROMPT_VERSION,
    tier: 'main',
    system: OPENING_SYSTEM,
    input: buildOpeningInput(c),
    schema: OPENING_SCHEMA,
    context: c,
    check: (r) => checkEnglishLine(r.partner, 'partner'),
  });
}

export function checkVariant(r: VariantOutput): string[] {
  const e = checkEnglishLine(r.opening, 'opening');
  const seen = new Set<string>();
  for (const s of r.subsituations) {
    if (!hasHangul(s) || charCount(s) > 20) e.push(`하위 상황 이름은 짧은 한국어입니다: ${s}`);
    if (seen.has(s)) e.push(`하위 상황이 겹칩니다: ${s}`);
    seen.add(s);
  }
  return e;
}

export function runVariant(ai: Ai, c: VariantContext): Promise<VariantOutput> {
  return ai.generate<VariantOutput>({
    fn: FN,
    promptId: 'lesson-variant',
    promptVersion: PROMPT_VERSION,
    tier: 'main',
    system: VARIANT_SYSTEM,
    input: buildVariantInput(c),
    schema: VARIANT_SCHEMA,
    context: c,
    check: checkVariant,
  });
}
