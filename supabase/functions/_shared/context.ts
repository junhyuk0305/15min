// 함수들이 같이 쓰는 요청 검사와 불러오기.
import { assertActiveAccount } from './auth.ts';
import { HttpError } from './errors.ts';
import { type Ai, createAi } from './gemini.ts';
import type { Ctx } from './server.ts';
import type { DayRow, GoalRow, MessageRow, Profile } from './types.ts';
import { assertWithinLimit, learningDay, usageRecorder } from './usage.ts';
import { isUuid } from './uuid.ts';

export const MAX_TEXT = 2000;

export function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || !v.trim()) throw new HttpError('invalid', key);
  return v;
}

export function uuidField(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (!isUuid(v)) throw new HttpError('invalid', key);
  return v.toLowerCase();
}

export function dayField(body: Record<string, unknown>, key = 'day'): string {
  const v = body[key];
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError('invalid', key);
  return v;
}

/** 선택 항목 message: {id, text}. 없으면 null. */
export function messageField(body: Record<string, unknown>): { id: string; text: string } | null {
  const m = body.message;
  if (m === undefined || m === null) return null;
  if (typeof m !== 'object' || Array.isArray(m)) throw new HttpError('invalid', 'message');
  const o = m as Record<string, unknown>;
  const id = uuidField(o, 'id');
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  if (!text || text.length > MAX_TEXT) throw new HttpError('invalid', 'message.text');
  return { id, text };
}

export async function loadProfile(ctx: Ctx): Promise<Profile> {
  const p = await ctx.repo.getProfile(ctx.userId);
  if (!p) throw new HttpError('not_found', 'profile');
  return p;
}

export type Session = { profile: Profile; goal: GoalRow; day: DayRow; today: string };

/**
 * 학습 중 요청(lesson-turn, review-quiz, retro)의 공통 검사.
 * 내 목표이고 활성, 정지 아님, 그날이 서버 기준 오늘, 그날 학습이 진행 중(start_day 뒤).
 */
export async function loadSession(ctx: Ctx, goalId: string, dayKey: string): Promise<Session> {
  const profile = await loadProfile(ctx);
  assertActiveAccount(profile, ctx.now());
  const goal = await ctx.repo.getGoal(goalId);
  if (!goal || goal.user_id !== ctx.userId) throw new HttpError('not_found', 'goal');
  if (goal.status !== 'active') throw new HttpError('closed', 'goal not active');
  const today = learningDay(ctx.now(), profile.timezone);
  if (dayKey !== today) throw new HttpError('closed', 'not today');
  const day = await ctx.repo.getDay(goalId, dayKey);
  if (!day || day.user_id !== ctx.userId) throw new HttpError('closed', 'day not started');
  if (day.status !== 'progress') throw new HttpError('closed', `day ${day.status}`);
  return { profile, goal, day, today };
}

/** 상한 검사 뒤 사용량을 기록하는 모델 호출기를 만든다. */
export async function aiFor(ctx: Ctx, profile: Profile, fn: string): Promise<Ai> {
  const day = learningDay(ctx.now(), profile.timezone);
  await assertWithinLimit(ctx.repo, ctx.config, ctx.userId, day, fn);
  return createAi({
    config: ctx.config,
    transport: ctx.transport,
    record: usageRecorder(ctx.repo, ctx.userId, day),
    observe: ctx.observe,
    now: ctx.now,
  });
}

/** 저장된 사용자 메시지가 다른 사용자, 다른 자리의 것이면 거부한다(남의 id 재사용 방지). */
export function assertOwnMessage(row: MessageRow | undefined, ctx: Ctx, goalId: string | null, day: string | null, phase: string) {
  if (!row) return;
  if (row.user_id !== ctx.userId || row.goal_id !== goalId || row.day !== day || row.phase !== phase || row.role !== 'user') {
    throw new HttpError('invalid', 'message id reused');
  }
}

/** 한 요청에서 넣는 여러 행이 같은 시각이 되지 않도록 1ms씩 민다. */
export function stamps(now: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(now + i).toISOString());
}
