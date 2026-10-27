/// <reference types="node" />
// 운영 Supabase에서 가입과 실제 Gemini 호출(goal-setup)이 되는지 한 번 확인한다. 테스트 계정은 끝에 지운다.
// 실행: npx tsx scripts/smoke-prod-ai.ts  (.env.local이 운영 주소일 때)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createApi, isApiError } from '../src/lib/api';

const e: Record<string, string> = {};
for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) e[m[1]] = m[2].replace(/^"|"$/g, '');
}

async function main() {
  const client = createClient(e.EXPO_PUBLIC_SUPABASE_URL, e.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const api = createApi({ client: () => client });
  const step = (name: string, v: unknown) => process.stdout.write(`ok  ${name}  ${typeof v === 'string' ? v : JSON.stringify(v)}\n`);

  step('url', e.EXPO_PUBLIC_SUPABASE_URL);
  const email = `smoke-${Date.now()}@test.graego.app`;
  const s = await api.signUpOrIn(email, `smoke-${Date.now()}`, { age_confirmed: true, ai_consent: true, terms_version: 'smoke' });
  step('가입', `user ${s.user.id.slice(0, 8)}…`);
  step('프로필', (await api.fetchProfile()) ? '있음' : '없음');

  const t0 = Date.now();
  const reply = await api.goalSetup([{ role: 'user', text: '카페에서 영어로 주문하고 싶어요. 다음 달에 미국 출장을 가요.' }]);
  step(`goal-setup (${Date.now() - t0}ms)`, reply);

  await api.deleteAccount();
  step('테스트 계정 삭제', 'ok');
}

main().catch((err: unknown) => {
  process.stderr.write(`FAIL ${isApiError(err) ? `${err.kind}:${err.code ?? ''}` : String(err)}\n`);
  process.exit(1);
});
