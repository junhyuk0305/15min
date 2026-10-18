import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { ApiError, createApi, kindOfCode, withTimeout } from '../api';

// 진짜 supabase-js 클라이언트에 가짜 fetch를 넣어 오류 종류별로 확인한다.

type Reply = { status: number; body?: unknown } | 'network' | 'hang';
type Call = { url: string; method: string; body: string | null };

function setup(replies: Reply[], opts: { refresh?: () => Promise<boolean>; timeoutMs?: number } = {}) {
  const calls: Call[] = [];
  let lost = 0;
  let refreshes = 0;
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null });
    const r = replies.shift() ?? { status: 200, body: null };
    if (r === 'network') throw new TypeError('Network request failed');
    if (r === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createClient('http://127.0.0.1:9', 'anon-test-key', {
    global: { fetch: fakeFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const api = createApi({
    client: () => client,
    timeoutMs: opts.timeoutMs ?? 2000,
    refresh:
      opts.refresh &&
      (async () => {
        refreshes++;
        return opts.refresh!();
      }),
    onAuthLost: () => {
      lost++;
    },
  });
  return { api, calls, lost: () => lost, refreshes: () => refreshes };
}

const pg = (message: string, code = 'P0001') => ({ status: 400, body: { code, message, details: null, hint: null } });

async function kindOf(p: Promise<unknown>): Promise<{ kind: string; code?: string }> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof ApiError, `ApiError가 아님: ${String(e)}`);
    return { kind: e.kind, code: e.code };
  }
  assert.fail('실패해야 한다');
}

test('RPC 예외 message가 code가 된다 (P0001)', async () => {
  const { api } = setup([pg('suspended'), pg('banned'), pg('already_done'), pg('reason_short'), pg('too_early')]);
  assert.deepEqual(await kindOf(api.startDay('g', 'x'.repeat(20))), { kind: 'suspended', code: 'suspended' });
  assert.deepEqual(await kindOf(api.startDay('g', 'x')), { kind: 'banned', code: 'banned' });
  assert.deepEqual(await kindOf(api.completeDay('g', '2026-10-18')), { kind: 'conflict', code: 'already_done' });
  assert.deepEqual(await kindOf(api.startDay('g', 'x')), { kind: 'invalid', code: 'reason_short' });
  assert.deepEqual(await kindOf(api.startDay('g', 'x')), { kind: 'invalid', code: 'too_early' });
});

test('RPC는 /rest/v1/rpc/<이름>에 인자를 그대로 보낸다', async () => {
  const { api, calls } = setup([{ status: 200, body: { coupons: 2 } }]);
  assert.deepEqual(await api.spendCoupon('goal-1'), { coupons: 2 });
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/use_coupon$/);
  assert.deepEqual(JSON.parse(calls[0].body ?? '{}'), { p_goal: 'goal-1' });
});

test('네트워크 실패는 network', async () => {
  const { api } = setup(['network']);
  assert.equal((await kindOf(api.settleMe())).kind, 'network');
});

test('20초 제한: 응답이 없으면 timeout', async () => {
  const { api } = setup(['hang'], { timeoutMs: 30 });
  assert.equal((await kindOf(api.serverNow())).kind, 'timeout');
});

test('withTimeout은 제때 끝나면 값을 돌려준다', async () => {
  assert.equal(await withTimeout(async () => 7, 50), 7);
});

test('429는 limit, 500은 server, 23505는 conflict', async () => {
  const { api } = setup([{ status: 429, body: { message: 'x' } }, { status: 500, body: { message: 'x' } }, { status: 409, body: { code: '23505', message: 'dup' } }]);
  assert.equal((await kindOf(api.settleMe())).kind, 'limit');
  assert.equal((await kindOf(api.settleMe())).kind, 'server');
  assert.equal((await kindOf(api.settleMe())).kind, 'conflict');
});

test('인증 만료: 한 번 갱신하고 다시 보내 성공한다', async () => {
  const { api, refreshes, lost, calls } = setup(
    [{ status: 401, body: { code: 'PGRST303', message: 'JWT expired' } }, { status: 200, body: '2026-10-18T03:00:00+00:00' }],
    { refresh: async () => true },
  );
  assert.equal(await api.serverNow(), Date.parse('2026-10-18T03:00:00Z'));
  assert.equal(refreshes(), 1);
  assert.equal(lost(), 0);
  assert.equal(calls.length, 2);
});

test('인증 만료: 갱신이 실패하면 auth이고 onAuthLost를 한 번 부른다', async () => {
  const { api, refreshes, lost } = setup([{ status: 401, body: { code: 'PGRST301', message: 'bad jwt' } }], { refresh: async () => false });
  assert.equal((await kindOf(api.settleMe())).kind, 'auth');
  assert.equal(refreshes(), 1);
  assert.equal(lost(), 1);
});

test('인증 만료: 갱신 뒤에도 401이면 auth (재시도는 한 번만)', async () => {
  const unauth = { status: 401, body: { code: 'PGRST303', message: 'JWT expired' } };
  const { api, refreshes, lost, calls } = setup([unauth, unauth], { refresh: async () => true });
  assert.equal((await kindOf(api.settleMe())).kind, 'auth');
  assert.equal(refreshes(), 1);
  assert.equal(lost(), 1);
  assert.equal(calls.length, 2);
});

test('Edge Function 오류 본문 {error}가 kind와 code가 된다', async () => {
  const { api } = setup([
    { status: 403, body: { error: 'closed' } },
    { status: 403, body: { error: 'suspended' } },
    { status: 403, body: { error: 'banned' } },
    { status: 429, body: { error: 'limit' } },
    { status: 502, body: { error: 'ai_failed' } },
    { status: 504, body: { error: 'timeout' } },
    { status: 400, body: { error: 'invalid' } },
    { status: 500, body: { error: 'server' } },
  ]);
  assert.deepEqual(await kindOf(api.reflection()), { kind: 'closed', code: 'closed' });
  assert.deepEqual(await kindOf(api.lessonTurn('g', 'd')), { kind: 'suspended', code: 'suspended' });
  assert.deepEqual(await kindOf(api.retro('g', 'd')), { kind: 'banned', code: 'banned' });
  assert.deepEqual(await kindOf(api.goalSetup([])), { kind: 'limit', code: 'limit' });
  assert.deepEqual(await kindOf(api.lessonTurn('g', 'd', { id: 'm', text: 'hi' })), { kind: 'server', code: 'ai_failed' });
  assert.deepEqual(await kindOf(api.quizNext('g', 'd', 'A')), { kind: 'timeout', code: 'timeout' });
  assert.deepEqual(await kindOf(api.retro('g', 'd')), { kind: 'invalid', code: 'invalid' });
  assert.deepEqual(await kindOf(api.deleteAccount()), { kind: 'server', code: 'server' });
});

test('Edge Function 네트워크 실패는 network, 응답 없음은 timeout', async () => {
  const a = setup(['network']);
  assert.equal((await kindOf(a.api.reflection())).kind, 'network');
  const b = setup(['hang'], { timeoutMs: 30 });
  assert.equal((await kindOf(b.api.reflection())).kind, 'timeout');
});

test('Edge Function 401은 갱신 뒤 다시 보낸다', async () => {
  const { api, refreshes, calls } = setup(
    [{ status: 401, body: { error: 'auth' } }, { status: 200, body: { messages: [{ id: 'r1', day: '2026-10-18', role: 'coach', text: '왜 포기하셨습니까?', created_at: '2026-10-18T12:00:00Z' }] } }],
    { refresh: async () => true },
  );
  const msgs = await api.reflection();
  assert.equal(refreshes(), 1);
  assert.equal(calls.length, 2);
  assert.equal(msgs[0].role, 'coach');
  assert.equal(msgs[0].createdAt, Date.parse('2026-10-18T12:00:00Z'));
});

test('lesson-turn 응답 메시지를 앱 모양으로 바꾼다', async () => {
  const { api, calls } = setup([
    {
      status: 200,
      body: {
        messages: [{ id: 'm1', goal_id: 'g', day: '2026-10-18', phase: 'B', role: 'partner', text: 'Hi!', meta: {}, created_at: '2026-10-18T12:00:00Z' }],
        modal: null,
        episode: { index: 0, cursor: 1, total: 5, finished: false },
      },
    },
  ]);
  const r = await api.lessonTurn('g', '2026-10-18', { id: 'u1', text: 'hello' });
  assert.equal(r.messages[0].goalId, 'g');
  assert.deepEqual(r.episode, { index: 0, cursor: 1, total: 5, finished: false });
  assert.match(calls[0].url, /\/functions\/v1\/lesson-turn$/);
  assert.deepEqual(JSON.parse(calls[0].body ?? '{}'), { goal_id: 'g', day: '2026-10-18', message: { id: 'u1', text: 'hello' } });
});

test('코드 받기: 가입 동의 메타데이터를 data로 보낸다', async () => {
  const { api, calls } = setup([{ status: 200, body: {} }]);
  await api.sendCode(' a@b.co ', { age_confirmed: true, ai_consent: true, terms_version: 'v1' });
  assert.match(calls[0].url, /\/auth\/v1\/otp/);
  const body = JSON.parse(calls[0].body ?? '{}');
  assert.equal(body.email, 'a@b.co');
  assert.deepEqual(body.data, { age_confirmed: true, ai_consent: true, terms_version: 'v1' });
  assert.equal(body.create_user, true);
});

test('코드 받기 횟수 초과는 limit, 틀린 코드는 invalid otp_expired', async () => {
  const { api } = setup([
    { status: 429, body: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'rate' } },
    { status: 403, body: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' } },
  ]);
  assert.deepEqual(await kindOf(api.sendCode('a@b.co', { age_confirmed: true, ai_consent: true, terms_version: 'v' })), {
    kind: 'limit',
    code: 'over_email_send_rate_limit',
  });
  assert.deepEqual(await kindOf(api.verifyCode('a@b.co', '123456')), { kind: 'invalid', code: 'otp_expired' });
});

test('가입 트리거 거부(GoTrue 500 + P0001)는 network가 아니라 invalid와 그 코드', async () => {
  const { api } = setup([
    { status: 500, body: { code: 'P0001', message: 'age_not_confirmed' } },
    { status: 500, body: { code: 'P0001', message: 'ai_consent_required' } },
    { status: 500, body: { code: 'unexpected_failure', msg: 'Database error saving new user' } },
  ]);
  const meta = { age_confirmed: true, ai_consent: true, terms_version: 'v' } as const;
  assert.deepEqual(await kindOf(api.sendCode('a@b.co', meta)), { kind: 'invalid', code: 'age_not_confirmed' });
  assert.deepEqual(await kindOf(api.sendCode('a@b.co', meta)), { kind: 'invalid', code: 'ai_consent_required' });
  // 그 밖의 500은 그대로 재시도할 수 있는 실패로 본다
  assert.equal((await kindOf(api.sendCode('a@b.co', meta))).kind, 'network');
});

test('report_ai_text: 함수 이름, 글, 사유를 그대로 보낸다', async () => {
  const { api, calls } = setup([{ status: 200, body: {} }]);
  await api.reportAiText('goal-setup', '코치 답', '틀린 설명');
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/report_ai_text$/);
  assert.deepEqual(JSON.parse(calls[0].body ?? '{}'), { p_fn: 'goal-setup', p_text: '코치 답', p_reason: '틀린 설명' });
});

test('login_method: password만 password, 나머지는 otp', async () => {
  const { api } = setup([{ status: 200, body: 'password' }, { status: 200, body: 'otp' }]);
  assert.equal(await api.loginMethod('review@x.app'), 'password');
  assert.equal(await api.loginMethod('a@b.co'), 'otp');
});

test('설정이 없으면 server not_configured', async () => {
  const api = createApi({ client: () => null });
  assert.deepEqual(await kindOf(api.settleMe()), { kind: 'server', code: 'not_configured' });
});

test('kindOfCode', () => {
  assert.equal(kindOfCode('not_requested'), 'conflict');
  assert.equal(kindOfCode('not_found'), 'invalid');
  assert.equal(kindOfCode('closed'), 'closed');
  assert.equal(kindOfCode('ai_failed'), 'server');
});
