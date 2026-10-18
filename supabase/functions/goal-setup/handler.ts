// POST {messages: [{role: 'user'|'coach', text}]} → {reply, fields, done, subsituations?} (명세 4절 goal-setup)
// 대화는 앱이 들고 있다(무상태). 서버는 저장하지 않고 사용량만 기록한다.
import { assertActiveAccount } from '../_shared/auth.ts';
import { aiFor, loadProfile, MAX_TEXT } from '../_shared/context.ts';
import { HttpError } from '../_shared/errors.ts';
import type { Ai } from '../_shared/gemini.ts';
import {
  buildInput,
  type ChatLine,
  type GoalFields,
  type GoalSetupContext,
  type GoalSetupOutput,
  PROMPT_VERSION,
  SCHEMA,
  SYSTEM,
} from '../_shared/prompts/goal-setup.ts';
import { MIN_NOTE_CHARS } from '../_shared/rules.ts';
import type { Ctx } from '../_shared/server.ts';
import { charCount, hasHangul, toneProblems } from '../_shared/text.ts';

export const FN = 'goal-setup';
const MAX_MESSAGES = 40;

export type GoalSetupResponse = { reply: string; fields: Partial<Record<keyof GoalFields, string>>; done: boolean; subsituations?: string[] };

export function parseMessages(body: Record<string, unknown>): ChatLine[] {
  const m = body.messages;
  if (!Array.isArray(m) || m.length > MAX_MESSAGES) throw new HttpError('invalid', 'messages');
  return m.map((x) => {
    if (!x || typeof x !== 'object') throw new HttpError('invalid', 'messages[]');
    const o = x as Record<string, unknown>;
    if ((o.role !== 'user' && o.role !== 'coach') || typeof o.text !== 'string' || !o.text.trim() || o.text.length > MAX_TEXT) {
      throw new HttpError('invalid', 'messages[]');
    }
    return { role: o.role, text: o.text.trim() };
  });
}

const REQUIRED: (keyof GoalFields)[] = ['reason', 'place', 'my_role', 'partner', 'task', 'goal_name'];
/** create_goal의 길이 상한과 같다(마이그레이션 20261018000800). 넘는 값으로는 목표를 만들 수 없다. */
export const FIELD_MAX: Record<keyof GoalFields, number> = { reason: 1000, place: 100, my_role: 100, partner: 100, task: 100, goal_name: 60 };

export function missingFields(f: GoalFields): (keyof GoalFields)[] {
  return REQUIRED.filter((k) => !f[k]?.trim() || (k === 'reason' && charCount(f.reason ?? '') < MIN_NOTE_CHARS));
}

export function checkGoalSetup(r: GoalSetupOutput): string[] {
  const e: string[] = [];
  if (!r.reply.trim() || !hasHangul(r.reply)) e.push('reply는 한국어 문장입니다');
  for (const p of toneProblems(r.reply)) e.push(`reply 말투: ${p}`);
  for (const k of REQUIRED) {
    const v = r.fields[k]?.trim();
    if (v && charCount(v) > FIELD_MAX[k]) e.push(`${k}는 ${FIELD_MAX[k]}자 이하입니다`);
  }
  if (r.done) {
    const miss = missingFields(r.fields);
    if (miss.length) e.push(`done인데 비었거나 짧은 항목: ${miss.join(', ')}`);
    if (r.subsituations.length < 5 || r.subsituations.length > 8) e.push('done이면 subsituations는 5~8개입니다');
    const seen = new Set<string>();
    for (const s of r.subsituations) {
      if (!hasHangul(s) || charCount(s) > 20) e.push(`하위 상황 이름은 짧은 한국어입니다: ${s}`);
      if (seen.has(s)) e.push(`하위 상황이 겹칩니다: ${s}`);
      seen.add(s);
    }
  }
  return e;
}

export async function runGoalSetup(ai: Ai, c: GoalSetupContext): Promise<GoalSetupResponse> {
  const r = await ai.generate<GoalSetupOutput>({
    fn: FN,
    promptId: 'goal-setup',
    promptVersion: PROMPT_VERSION,
    tier: 'main',
    system: SYSTEM,
    input: buildInput(c),
    schema: SCHEMA,
    context: c,
    check: checkGoalSetup,
  });
  const fields: GoalSetupResponse['fields'] = {};
  for (const k of REQUIRED) {
    const v = r.fields[k]?.trim();
    if (v) fields[k] = v;
  }
  return r.done ? { reply: r.reply, fields, done: true, subsituations: r.subsituations } : { reply: r.reply, fields, done: false };
}

export async function handle(ctx: Ctx, body: Record<string, unknown>): Promise<GoalSetupResponse> {
  const messages = parseMessages(body);
  const profile = await loadProfile(ctx);
  assertActiveAccount(profile, ctx.now());
  const ai = await aiFor(ctx, profile);
  return runGoalSetup(ai, { messages });
}
