// POST {goal_id, day, message?: {id, text}} → {messages} (명세 4절 retro)
// 첫 호출: 고정 질문 1. 1번 답 뒤: 짧은 반응 + 고정 질문 2. 2번 답 뒤: 시간이 남는 동안 짧은 후속 질문.
// 고정 질문은 서버 상수라 순서가 코드로 지켜진다. 1번 답에 들어간 항목은 used로 기록한다.
import { aiFor, assertOwnMessage, dayField, loadSession, messageField, type Session, stamps, uuidField } from '../_shared/context.ts';
import { RETRO_Q1, RETRO_Q2 } from '../_shared/copy.ts';
import { HttpError } from '../_shared/errors.ts';
import type { Ai } from '../_shared/gemini.ts';
import { buildInput, PROMPT_VERSION, type RetroContext, type RetroOutput, SCHEMA, SYSTEM } from '../_shared/prompts/retro.ts';
import type { Ctx } from '../_shared/server.ts';
import { charCount, hasHangul, itemAppearsIn, sameQuestion } from '../_shared/text.ts';
import { type Message, type MessageRow, toMessage } from '../_shared/types.ts';
import { replyId, uuidv5 } from '../_shared/uuid.ts';

export const FN = 'retro';
const MAX_REPLY_CHARS = 300;

export function checkRetro(r: RetroOutput, c: RetroContext): string[] {
  const e: string[] = [];
  const t = r.reply.trim();
  if (!t) e.push('reply가 비었습니다');
  if (hasHangul(t)) e.push('reply에 한국어가 있습니다. 영어만 씁니다');
  if (charCount(t) > MAX_REPLY_CHARS) e.push('reply가 너무 깁니다');
  if (c.stage === 'reaction' && t.includes('?')) e.push('reaction에는 질문을 넣지 않습니다');
  if (c.stage === 'follow_up') {
    if (!t.endsWith('?')) e.push('follow_up은 질문 하나로 끝납니다');
    const asked = c.conversation.filter((l) => l.role === 'coach').map((l) => l.text);
    if ([RETRO_Q1, RETRO_Q2, ...asked].some((q) => sameQuestion(t, q))) e.push('앞에서 한 질문을 반복했습니다');
  }
  return e;
}

export function runRetro(ai: Ai, c: RetroContext): Promise<RetroOutput> {
  return ai.generate<RetroOutput>({
    fn: FN,
    promptId: 'retro-reply',
    promptVersion: PROMPT_VERSION,
    tier: 'main',
    system: SYSTEM,
    input: buildInput(c),
    schema: SCHEMA,
    context: c,
    check: (r) => checkRetro(r, c),
  });
}

export async function handle(ctx: Ctx, body: Record<string, unknown>): Promise<{ messages: Message[] }> {
  const goalId = uuidField(body, 'goal_id');
  const dayKey = dayField(body);
  const msg = messageField(body);
  const s = await loadSession(ctx, goalId, dayKey);
  if (!s.day.retro_started_at) throw new HttpError('closed', 'retro not started');
  const q = { userId: ctx.userId, goalId: s.goal.id, phases: ['retro' as const], day: s.today };
  const base = { user_id: ctx.userId, goal_id: s.goal.id, day: s.today, phase: 'retro' as const };
  const q1Id = await uuidv5(`${s.goal.id}:${s.today}:retro:q1`);

  if (!msg) {
    await ctx.repo.insertMessages([{ ...base, id: q1Id, role: 'coach', text: RETRO_Q1, meta: { retro_q: 1 }, created_at: new Date(ctx.now()).toISOString() }]);
    return { messages: (await ctx.repo.listMessages(q)).map(toMessage) };
  }

  const ids = { reply: await replyId(msg.id, 'reply'), q2: await replyId(msg.id, 'q2') };
  const [existing] = await ctx.repo.getMessages([msg.id]);
  assertOwnMessage(existing, ctx, s.goal.id, s.today, 'retro');
  const done = await ctx.repo.getMessages([ids.reply]);
  if (existing && done.length) {
    const rows = await ctx.repo.getMessages([msg.id, ids.reply, ids.q2]);
    return { messages: [msg.id, ids.reply, ids.q2].map((id) => rows.find((r) => r.id === id)).filter((r): r is MessageRow => !!r).map(toMessage) };
  }

  const all = await ctx.repo.listMessages(q);
  const prior = all.filter((m) => m.id !== msg.id);
  if (!prior.some((m) => m.id === q1Id)) throw new HttpError('invalid', 'retro not opened');
  const answerNo = prior.filter((m) => m.role === 'user').length + 1;
  const [tU, tR, tQ] = stamps(ctx.now(), 3);
  const userRow: MessageRow = existing ?? { ...base, id: msg.id, role: 'user', text: msg.text, meta: { retro_q: Math.min(answerNo, 3) }, created_at: tU };
  if (!existing) await ctx.repo.insertMessages([userRow]);

  const items = await ctx.repo.listItems(s.goal.id);
  const conversation = [...prior, userRow].map((m) => ({ role: m.role === 'user' ? ('learner' as const) : ('coach' as const), text: m.text }));
  const todayItems = items.filter((i) => i.first_day === s.today).map((i) => i.base);
  const ai = await aiFor(ctx, s.profile, FN);
  const stage = answerNo === 1 ? 'reaction' : 'follow_up';
  const out = await runRetro(ai, { stage, conversation, todayItems });

  const rows: MessageRow[] = [{ ...base, id: ids.reply, role: 'coach', text: out.reply.trim(), meta: { retro_stage: stage }, created_at: tR }];
  if (answerNo === 1) rows.push({ ...base, id: ids.q2, role: 'coach', text: RETRO_Q2, meta: { retro_q: 2 }, created_at: tQ });
  await ctx.repo.insertMessages(rows);

  if (answerNo === 1) await recordUsed(ctx, s, items, msg);
  const stored = await ctx.repo.getMessages([msg.id, ...rows.map((r) => r.id)]);
  return { messages: [msg.id, ...rows.map((r) => r.id)].map((id) => stored.find((r) => r.id === id)).filter((r): r is MessageRow => !!r).map(toMessage) };
}

/** 회고 1번 답에 들어간 항목은 '사용'(도움 없음). 다음 날 A 복습 후보가 된다. */
async function recordUsed(ctx: Ctx, s: Session, items: Awaited<ReturnType<Ctx['repo']['listItems']>>, msg: { id: string; text: string }) {
  const hits = items.filter((i) => itemAppearsIn(i.kind, i.base, msg.text));
  const events = [];
  for (const it of hits) {
    events.push({ id: await uuidv5(`${msg.id}:used:${it.id}`), user_id: ctx.userId, item_id: it.id, day: s.today, phase: 'retro', kind: 'used' as const, aided: false, correct: null, question_type: null });
    if (it.state === 'seen' || it.state === 'taught') await ctx.repo.updateItem(it.id, { state: 'used' });
  }
  await ctx.repo.insertItemEvents(events);
}
