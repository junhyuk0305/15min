// AI 사용량 상한과 기록 (MP 3절, 명세 2절).
// 하루 = 한국 시간(APP_TIME_ZONE) 기준 하루 키(04:00 경계). 사용자당 하루 150회.
// 목표 설정은 마지막 목표 생성 이후 30회. 모든 사용자를 합쳐 하루 20000회. 실패한 호출도 센다(남용 방지).
// 상한은 모델을 부르기 직전마다 DB 함수(reserve_ai_call)가 사용자별 잠금 안에서 세고 한 줄을 잡는다.
// 그래서 동시 요청이 몰려도 상한을 넘지 않는다.
import type { Config } from './config.ts';
import { HttpError } from './errors.ts';
import type { Meter } from './gemini.ts';
import type { Repo } from './repo.ts';
import { dayKeyOf } from './rules.ts';

export function learningDay(now: number, timeZone: string): string {
  return dayKeyOf(now, timeZone);
}

export function usageMeter(repo: Repo, config: Config, userId: string, day: string): Meter {
  return {
    async reserve(meta) {
      const r = await repo.reserveUsage({
        userId,
        day,
        ...meta,
        limits: { daily: config.dailyLimit, goalSetup: config.goalSetupLimit, global: config.globalDailyLimit },
      });
      if (!r.ok) throw new HttpError('limit', r.limit);
      return r.id;
    },
    finish: (id, result) => repo.finishUsage(id, result),
  };
}
