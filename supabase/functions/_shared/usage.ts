// AI 사용량 상한과 기록 (MP 3절, 명세 2절).
// 하루 = 프로필 시간대 기준 하루 키(04:00 경계). 사용자당 하루 150회.
// 목표 설정은 마지막 목표 생성 이후 30회. 실패한 호출도 센다(남용 방지).
import type { Config } from './config.ts';
import type { Repo } from './repo.ts';
import { HttpError } from './errors.ts';
import { dayKeyOf } from './rules.ts';
import type { UsageRow } from './types.ts';

export function learningDay(now: number, timeZone: string): string {
  return dayKeyOf(now, timeZone);
}

export async function assertWithinLimit(repo: Repo, config: Config, userId: string, day: string, fn: string): Promise<void> {
  const used = await repo.countUsage({ userId, day });
  if (used >= config.dailyLimit) throw new HttpError('limit', 'daily');
  if (fn === 'goal-setup') {
    const since = await repo.lastGoalCreatedAt(userId);
    const n = await repo.countUsage({ userId, fn: 'goal-setup', since });
    if (n >= config.goalSetupLimit) throw new HttpError('limit', 'goal-setup');
  }
}

export function usageRecorder(repo: Repo, userId: string, day: string) {
  return (row: Omit<UsageRow, 'user_id' | 'day'>) => repo.insertUsage({ ...row, user_id: userId, day });
}
