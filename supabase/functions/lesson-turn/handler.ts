// POST {goal_id, day, message?: {id, text}} → {messages, modal, episode} (명세 4절 lesson-turn)
// message 없음: B 시작. 오늘 B 대화가 있으면 그대로 돌려주고(이어 보기), 없으면 되짚기 + 첫 질문을 만든다.
// message 있음: 한 턴. 같은 message.id로 다시 오면 모델을 다시 부르지 않고 저장된 응답을 돌려준다.
// hint: true: 막혔을 때 표현 보기. 마지막 상대 질문에 답할 표현 하나를 코치 줄로 저장한다. 상대 줄은 만들지 않는다.
import { aiFor, assertOwnMessage, dayField, loadSession, messageField, type Session, stamps, uuidField } from '../_shared/context.ts';
import { HttpError } from '../_shared/errors.ts';
import type { Ai } from '../_shared/gemini.ts';
import type { CoachModal, DialogueLine, Feedback, Verdict } from '../_shared/prompts/lesson-turn.ts';
import { addStudyDays, newItemCap } from '../_shared/rules.ts';
import type { Ctx } from '../_shared/server.ts';
import { hasHangul, itemAppearsIn, normalizeBase } from '../_shared/text.ts';
import { type EpisodeRow, type ItemEventRow, type ItemRow, type Message, type MessageRow, toMessage } from '../_shared/types.ts';
import { replyId, uuidv5 } from '../_shared/uuid.ts';
import { runHint, runOpening, runTurn, runVariant } from './core.ts';

export type EpisodeState = { index: number; cursor: number; total: number; finished: boolean };
export type LessonResponse = { messages: Message[]; modal: CoachModal | null; episode: EpisodeState };

const DIALOGUE_LINES = 12;
const RESUME_LINES = 6;

function situationOf(s: Session) {
  const sit = s.goal.situation;
  if (!sit) throw new HttpError('invalid', 'goal has no situation');
  return sit;
}

function episodeState(e: EpisodeRow, finished = !!e.finished_at): EpisodeState {
  return { index: e.index, cursor: e.cursor, total: e.subsituations.length, finished };
}

function toLine(m: MessageRow): DialogueLine | null {
  if (m.role === 'user') return { role: 'learner', text: m.text };
  if (m.role === 'partner') return { role: 'partner', text: m.text };
  if (m.role === 'coach') {
    const modal = m.meta?.modal as CoachModal | undefined;
    const taught = modal?.expression ? ` (taught: ${modal.expression.en})` : '';
    return m.text || taught ? { role: 'coach', text: `${m.text}${taught}`.trim() } : null;
  }
  return null;
}

/** 열린 에피소드. 없으면 첫 에피소드를 만들거나(목표의 하위 상황), 지난번 실패한 변형 생성을 다시 한다. */
async function openEpisode(ctx: Ctx, s: Session, getAi: () => Promise<Ai>): Promise<{ ep: EpisodeRow; opening?: string }> {
  const open = await ctx.repo.getOpenEpisode(s.goal.id);
  if (open) return { ep: open };
  const all = await ctx.repo.listEpisodes(s.goal.id);
  if (all.length === 0) {
    const subs = s.goal.subsituations ?? [];
    if (subs.length === 0) throw new HttpError('invalid', 'goal has no subsituations');
    const ep: EpisodeRow = { goal_id: s.goal.id, index: 0, user_id: ctx.userId, subsituations: subs, cursor: 0, finished_at: null };
    await ctx.repo.insertEpisode(ep);
    return { ep };
  }
  const v = await runVariant(await getAi(), { situation: situationOf(s), previous: all.map((e) => e.subsituations), nextIndex: all.length });
  const ep: EpisodeRow = { goal_id: s.goal.id, index: all.length, user_id: ctx.userId, subsituations: v.subsituations, cursor: 0, finished_at: null };
  await ctx.repo.insertEpisode(ep);
  return { ep: (await ctx.repo.getOpenEpisode(s.goal.id)) ?? ep, opening: v.opening };
}

export async function handle(ctx: Ctx, body: Record<string, unknown>): Promise<LessonResponse> {
  const goalId = uuidField(body, 'goal_id');
  const dayKey = dayField(body);
  const msg = messageField(body);
  const wantHint = body.hint !== undefined;
  if (wantHint && (body.hint !== true || msg)) throw new HttpError('invalid', 'hint');
  const s = await loadSession(ctx, goalId, dayKey);
  let ai: Ai | null = null;
  const getAi = async () => (ai ??= await aiFor(ctx, s.profile));
  if (wantHint) return await hint(ctx, s, getAi);
  return msg ? await turn(ctx, s, msg, getAi) : await start(ctx, s, getAi);
}

/** 하루 새 항목 상한(rules.ts newItemCap)에서 오늘 이미 가르친 만큼 뺀 남은 수. 교정과 힌트가 같이 쓴다. */
function todayBudget(s: Session, items: ItemRow[]) {
  const cap = newItemCap(s.day.target_minutes ?? s.goal.target_minutes);
  const newToday = (kind: 'word' | 'expression') => items.filter((i) => i.kind === kind && i.first_day === s.today && i.state !== 'seen').length;
  return { expressions: Math.max(0, cap - newToday('expression')), words: Math.max(0, cap - newToday('word')) };
}

/**
 * 표현 보기. 오늘 B의 마지막 상대 질문에 답할 표현 하나를 코치 모달과 같은 모양으로 준다.
 * 상대 질문마다 한 번만 모델을 부른다. id를 그 상대 줄에서 만들어 같은 질문에 다시 누르면 저장된 줄을 돌려준다.
 * 새 항목은 교정과 같은 하루 상한을 따르고, 가르친 항목은 교정과 같이 taught로 기록한다.
 */
async function hint(ctx: Ctx, s: Session, getAi: () => Promise<Ai>): Promise<LessonResponse> {
  const todayRows = await ctx.repo.listMessages({ userId: ctx.userId, goalId: s.goal.id, phases: ['B'], day: s.today });
  const partner = todayRows.findLast((m) => m.role === 'partner');
  if (!partner) throw new HttpError('invalid', 'no partner question');
  const { ep } = await openEpisode(ctx, s, getAi);
  const id = await uuidv5(`${partner.id}:hint`);
  const [stored] = await ctx.repo.getMessages([id]);
  if (stored) return { messages: [toMessage(stored)], modal: (stored.meta?.modal as CoachModal | null) ?? null, episode: episodeState(ep) };

  const items = await ctx.repo.listItems(s.goal.id);
  const result = await runHint(await getAi(), {
    situation: situationOf(s),
    subsituations: ep.subsituations,
    cursor: ep.cursor,
    knownItems: items.map((i) => ({ kind: i.kind, base: i.base, state: i.state })),
    budget: todayBudget(s, items),
    dialogue: todayRows.slice(-DIALOGUE_LINES).map(toLine).filter((l) => l !== null),
    partnerQuestion: partner.text,
  });
  const row: MessageRow = {
    id,
    user_id: ctx.userId,
    goal_id: s.goal.id,
    day: s.today,
    phase: 'B',
    role: 'coach',
    text: result.coach_note,
    meta: { hint: true, modal: result.coach_modal, ...(result.trimmed.length ? { trimmed: result.trimmed } : {}) },
    // 상대 줄 바로 뒤에 놓이도록 그 시각보다 앞서지 않게 한다
    created_at: new Date(Math.max(ctx.now(), Date.parse(partner.created_at) + 1)).toISOString(),
  };
  await ctx.repo.insertMessages([row]);
  // 학습자 글이 없으니 used, seen은 생기지 않고 모달 항목의 taught만 남는다
  await recordItems(ctx, s, items, { id, text: '' }, result.coach_modal, '', new Set(), 'needs_correction');
  // 동시에 두 번 눌렀으면 먼저 저장된 줄을 돌려준다
  const saved = (await ctx.repo.getMessages([id]))[0] ?? row;
  return { messages: [toMessage(saved)], modal: (saved.meta?.modal as CoachModal | null) ?? null, episode: episodeState(ep) };
}

async function start(ctx: Ctx, s: Session, getAi: () => Promise<Ai>): Promise<LessonResponse> {
  const q = { userId: ctx.userId, goalId: s.goal.id, phases: ['B' as const] };
  const today = await ctx.repo.listMessages({ ...q, day: s.today });
  const { ep, opening: variantOpening } = await openEpisode(ctx, s, getAi);
  if (today.length > 0 && !variantOpening) {
    return { messages: today.map(toMessage), modal: null, episode: episodeState(ep) };
  }
  let partner = variantOpening;
  if (!partner) {
    const resume = (await ctx.repo.listMessages({ ...q, beforeDay: s.today, limit: RESUME_LINES })).map(toLine).filter((l) => l !== null);
    partner = (await runOpening(await getAi(), { situation: situationOf(s), subsituations: ep.subsituations, cursor: ep.cursor, resume })).partner;
  }
  const id = await uuidv5(`${s.goal.id}:${s.today}:B:opening:${ep.index}`);
  const row: MessageRow = {
    id,
    user_id: ctx.userId,
    goal_id: s.goal.id,
    day: s.today,
    phase: 'B',
    role: 'partner',
    text: partner,
    meta: { opening: true, episode_index: ep.index, cursor: ep.cursor },
    created_at: new Date(ctx.now()).toISOString(),
  };
  await ctx.repo.insertMessages([row]);
  const all = await ctx.repo.listMessages({ ...q, day: s.today });
  return { messages: all.map(toMessage), modal: null, episode: episodeState(ep) };
}

/** 직전 2턴의 모달, 단서, 상대 대사에 노출된 항목(도움 후 적용 판정용). */
function recentSupportKeys(before: MessageRow[], items: ItemRow[]): Set<string> {
  const keys = new Set<string>();
  let users = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const m = before[i];
    if (m.role === 'user' && ++users >= 2) break;
    const modal = m.role === 'coach' ? (m.meta?.modal as CoachModal | undefined) : undefined;
    if (modal?.expression) keys.add(`expression:${normalizeBase('expression', modal.expression.en).toLowerCase()}`);
    for (const w of modal?.words ?? []) keys.add(`word:${normalizeBase('word', w.en)}`);
    const feedback = (m.role === 'coach' ? m.meta?.feedback : m.role === 'partner' ? m.meta?.pending_feedback : undefined) as Feedback | undefined;
    if (feedback) keys.add(`expression:${normalizeBase('expression', feedback.target).toLowerCase()}`);
    if (m.role === 'partner') {
      for (const item of items) if (itemAppearsIn(item.kind, item.base, m.text)) keys.add(keyOf(item));
    }
  }
  return keys;
}

const keyOf = (i: { kind: string; base: string }) => `${i.kind}:${i.base.toLowerCase()}`;

async function storedResult(ctx: Ctx, ids: { user: string; coach: string; partner: string; partner2: string }, goalId: string) {
  const rows = await ctx.repo.getMessages([ids.user, ids.coach, ids.partner, ids.partner2]);
  const partner = rows.find((r) => r.id === ids.partner);
  if (!partner) return null;
  const order = [ids.user, ids.coach, ids.partner, ids.partner2];
  const messages = order.map((id) => rows.find((r) => r.id === id)).filter((r): r is MessageRow => !!r);
  const coach = rows.find((r) => r.id === ids.coach);
  const meta = partner.meta as { episode_index?: number; cursor?: number; finished?: boolean };
  const eps = await ctx.repo.listEpisodes(goalId);
  const ep = eps.find((e) => e.index === meta.episode_index);
  const episode: EpisodeState = ep
    ? { index: ep.index, cursor: meta.cursor ?? ep.cursor, total: ep.subsituations.length, finished: !!meta.finished }
    : { index: meta.episode_index ?? 0, cursor: meta.cursor ?? 0, total: 0, finished: !!meta.finished };
  return { messages: messages.map(toMessage), modal: (coach?.meta?.modal as CoachModal | null) ?? null, episode };
}

async function turn(ctx: Ctx, s: Session, msg: { id: string; text: string }, getAi: () => Promise<Ai>): Promise<LessonResponse> {
  const ids = {
    user: msg.id,
    coach: await replyId(msg.id, 'coach'),
    partner: await replyId(msg.id, 'partner'),
    partner2: await replyId(msg.id, 'partner2'),
  };
  const [existingUser] = await ctx.repo.getMessages([msg.id]);
  assertOwnMessage(existingUser, ctx, s.goal.id, s.today, 'B');
  const stored = await storedResult(ctx, ids, s.goal.id);
  if (stored) return stored;

  const [tUser, tCoach, tPartner, tPartner2] = stamps(ctx.now(), 4);
  const userRow: MessageRow = existingUser ?? {
    id: msg.id,
    user_id: ctx.userId,
    goal_id: s.goal.id,
    day: s.today,
    phase: 'B',
    role: 'user',
    text: msg.text,
    meta: {},
    created_at: tUser,
  };
  // 사용자 글은 답과 함께 저장한다. 상한이나 모델 실패로 끝나면 아무것도 남지 않고, 같은 id로 다시 보낼 수 있다.

  const todayRows = await ctx.repo.listMessages({ userId: ctx.userId, goalId: s.goal.id, phases: ['B'], day: s.today });
  const before = todayRows.filter((m) => m.id !== msg.id && m.created_at <= userRow.created_at);
  const previousPartner = [...before].reverse().find((m) => m.role === 'partner')?.text ?? null;
  const { ep } = await openEpisode(ctx, s, getAi);
  const lastPartner = [...before].reverse().find((m) => m.role === 'partner');
  // 같은 날, 같은 하위 상황에서만 도움을 이어 간다. 성공/새 에피소드는 초기화한다.
  const previousFeedback = lastPartner?.meta?.episode_index === ep.index && lastPartner?.meta?.cursor === ep.cursor
    ? (lastPartner.meta.pending_feedback as Feedback | undefined) ?? null
    : null;
  const items = await ctx.repo.listItems(s.goal.id);

  const ai = await getAi();
  const result = await runTurn(ai, {
    situation: situationOf(s),
    subsituations: ep.subsituations,
    cursor: ep.cursor,
    knownItems: items.map((i) => ({ kind: i.kind, base: i.base, state: i.state })),
    previousFeedback,
    budget: todayBudget(s, items),
    dialogue: before.slice(-DIALOGUE_LINES).map(toLine).filter((l) => l !== null),
    previousPartner,
    koreanDetected: hasHangul(msg.text),
    learnerText: msg.text,
  });

  // 에피소드 진행: 교정 없이 하위 상황을 끝내면 다음으로. 마지막이면 종료 → 변형 에피소드.
  let cursor = ep.cursor;
  let finished = false;
  if (result.subsituation_done) {
    if (ep.cursor + 1 < ep.subsituations.length) cursor = ep.cursor + 1;
    else finished = true;
  }
  let variant: { subsituations: string[]; opening: string } | null = null;
  if (finished) {
    try {
      const all = await ctx.repo.listEpisodes(s.goal.id);
      variant = await runVariant(ai, { situation: situationOf(s), previous: all.map((e) => e.subsituations), nextIndex: ep.index + 1 });
    } catch (e) {
      // 변형 생성이 실패해도 이번 턴은 돌려준다. 다음 요청의 openEpisode가 다시 만든다.
      console.error('variant failed', e instanceof Error ? e.message : String(e));
    }
  }

  const base = { user_id: ctx.userId, goal_id: s.goal.id, day: s.today, phase: 'B' as const };
  const rows: MessageRow[] = [];
  if (result.coach_modal || result.coach_note) {
    rows.push({
      ...base,
      id: ids.coach,
      role: 'coach',
      text: result.coach_note ?? '',
      meta: { modal: result.coach_modal, verdict: result.verdict, feedback: result.feedback, ...(result.trimmed.length ? { trimmed: result.trimmed } : {}) },
      created_at: tCoach,
    });
  }
  rows.push({
    ...base,
    id: ids.partner,
    role: 'partner',
    text: result.partner,
    meta: {
      verdict: result.verdict, episode_index: ep.index, cursor, finished, subsituation: ep.subsituations[cursor] ?? null,
      pending_feedback: result.verdict === 'natural' ? null : result.feedback ?? previousFeedback,
    },
    created_at: tPartner,
  });
  if (variant) {
    rows.push({
      ...base,
      id: ids.partner2,
      role: 'partner',
      text: variant.opening,
      meta: { opening: true, episode_index: ep.index + 1, cursor: 0 },
      created_at: tPartner2,
    });
  }
  await ctx.repo.insertMessages([userRow, ...rows]);

  if (finished) {
    await ctx.repo.updateEpisode(s.goal.id, ep.index, { cursor, finished_at: new Date(ctx.now()).toISOString() });
    if (variant) {
      await ctx.repo.insertEpisode({ goal_id: s.goal.id, index: ep.index + 1, user_id: ctx.userId, subsituations: variant.subsituations, cursor: 0, finished_at: null });
    }
  } else if (cursor !== ep.cursor) {
    await ctx.repo.updateEpisode(s.goal.id, ep.index, { cursor });
  }

  await recordItems(ctx, s, items, msg, result.coach_modal, result.partner, recentSupportKeys(before, items), result.verdict);

  const out = await storedResult(ctx, ids, s.goal.id);
  if (!out) throw new HttpError('server', 'reply not stored');
  return { ...out, episode: { index: ep.index, cursor, total: ep.subsituations.length, finished } };
}

/** items, item_events 갱신: 모달 항목 taught, 사용자 글에 쓴 항목 used, 상대 대사에 나온 기존 항목 seen. */
async function recordItems(
  ctx: Ctx,
  s: Session,
  items: ItemRow[],
  msg: { id: string; text: string },
  modal: CoachModal | null,
  partnerText: string,
  recentModal: Set<string>,
  verdict: Verdict,
) {
  const day = s.today;
  const nextDue = addStudyDays(day, 1, s.goal.weekdays);
  const events: ItemEventRow[] = [];
  const event = async (item: ItemRow, kind: ItemEventRow['kind'], aided: boolean, idKey: string) =>
    events.push({ id: await uuidv5(idKey), user_id: ctx.userId, item_id: item.id, day, phase: 'B', kind, aided, correct: null, question_type: null });

  const taught: ItemRow[] = [];
  const entries = [
    ...(modal?.expression ? [{ kind: 'expression' as const, e: modal.expression }] : []),
    ...(modal?.words ?? []).map((e) => ({ kind: 'word' as const, e })),
  ];
  const fresh: ItemRow[] = [];
  for (const { kind, e } of entries) {
    const b = normalizeBase(kind, e.en);
    const found = items.find((i) => keyOf(i) === keyOf({ kind, base: b }));
    if (found) {
      if (found.state !== 'recalled') {
        const patch: Partial<ItemRow> = { srs_step: 0, unaided_streak: 0, next_due_day: nextDue, ...(found.state === 'seen' ? { state: 'taught' as const } : {}) };
        await ctx.repo.updateItem(found.id, patch);
        Object.assign(found, patch);
      }
      taught.push(found);
    } else {
      const row: ItemRow = {
        id: await uuidv5(`${s.goal.id}:item:${kind}:${b.toLowerCase()}`),
        user_id: ctx.userId,
        goal_id: s.goal.id,
        kind,
        base: b,
        ko: e.ko,
        note: e.note,
        state: 'taught',
        srs_step: 0,
        next_due_day: nextDue,
        unaided_streak: 0,
        first_day: day,
        created_at: new Date(ctx.now()).toISOString(),
      };
      fresh.push(row);
      taught.push(row);
    }
  }
  await ctx.repo.insertItems(fresh);
  for (const it of taught) await event(it, 'taught', false, `${msg.id}:taught:${it.id}`);

  for (const it of items) {
    if (verdict === 'natural' && itemAppearsIn(it.kind, it.base, msg.text)) {
      await event(it, 'used', recentModal.has(keyOf(it)), `${msg.id}:used:${it.id}`);
      if (it.state === 'seen' || it.state === 'taught') await ctx.repo.updateItem(it.id, { state: 'used' });
    } else if (itemAppearsIn(it.kind, it.base, partnerText)) {
      await event(it, 'seen', false, `${s.goal.id}:${day}:seen:${it.id}`);
    }
  }
  await ctx.repo.insertItemEvents(events);
}
