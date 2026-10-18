// POST {message?: {id, text}} → {messages} (명세 4절 reflection)
// 정지 중이고, 포기한 목표의 원래 시작 시각부터 원래 학습 분 동안만 열린다. 아니면 closed. 영구 정지는 banned.
// 시각은 profiles.suspended_start_minutes, suspended_target_minutes(포기 확정 때 복사)와 profiles.timezone으로 잰다.
// 재가입으로 이어 붙은 정지는 목표 행이 없다(suspended_goal_id null). 그때 재료는 비어 있다.
// 첫 호출은 그날의 첫 말(하루 한 번 생성). 기록은 reflections 표에 쌓는다.
import { isSuspended } from '../_shared/auth.ts';
import { aiFor, loadProfile, messageField, stamps } from '../_shared/context.ts';
import { HttpError } from '../_shared/errors.ts';
import type { Ai } from '../_shared/gemini.ts';
import { buildInput, PROMPT_VERSION, type ReflectionContext, type ReflectionOutput, SCHEMA, SYSTEM } from '../_shared/prompts/reflection.ts';
import { addDays, cycleOf } from '../_shared/rules.ts';
import type { Ctx } from '../_shared/server.ts';
import { charCount, forbiddenJudgment, hasHangul, toneProblems } from '../_shared/text.ts';
import type { GoalRow, ReflectionRow } from '../_shared/types.ts';
import { learningDay } from '../_shared/usage.ts';
import { replyId, uuidv5 } from '../_shared/uuid.ts';

export const FN = 'reflection';

export type ReflectionMessage = { id: string; day: string; role: 'user' | 'coach'; text: string; created_at: string };

const toMsg = (r: ReflectionRow): ReflectionMessage => ({ id: r.id, day: r.day, role: r.role, text: r.text, created_at: r.created_at });

/** 지금 열린 반성문 창의 하루 키. 오늘과 어제 창을 본다(04:00 경계를 넘는 시각 대비). 닫혀 있으면 null. */
export function openWindowDay(startMinutes: number, targetMinutes: number, timeZone: string, now: number): string | null {
  const today = learningDay(now, timeZone);
  for (const d of [today, addDays(today, -1)]) {
    const c = cycleOf(d, startMinutes, targetMinutes, timeZone);
    if (now >= c.start && now < c.graceEnd) return d;
  }
  return null;
}

export function checkReflection(r: ReflectionOutput): string[] {
  const e: string[] = [];
  const t = r.reply.trim();
  if (!t || !hasHangul(t)) e.push('reply는 한국어 문장입니다');
  if (charCount(t) > 400) e.push('reply가 너무 깁니다');
  for (const p of toneProblems(t)) e.push(`말투: ${p}`);
  for (const p of forbiddenJudgment(t)) e.push(`9.1 금지 표현(성격, 의지 단정): ${p}`);
  return e;
}

export function runReflection(ai: Ai, c: ReflectionContext): Promise<ReflectionOutput> {
  return ai.generate<ReflectionOutput>({
    fn: FN,
    promptId: 'reflection',
    promptVersion: PROMPT_VERSION,
    tier: 'main',
    system: SYSTEM,
    input: buildInput(c),
    schema: SCHEMA,
    context: c,
    check: checkReflection,
  });
}

export async function handle(ctx: Ctx, body: Record<string, unknown>): Promise<{ messages: ReflectionMessage[] }> {
  const msg = messageField(body);
  const profile = await loadProfile(ctx);
  if (profile.banned) throw new HttpError('banned');
  if (!isSuspended(profile, ctx.now())) throw new HttpError('closed', 'not suspended');
  const start = profile.suspended_start_minutes;
  const target = profile.suspended_target_minutes;
  if (start === null || target === null) throw new HttpError('closed', 'no window');
  const day = openWindowDay(start, target, profile.timezone, ctx.now());
  if (!day) throw new HttpError('closed', 'outside window');
  const found = profile.suspended_goal_id ? await ctx.repo.getGoal(profile.suspended_goal_id) : null;
  const goal: GoalRow | null = found && found.user_id === ctx.userId ? found : null;

  const rows = await ctx.repo.listReflections(ctx.userId, day);
  const openId = await uuidv5(`${ctx.userId}:${day}:reflection:open`);
  let ai: Ai | null = null;
  const getAi = async () => (ai ??= await aiFor(ctx, profile));

  const context = async (conversation: ReflectionContext['conversation']): Promise<ReflectionContext> => {
    const days = goal ? await ctx.repo.listDays(goal.id) : [];
    const count = (st: string) => days.filter((d) => d.status === st).length;
    return {
      records: {
        goalName: goal?.name ?? '',
        reason: goal?.reason ?? '',
        targetMinutes: target,
        done: count('done'),
        failed: count('failed'),
        coupon: count('coupon'),
        todayReasons: days.map((d) => d.today_reason).filter((t): t is string => !!t).slice(-3),
        giveupCount: profile.giveup_confirmed_count,
      },
      conversation,
    };
  };

  if (!msg) {
    if (rows.length > 0) return { messages: rows.map(toMsg) };
    const out = await runReflection(await getAi(), await context([]));
    await ctx.repo.insertReflections([{ id: openId, user_id: ctx.userId, day, role: 'coach', text: out.reply.trim(), created_at: new Date(ctx.now()).toISOString() }]);
    return { messages: (await ctx.repo.listReflections(ctx.userId, day)).map(toMsg) };
  }

  const coachId = await replyId(msg.id, 'coach');
  const mine = rows.find((r) => r.id === msg.id);
  const stored = rows.find((r) => r.id === coachId);
  if (mine && stored) return { messages: [toMsg(mine), toMsg(stored)] };
  if (mine && mine.role !== 'user') throw new HttpError('invalid', 'message id reused');

  const [tU, tC] = stamps(ctx.now(), 2);
  // 사용자 글은 답과 함께 저장한다. 상한이나 모델 실패로 끝나면 남지 않는다.
  const userRow: ReflectionRow = mine ?? { id: msg.id, user_id: ctx.userId, day, role: 'user', text: msg.text, created_at: tU };
  const conversation = [...rows.filter((r) => r.id !== msg.id), userRow].slice(-20).map((r) => ({ role: r.role, text: r.text }));
  const out = await runReflection(await getAi(), await context(conversation));
  const coachRow: ReflectionRow = { id: coachId, user_id: ctx.userId, day, role: 'coach', text: out.reply.trim(), created_at: tC };
  await ctx.repo.insertReflections([userRow, coachRow]);
  const after = await ctx.repo.listReflections(ctx.userId, day);
  return { messages: [userRow.id, coachId].map((id) => after.find((r) => r.id === id)).filter((r): r is ReflectionRow => !!r).map(toMsg) };
}
