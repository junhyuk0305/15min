// Supabase 호출을 전부 여기 모은다. 화면은 store만 보고, store가 이 함수들을 부른다.
// - 모든 실패는 ApiError {kind, code?} 하나로 바뀐다. 화면은 kind만 보고 MP 7.3대로 처리한다.
// - RPC 예외(errcode P0001)의 message가 곧 code다(명세 3절). Edge Function 오류는 본문 {error: code}다(명세 4절).
// - 요청마다 20초 제한. 인증 만료(401)는 세션을 한 번 갱신하고 다시 보낸다. 갱신도 실패하면 onAuthLost를 부르고 kind 'auth'.
// - React Native를 import하지 않는다. 테스트는 fetch를 넣은 진짜 supabase-js 클라이언트로 돈다.
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  isAuthError,
  isAuthRetryableFetchError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  dayFromRow,
  goalFromRow,
  goalInputToArgs,
  itemEventFromRow,
  itemFromRow,
  messageFromRow,
  profileFromRow,
  reflectionFromRow,
  type AppGoal,
  type Episode,
  type GoalInput,
  type GoalSetupLine,
  type GoalSetupReply,
  type LessonModal,
  type Message,
  type Profile,
  type QuizGrade,
  type QuizQuestion,
  type ReflectionMessage,
} from './model';
import { writtenFromRow, type WrittenRow } from './archive';
import type { DayRow, Item, ItemEvent, Phase } from './rules';

// ---------- 오류 ----------

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'limit'
  | 'suspended'
  | 'banned'
  | 'closed'
  | 'invalid'
  | 'conflict'
  | 'server';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code?: string;
  constructor(kind: ApiErrorKind, code?: string) {
    super(code ? `${kind}:${code}` : kind);
    this.name = 'ApiError';
    this.kind = kind;
    this.code = code;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** 이미 처리된 요청이라 결과만 다시 보면 되는 코드 */
const CONFLICT_CODES = new Set(['already_done', 'already_requested', 'not_requested']);

/** 서버 오류 코드(RPC message 또는 Edge Function {error}) → kind */
export function kindOfCode(code: string): ApiErrorKind {
  switch (code) {
    case 'suspended':
    case 'banned':
    case 'closed':
    case 'limit':
    case 'auth':
    case 'timeout':
    case 'server':
      return code;
    case 'ai_failed':
      return 'server';
    default:
      return CONFLICT_CODES.has(code) ? 'conflict' : 'invalid';
  }
}

function byStatus(status: number, code?: string): ApiError {
  if (status === 0) return new ApiError('network', code);
  if (status === 401) return new ApiError('auth', code);
  if (status === 408 || status === 504) return new ApiError('timeout', code);
  if (status === 429) return new ApiError('limit', code);
  if (status === 409) return new ApiError('conflict', code);
  if (status >= 400 && status < 500) return new ApiError('invalid', code);
  return new ApiError('server', code);
}

type PgError = { code?: string; message?: string } | null;

/** PostgREST(rpc, select) 오류 → ApiError */
export function fromPostgrest(error: PgError, status: number): ApiError {
  const code = error?.code ?? '';
  if (status === 0) return new ApiError('network');
  if (code === 'P0001') {
    const c = (error?.message ?? '').trim();
    return new ApiError(kindOfCode(c), c);
  }
  if (code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') return new ApiError('auth', code);
  if (code === '42501') return status === 401 ? new ApiError('auth', code) : new ApiError('server', code);
  if (code === '23505') return new ApiError('conflict', code);
  if (code === 'PGRST202') return new ApiError('server', code);
  return byStatus(status, code || undefined);
}

/** Edge Function 오류 → ApiError */
export async function fromFunctions(error: unknown): Promise<ApiError> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let code: unknown;
    try {
      code = ((await res.json()) as { error?: unknown } | null)?.error;
    } catch {
      code = undefined; // 본문이 JSON이 아니면 상태 코드로만 판단한다
    }
    if (typeof code === 'string' && code) return new ApiError(kindOfCode(code), code);
    return byStatus(res.status);
  }
  if (error instanceof FunctionsRelayError) return new ApiError('server', 'relay');
  if (error instanceof FunctionsFetchError) return new ApiError('network');
  return toApiError(error);
}

/** Supabase Auth 오류 → ApiError. 화면은 code로 문구를 고른다(otp_expired, invalid_credentials 등). */
export function fromAuth(error: unknown): ApiError {
  if (isAuthRetryableFetchError(error)) return new ApiError('network');
  if (isAuthError(error)) {
    const status = error.status ?? 0;
    const code = error.code ?? undefined;
    if (status === 0) return new ApiError('network', code);
    if (status === 429 || (code && /rate_limit/.test(code))) return new ApiError('limit', code);
    if (code === 'session_not_found' || code === 'refresh_token_not_found' || code === 'session_expired') return new ApiError('auth', code);
    return byStatus(status, code);
  }
  return toApiError(error);
}

/** 그 밖의 예외 → ApiError. fetch가 던지는 TypeError는 네트워크로 본다. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof TypeError) return new ApiError('network');
  return new ApiError('server');
}

// ---------- 시간 제한 ----------

export const TIMEOUT_MS = 20_000;

/** run이 timeoutMs 안에 끝나지 않으면 신호를 끊고 kind 'timeout'으로 실패한다 */
export async function withTimeout<T>(run: (signal: AbortSignal) => PromiseLike<T>, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new ApiError('timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(run(ctrl.signal)), expired]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 응답 모양 ----------

export type CompleteDayResult = { day: DayRow; couponEarned: boolean; coupons: number };
export type LessonTurnResult = { messages: Message[]; modal: LessonModal; episode: Episode | null };
export type SignupMeta = { age_confirmed: true; ai_consent: true; terms_version: string; timezone: string };
export type LoginMethod = 'password' | 'otp';

/** 가입 때 동의한 약관 판. 약관을 바꾸면 올린다. */
export const TERMS_VERSION = '2026-10-18';

type Raw = Record<string, unknown>;

// ---------- API ----------

export type ApiOptions = {
  /** 설정이 없으면 null. 그때 모든 호출은 kind 'server', code 'not_configured' */
  client: () => SupabaseClient | null;
  timeoutMs?: number;
  /** 세션 갱신. 성공하면 true. 기본은 client.auth.refreshSession() */
  refresh?: () => Promise<boolean>;
  /** 갱신까지 실패해 다시 로그인해야 할 때 */
  onAuthLost?: () => void;
};

export function createApi(opts: ApiOptions) {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;

  const sb = (): SupabaseClient => {
    const c = opts.client();
    if (!c) throw new ApiError('server', 'not_configured');
    return c;
  };

  const refresh =
    opts.refresh ??
    (async () => {
      const { data, error } = await sb().auth.refreshSession();
      return !error && !!data.session;
    });

  /** 인증 만료면 한 번 갱신하고 다시 보낸다 */
  async function authed<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      if (!(e instanceof ApiError) || e.kind !== 'auth') throw e;
      let ok = false;
      try {
        ok = await withTimeout(() => refresh(), timeoutMs);
      } catch {
        ok = false; // 갱신 요청 자체가 실패해도 다시 로그인으로 보낸다
      }
      if (ok) {
        try {
          return await run();
        } catch (e2) {
          if (e2 instanceof ApiError && e2.kind === 'auth') opts.onAuthLost?.();
          throw e2;
        }
      }
      opts.onAuthLost?.();
      throw new ApiError('auth', e.code);
    }
  }

  async function rpc<T = unknown>(fn: string, args?: Raw): Promise<T> {
    return authed(async () => {
      const res = await withTimeout((signal) => sb().rpc(fn, args ?? {}).abortSignal(signal), timeoutMs).catch((e: unknown) => {
        throw toApiError(e);
      });
      if (res.error) throw fromPostgrest(res.error, res.status);
      return res.data as T;
    });
  }

  async function select(table: string, build: (q: ReturnType<SupabaseClient['from']>) => PromiseLike<{ data: unknown; error: PgError; status: number }>): Promise<Raw[]> {
    return authed(async () => {
      const res = await withTimeout(() => build(sb().from(table)), timeoutMs).catch((e: unknown) => {
        throw toApiError(e);
      });
      if (res.error) throw fromPostgrest(res.error, res.status);
      return (res.data ?? []) as Raw[];
    });
  }

  async function invoke<T>(fn: string, body: Raw): Promise<T> {
    return authed(async () => {
      const res = await withTimeout((signal) => sb().functions.invoke(fn, { body, signal }), timeoutMs).catch((e: unknown) => {
        throw toApiError(e);
      });
      if (res.error) throw await fromFunctions(res.error);
      return res.data as T;
    });
  }

  async function authCall<R extends { error: unknown }>(run: () => Promise<R>): Promise<R> {
    const res = await withTimeout(() => run(), timeoutMs).catch((e: unknown) => {
      throw e instanceof ApiError ? e : fromAuth(e);
    });
    if (res.error) throw fromAuth(res.error);
    return res;
  }

  const mapMessages = (v: unknown): Message[] => (Array.isArray(v) ? v.map((m) => messageFromRow(m as Raw)) : []);

  return {
    // ----- 인증 -----

    async getSession(): Promise<Session | null> {
      const { data } = await sb().auth.getSession();
      return data.session;
    },

    /** 심사용 데모 이메일이면 'password'. anon으로 부른다 */
    async loginMethod(email: string): Promise<LoginMethod> {
      const m = await rpc<string>('login_method', { p_email: email.trim() });
      return m === 'password' ? 'password' : 'otp';
    },

    /** 6자리 코드 메일. 처음이면 가입. meta는 가입 트리거가 raw_user_meta_data에서 읽는다 */
    async sendCode(email: string, meta: SignupMeta): Promise<void> {
      await authCall(() => sb().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, data: meta } }));
    },

    async verifyCode(email: string, token: string): Promise<Session> {
      const { data } = await authCall(() => sb().auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' }));
      if (!data.session) throw new ApiError('auth', 'no_session');
      return data.session;
    },

    async signInWithPassword(email: string, password: string): Promise<Session> {
      const { data } = await authCall(() => sb().auth.signInWithPassword({ email: email.trim(), password }));
      if (!data.session) throw new ApiError('auth', 'no_session');
      return data.session;
    },

    /** 이 기기의 세션만 지운다. 서버 요청이 실패해도 로컬 세션은 지워진다 */
    async signOut(): Promise<void> {
      await sb().auth.signOut({ scope: 'local' });
    },

    // ----- RPC (명세 3절) -----

    /** 서버 시각(epoch ms) */
    async serverNow(): Promise<number> {
      const v = await rpc<string>('server_now');
      const n = Date.parse(v);
      if (!Number.isFinite(n)) throw new ApiError('server', 'bad_time');
      return n;
    },

    async setTimezone(tz: string): Promise<Profile> {
      return profileFromRow(await rpc<Raw>('set_timezone', { p_tz: tz }));
    },

    async settleMe(): Promise<void> {
      await rpc('settle_me');
    },

    async createGoal(input: GoalInput): Promise<AppGoal> {
      return goalFromRow(await rpc<Raw>('create_goal', goalInputToArgs(input)));
    },

    async startDay(goalId: string, reason: string): Promise<DayRow> {
      return dayFromRow(await rpc<Raw>('start_day', { p_goal: goalId, p_reason: reason.trim() }));
    },

    async saveProgress(goalId: string, day: string, activeSeconds: number, phase: Phase): Promise<DayRow> {
      return dayFromRow(
        await rpc<Raw>('save_progress', { p_goal: goalId, p_day: day, p_active_seconds: Math.floor(activeSeconds), p_phase: phase }),
      );
    },

    async startRetro(goalId: string, day: string): Promise<DayRow> {
      return dayFromRow(await rpc<Raw>('start_retro', { p_goal: goalId, p_day: day }));
    },

    async saveRetroProgress(goalId: string, day: string, seconds: number): Promise<DayRow> {
      return dayFromRow(await rpc<Raw>('save_retro_progress', { p_goal: goalId, p_day: day, p_seconds: Math.floor(seconds) }));
    },

    async completeDay(goalId: string, day: string): Promise<CompleteDayResult> {
      const r = await rpc<Raw>('complete_day', { p_goal: goalId, p_day: day });
      return { day: dayFromRow(r.day as Raw), couponEarned: r.coupon_earned === true, coupons: Number(r.coupons ?? 0) };
    },

    /** use_coupon RPC. 오늘을 쿠폰으로 처리한다 */
    async spendCoupon(goalId: string): Promise<{ coupons: number }> {
      const r = await rpc<Raw>('use_coupon', { p_goal: goalId });
      return { coupons: Number(r.coupons ?? 0) };
    },

    async requestGiveup(goalId: string): Promise<AppGoal> {
      return goalFromRow(await rpc<Raw>('request_giveup', { p_goal: goalId }));
    },

    async withdrawGiveup(goalId: string): Promise<AppGoal> {
      return goalFromRow(await rpc<Raw>('withdraw_giveup', { p_goal: goalId }));
    },

    async declareAchievement(goalId: string): Promise<AppGoal> {
      return goalFromRow(await rpc<Raw>('declare_achievement', { p_goal: goalId }));
    },

    async changeSchedule(goalId: string, startMinutes: number, targetMinutes: number, weekdays: number[]): Promise<AppGoal> {
      return goalFromRow(
        await rpc<Raw>('change_schedule', { p_goal: goalId, p_start_minutes: startMinutes, p_target_minutes: targetMinutes, p_weekdays: weekdays }),
      );
    },

    /** 코치, 상대, 반성문 응답 신고. 같은 건은 한 번만 남는다 */
    async reportMessage(messageId: string, reason: string): Promise<void> {
      await rpc('report_message', { p_message_id: messageId, p_reason: reason });
    },

    // ----- 읽기 (RLS: 자기 행, 포기 확정 목표는 숨김) -----

    async fetchProfile(): Promise<Profile | null> {
      const rows = await select('profiles', (q) => q.select('*').limit(1));
      return rows[0] ? profileFromRow(rows[0]) : null;
    },

    /** 활성과 달성 목표. 최근 것부터 */
    async fetchGoals(): Promise<AppGoal[]> {
      const rows = await select('goals', (q) => q.select('*').order('created_at', { ascending: false }).limit(50));
      return rows.map(goalFromRow);
    },

    /** 보이는 목표들의 날. 최근 limit개 */
    async fetchDays(limit = 400): Promise<DayRow[]> {
      const rows = await select('days', (q) => q.select('*').order('day', { ascending: false }).limit(limit));
      return rows.map(dayFromRow);
    },

    async fetchMessages(goalId: string, day: string): Promise<Message[]> {
      const rows = await select('messages', (q) =>
        q.select('id, goal_id, day, phase, role, text, meta, created_at').eq('goal_id', goalId).eq('day', day).order('created_at', { ascending: true }),
      );
      return rows.map(messageFromRow);
    },

    /** 최근 회고 2번 답(독촉 재료) 한 건 */
    async fetchLastRetroAnswer(goalId: string): Promise<Message | null> {
      const rows = await select('messages', (q) =>
        q
          .select('id, goal_id, day, phase, role, text, meta, created_at')
          .eq('goal_id', goalId)
          .eq('phase', 'retro')
          .eq('role', 'user')
          .eq('meta->>retro_q', '2')
          .order('created_at', { ascending: false })
          .limit(1),
      );
      return rows[0] ? messageFromRow(rows[0]) : null;
    },

    /** 목표의 단어와 표현 (성과 문장, 결정안 15) */
    async fetchItems(goalId: string): Promise<Item[]> {
      const rows = await select('items', (q) => q.select('*').eq('goal_id', goalId).order('created_at', { ascending: true }).limit(2000));
      return rows.map(itemFromRow);
    },

    /** 목표 항목의 기록. item_events에는 goal_id가 없어 items와 잇는다 */
    async fetchItemEvents(goalId: string): Promise<ItemEvent[]> {
      const rows = await select('item_events', (q) =>
        q
          .select('id, item_id, day, phase, kind, aided, correct, question_type, created_at, items!inner(goal_id)')
          .eq('items.goal_id', goalId)
          .order('created_at', { ascending: true })
          .limit(5000),
      );
      return rows.map(itemEventFromRow);
    },

    /** 기록 카드의 작성 글자 수용. 보이는 목표들에서 내가 쓴 학습, 회고 문장 */
    async fetchWritten(limit = 5000): Promise<WrittenRow[]> {
      const rows = await select('messages', (q) =>
        q.select('goal_id, day, phase, text').eq('role', 'user').in('phase', ['A', 'B', 'C', 'retro']).order('created_at', { ascending: false }).limit(limit),
      );
      return rows.map(writtenFromRow);
    },

    async fetchReflections(day: string): Promise<ReflectionMessage[]> {
      const rows = await select('reflections', (q) => q.select('*').eq('day', day).order('created_at', { ascending: true }));
      return rows.map(reflectionFromRow);
    },

    // ----- Edge Functions (명세 4절) -----

    async goalSetup(messages: GoalSetupLine[]): Promise<GoalSetupReply> {
      return invoke<GoalSetupReply>('goal-setup', { messages });
    },

    /** message가 없으면 B 시작(되짚기 + 첫 질문) */
    async lessonTurn(goalId: string, day: string, message?: { id: string; text: string }): Promise<LessonTurnResult> {
      const r = await invoke<Raw>('lesson-turn', { goal_id: goalId, day, ...(message ? { message } : {}) });
      return { messages: mapMessages(r.messages), modal: (r.modal ?? null) as LessonModal, episode: (r.episode ?? null) as Episode | null };
    },

    async quizNext(goalId: string, day: string, phase: 'A' | 'C'): Promise<QuizQuestion> {
      const r = await invoke<{ question: Raw }>('review-quiz', { goal_id: goalId, day, phase, action: 'next' });
      const q = r.question;
      return {
        id: String(q.id),
        index: Number(q.index ?? 0),
        type: q.type as QuizQuestion['type'],
        prompt: String(q.prompt ?? ''),
        choices: Array.isArray(q.choices) ? (q.choices as string[]) : undefined,
        itemId: typeof q.item_id === 'string' ? q.item_id : null,
        levelCheck: q.level_check === true,
      };
    },

    async quizGrade(goalId: string, day: string, phase: 'A' | 'C', questionId: string, answer: string, aided: boolean): Promise<QuizGrade> {
      const r = await invoke<Raw>('review-quiz', { goal_id: goalId, day, phase, action: 'grade', question_id: questionId, answer, aided });
      return { correct: r.correct === true, feedback: String(r.feedback ?? ''), answerEn: String(r.answer_en ?? ''), modal: r.modal ?? null };
    },

    /** message가 없으면 고정 질문 1 */
    async retro(goalId: string, day: string, message?: { id: string; text: string }): Promise<Message[]> {
      const r = await invoke<Raw>('retro', { goal_id: goalId, day, ...(message ? { message } : {}) });
      return mapMessages(r.messages);
    },

    /** 반성문 채팅. 창이 닫혀 있으면 kind 'closed' */
    async reflection(message?: { id: string; text: string }): Promise<ReflectionMessage[]> {
      const r = await invoke<Raw>('reflection', message ? { message } : {});
      return Array.isArray(r.messages) ? r.messages.map((m) => reflectionFromRow(m as Raw)) : [];
    },

    async deleteAccount(): Promise<void> {
      await invoke('delete-account', {});
    },
  };
}

export type Api = ReturnType<typeof createApi>;
