/// <reference types="node" />
// 로컬 Supabase에 앱 api 계층(src/lib/api.ts)을 그대로 붙여 끝에서 끝까지 확인한다.
// 심사용 데모 계정(supabase/seed.sql)으로 비밀번호 로그인 → server_now → set_timezone → settle_me → 읽기 → start_day → save_progress.
// 실행: SMOKE_EMAIL=review@graego.app SMOKE_PASSWORD=<seed 비밀번호> npx tsx scripts/smoke-auth.ts
// 값은 .env.local(EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY)에서 읽는다. 키를 출력하지 않는다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createApi, isApiError } from '../src/lib/api';
import { dayKeyOf } from '../src/lib/rules';

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}

async function main() {
  const e = env();
  const email = process.env.SMOKE_EMAIL ?? 'review@graego.app';
  const password = process.env.SMOKE_PASSWORD;
  if (!password) throw new Error('SMOKE_PASSWORD가 없습니다');
  const client = createClient(e.EXPO_PUBLIC_SUPABASE_URL, e.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const api = createApi({ client: () => client });
  const step = (name: string, v: unknown) => process.stdout.write(`ok  ${name}  ${typeof v === 'string' ? v : JSON.stringify(v)}\n`);

  step('login_method', await api.loginMethod(email));
  const session = await api.signInWithPassword(email, password);
  step('signInWithPassword', `user ${session.user.id.slice(0, 8)}…`);

  const t0 = Date.now();
  const server = await api.serverNow();
  step('server_now', `offset ${Math.round(server - (t0 + Date.now()) / 2)}ms`);

  const profile = await api.setTimezone('Asia/Seoul');
  step('set_timezone', { timezone: profile.timezone, pending: profile.pendingTimezone, banned: profile.banned });

  await api.settleMe();
  step('settle_me', 'void');

  const goals = await api.fetchGoals();
  const goal = goals.find((g) => g.status === 'active');
  if (!goal) throw new Error('활성 목표가 없습니다(seed 확인)');
  step('fetchGoals', { active: goal.name, firstDay: goal.firstDay, coupons: goal.coupons });

  const reason = `스모크 확인 ${new Date().toISOString()} 오늘도 영어 주문을 연습합니다`;
  const day = await api.startDay(goal.id, reason);
  step('start_day', { day: day.day, status: day.status, phase: day.phase, startedAt: day.sessionStartedAt !== null });
  const today = dayKeyOf(server, profile.timezone);
  if (day.day !== today) throw new Error(`하루 키가 다릅니다: 서버 ${day.day}, 앱 ${today}`);

  // 서버 경과 시간보다 큰 값을 보내면 서버가 자른다(MP 4절)
  const saved = await api.saveProgress(goal.id, day.day, 600, 'A');
  step('save_progress(600)', { activeSeconds: saved.activeSeconds, phase: saved.phase });
  if (saved.activeSeconds >= 600) throw new Error('서버가 센 시간을 자르지 않았습니다');

  const days = await api.fetchDays(10);
  step('fetchDays', days.map((d) => `${d.day}:${d.status}`).join(' '));

  try {
    await api.completeDay(goal.id, day.day);
    throw new Error('complete_day가 성공하면 안 됩니다');
  } catch (err) {
    if (!isApiError(err)) throw err;
    step('complete_day (이른 완료)', { kind: err.kind, code: err.code });
  }

  await api.signOut();
  step('signOut', 'local');

  // 2부: 이메일 코드 가입. 동의 메타데이터가 가입 트리거까지 가서 프로필이 생기는지 본다(Mailpit에서 코드를 읽는다)
  const mailpit = process.env.SMOKE_MAILPIT ?? 'http://127.0.0.1:54624';
  const fresh = `smoke-${Date.now()}@test.local`;
  await api.sendCode(fresh, { age_confirmed: true, ai_consent: true, terms_version: 'smoke', timezone: 'Asia/Seoul' });
  step('sendCode', fresh);
  const code = await readCode(mailpit, fresh);
  const s2 = await api.verifyCode(fresh, code);
  step('verifyCode', `user ${s2.user.id.slice(0, 8)}…`);
  const p2 = await api.fetchProfile();
  step('fetchProfile(가입 트리거)', { timezone: p2?.timezone, giveups: p2?.giveupConfirmedCount });
  if (!p2) throw new Error('가입 트리거가 프로필을 만들지 않았습니다');
  await api.deleteAccount().then(
    () => step('delete-account', 'ok'),
    (err: unknown) => step('delete-account', isApiError(err) ? `${err.kind}:${err.code ?? ''} (함수 미배포면 정상)` : String(err)),
  );
  await api.signOut();

  // 동의 없이 가입하면 트리거가 막는다
  const raw = await client.auth.signInWithOtp({ email: `smoke-noconsent-${Date.now()}@test.local` });
  step('동의 없는 가입', raw.error ? `거부됨 (${raw.error.status})` : '허용됨 (문제)');
  if (!raw.error) throw new Error('동의 없는 가입이 허용됐습니다');
}

async function readCode(base: string, to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const list = (await (await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json()) as { messages?: { ID: string }[] };
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${base}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
      const m = /\b(\d{6})\b/.exec(`${msg.Text ?? ''} ${msg.HTML ?? ''}`);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('메일에서 코드를 찾지 못했습니다');
}

main().catch((err: unknown) => {
  process.stderr.write(`FAIL ${isApiError(err) ? `${err.kind}:${err.code ?? ''}` : String(err)}\n`);
  process.exit(1);
});
