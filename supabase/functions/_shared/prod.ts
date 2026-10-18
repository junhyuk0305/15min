// 운영 의존성. 각 함수의 index.ts만 불러온다(테스트와 평가는 MemoryRepo를 넣는다).
import { loadConfig } from './config.ts';
import { SupabaseRepo } from './db.ts';
import { transportFor } from './gemini.ts';
import type { Deps } from './server.ts';

export function productionDeps(): Deps {
  const config = loadConfig();
  return { repo: new SupabaseRepo(), config, transport: transportFor(config), now: Date.now };
}
