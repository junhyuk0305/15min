// 서버 데이터의 캐시 (MP 4절, P4). 상태 변경은 api(RPC, Edge Function) 응답으로만 갱신한다.
// 낙관적 갱신은 보내는 메시지 표시에만 쓴다. 화면은 이 store만 보고, 서버 호출은 여기 액션으로만 한다.
//
// 읽기:   useApp(s => s.goal) 처럼 고른다. 계산 값은 selectors.ts(todayRowOf, goalDaysOf ...)와 아래 도우미를 쓴다.
// 갱신:   boot()은 앱 시작, refresh()는 포그라운드 복귀와 당겨서 새로고침. 둘 다 settle_me 뒤 다시 읽는다.
// 오류:   액션은 실패하면 ApiError를 던진다. 화면은 errorText(e)로 두 문장 안내를 띄운다.
//         읽기 실패는 loadFailed, offline, error 플래그로 남고 캐시는 그대로 보인다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ApiError, TERMS_VERSION, toApiError, type ApiErrorKind, type LoginMethod } from './api';
import {
  dayKeyId,
  mergeById,
  upsertDay,
  uuidv4,
  type AppGoal,
  type GoalInput,
  type LessonModal,
  type Episode,
  type Message,
  type QuizGrade,
  type QuizQuestion,
  type ReflectionMessage,
} from './model';
import type { WrittenRow } from './archive';
import type { Item, ItemEvent, Phase } from './rules';
import {
  EMPTY_CACHE,
  goalDaysOf,
  nextSuspendedGoal,
  serverOffsetOf,
  todayKeyOf,
  todayRowOf,
  type Cache,
} from './selectors';
import { api, configMissing, onAuthLost, supabase } from './supabase';

/** 기기 시간대. 서버 프로필에 시작할 때마다 알린다(set_timezone) */
export const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

type Flags = {
  /** 이 기기에서 온보딩을 끝냈나 (저장) */
  onboarded: boolean;
  /** 세션이 있나 */
  authed: boolean;
  /** 세션 확인과 첫 읽기 시도가 끝났나. 그전까지 스플래시를 유지한다 */
  booted: boolean;
  loading: boolean;
  /** 마지막 읽기가 실패했나. 캐시를 보이며 배너를 띄운다 */
  loadFailed: boolean;
  /** 마지막 실패가 네트워크나 시간 초과였나 */
  offline: boolean;
  error: ApiError | null;
  /** 서버 시각 - 기기 시각 (ms) */
  serverOffset: number;
  /** 개발 빌드 전용 시간 이동. 프로덕션에서는 now()에 더하지 않는다 */
  devOffsetMs: number;
  /** 반성문 채팅 (정지 중) */
  reflections: ReflectionMessage[];
  /** 로그인 직후 첫 읽기 중. 라우팅을 잠시 멈춰 홈이 비쳤다 바뀌지 않게 한다 */
  signingIn: boolean;
};

type Actions = {
  boot: () => Promise<void>;
  refresh: () => Promise<void>;
  syncTime: () => Promise<void>;
  onSession: (session: Session | null) => void;
  finishOnboarding: () => void;

  /** 심사용 데모 이메일이면 'password' */
  loginMethod: (email: string) => Promise<LoginMethod>;
  /** 6자리 코드 메일. 가입 동의 3개는 화면이 확인한 뒤 부른다 */
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;

  createGoal: (input: GoalInput) => Promise<AppGoal>;
  startDay: (reason: string) => Promise<void>;
  saveProgress: (activeSeconds: number, phase: Phase) => Promise<void>;
  startRetro: () => Promise<void>;
  saveRetroProgress: (seconds: number) => Promise<void>;
  /** 하루 완료. 쿠폰을 받았으면 true */
  completeDay: () => Promise<boolean>;
  spendCoupon: () => Promise<void>;
  requestGiveup: () => Promise<void>;
  withdrawGiveup: () => Promise<void>;
  declareAchievement: () => Promise<AppGoal>;
  changeSchedule: (startMinutes: number, targetMinutes: number, weekdays: number[]) => Promise<void>;

  /**
   * B 단계. text가 없으면 시작(되짚기 + 첫 질문, 또는 오늘 대화).
   * id는 보낼 메시지 id. 실패한 문장을 다시 보낼 때 같은 id를 넣으면 서버가 한 번만 저장한다.
   * messages는 이번 응답으로 받은 행(내 문장, 코치, 상대)이다.
   */
  lessonTurn: (text?: string, id?: string) => Promise<{ messages: Message[]; modal: LessonModal; episode: Episode | null }>;
  /** 회고 대화. text가 없으면 고정 질문 1. id는 lessonTurn과 같다 */
  retroTurn: (text?: string, id?: string) => Promise<void>;
  /** A, C 복습 문항. 채점 안 된 문항이 있으면 그 문항을 다시 준다 */
  quizNext: (phase: 'A' | 'C') => Promise<QuizQuestion>;
  /** 채점. aided는 항목 설명을 본 뒤의 답(결정안 12) */
  quizGrade: (phase: 'A' | 'C', questionId: string, answer: string, aided: boolean) => Promise<QuizGrade>;
  /** 성과 문장용 항목과 기록(활성 목표). 캐시하지 않는다 */
  loadItems: () => Promise<{ items: Item[]; events: ItemEvent[] }>;
  /** 기록 탭 글자 수용. 내가 쓴 학습, 회고 문장. 캐시하지 않는다 */
  loadWritten: () => Promise<WrittenRow[]>;
  loadDayMessages: (goalId: string, day: string) => Promise<void>;
  reportMessage: (messageId: string, reason: string) => Promise<void>;
  /** 반성문. text가 없으면 오늘 대화를 불러온다 */
  reflectionTurn: (text?: string) => Promise<void>;

  setLeftAt: (at: number | null) => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;

  shiftTime: (ms: number) => void;
  resetTime: () => void;
};

export type AppState = Cache & Flags & Actions;

const NETWORK_KINDS: ApiErrorKind[] = ['network', 'timeout'];

export const useApp = create<AppState>()(
  persist(
    (set, get) => {
      const now = () => nowMs();
      const today = () => todayKeyOf(get(), now(), deviceTz);
      const requireGoal = () => {
        const g = get().goal;
        if (!g) throw new ApiError('invalid', 'not_found');
        return g;
      };

      /** 액션 공통: 정지나 영구 정지가 서버에서 오면 프로필을 다시 읽어 라우팅이 바뀌게 한다 */
      async function act<T>(run: () => Promise<T>): Promise<T> {
        try {
          return await run();
        } catch (e) {
          const err = toApiError(e);
          if (err.kind === 'suspended' || err.kind === 'banned') void get().refresh();
          throw err;
        }
      }

      /** 로그인 뒤 서버 시각, 시간대, 첫 읽기까지 마친다. 그동안 라우팅을 멈춘다 */
      async function signIn(run: () => Promise<Session>) {
        set({ signingIn: true });
        try {
          const session = await act(run);
          get().onSession(session);
          await Promise.allSettled([get().syncTime(), api.setTimezone(deviceTz).then((profile) => set({ profile }))]);
          await get().refresh();
        } finally {
          set({ signingIn: false });
        }
      }

      const putMessages = (goalId: string, day: string, incoming: Message[], dropId?: string) => {
        const key = dayKeyId(goalId, day);
        const current = (get().messages[key] ?? []).filter((m) => m.id !== dropId);
        set({ messages: { ...get().messages, [key]: mergeById(current, incoming) } });
      };

      const optimistic = (goalId: string, day: string, phase: Message['phase'], text: string, id = uuidv4()): Message => {
        const m: Message = { id, goalId, day, phase, role: 'user', text: text.trim(), meta: {}, createdAt: now(), pending: true };
        putMessages(goalId, day, [m]);
        return m;
      };

      return {
        ...EMPTY_CACHE,
        onboarded: false,
        authed: false,
        booted: false,
        loading: false,
        loadFailed: false,
        offline: false,
        error: null,
        serverOffset: 0,
        devOffsetMs: 0,
        reflections: [],
        signingIn: false,

        boot: async () => {
          try {
            if (configMissing) return;
            const session = await api.getSession();
            get().onSession(session);
            if (!session) return;
            await Promise.allSettled([get().syncTime()]);
            // 기기 시간대를 알린다. 다르면 서버가 다음 학습일부터 적용한다(명세 1절)
            await api.setTimezone(deviceTz).then(
              (profile) => set({ profile }),
              (e: unknown) => set({ error: toApiError(e) }),
            );
            await get().refresh();
          } catch (e) {
            set({ loadFailed: true, error: toApiError(e) });
          } finally {
            set({ booted: true });
          }
        },

        refresh: async () => {
          if (!get().authed) return;
          set({ loading: true });
          try {
            await api.settleMe();
            const [profile, goals, days] = await Promise.all([api.fetchProfile(), api.fetchGoals(), api.fetchDays()]);
            const prev = get();
            const goal = goals.find((g) => g.status === 'active') ?? null;
            const lastGoal = goals.filter((g) => g.status === 'achieved').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0] ?? null;
            set({
              profile,
              goal,
              lastGoal,
              goals,
              days,
              suspendedGoal: nextSuspendedGoal(prev, profile),
              loadFailed: false,
              offline: false,
              error: null,
            });
            if (goal) {
              const day = today();
              const [msgs, retro] = await Promise.all([
                goalDaysOf(get()).some((d) => d.day === day) ? api.fetchMessages(goal.id, day) : Promise.resolve([]),
                api.fetchLastRetroAnswer(goal.id),
              ]);
              putMessages(goal.id, day, msgs);
              set({ lastRetro: retro?.text ?? null });
            }
          } catch (e) {
            const err = toApiError(e);
            set({ loadFailed: true, offline: NETWORK_KINDS.includes(err.kind), error: err });
          } finally {
            set({ loading: false });
          }
        },

        syncTime: async () => {
          const sentAt = Date.now();
          const server = await api.serverNow();
          set({ serverOffset: serverOffsetOf(sentAt, Date.now(), server) });
        },

        onSession: (session) => {
          const userId = session?.user.id ?? null;
          if (!userId) {
            set({ authed: false });
            return;
          }
          // 다른 계정으로 들어오면 앞 계정의 캐시를 버린다
          if (get().userId && get().userId !== userId) set({ ...EMPTY_CACHE, reflections: [] });
          set({ authed: true, userId });
        },

        finishOnboarding: () => set({ onboarded: true }),

        loginMethod: (email) => act(() => api.loginMethod(email)),

        sendCode: (email) =>
          act(() => api.sendCode(email, { age_confirmed: true, ai_consent: true, terms_version: TERMS_VERSION, timezone: deviceTz })),

        verifyCode: (email, code) => signIn(() => api.verifyCode(email, code)),

        signInWithPassword: (email, password) => signIn(() => api.signInWithPassword(email, password)),

        createGoal: (input) =>
          act(async () => {
            const goal = await api.createGoal(input);
            set({ goal, goals: [goal, ...get().goals.filter((g) => g.id !== goal.id)] });
            return goal;
          }),

        startDay: (reason) =>
          act(async () => {
            const row = await api.startDay(requireGoal().id, reason);
            set({ days: upsertDay(get().days, row) });
          }),

        saveProgress: (activeSeconds, phase) =>
          act(async () => {
            const g = requireGoal();
            const row = await api.saveProgress(g.id, today(), activeSeconds, phase);
            set({ days: upsertDay(get().days, row) });
          }),

        startRetro: () =>
          act(async () => {
            const row = await api.startRetro(requireGoal().id, today());
            set({ days: upsertDay(get().days, row) });
          }),

        saveRetroProgress: (seconds) =>
          act(async () => {
            const row = await api.saveRetroProgress(requireGoal().id, today(), seconds);
            set({ days: upsertDay(get().days, row) });
          }),

        completeDay: () =>
          act(async () => {
            const g = requireGoal();
            const r = await api.completeDay(g.id, today());
            set({ days: upsertDay(get().days, r.day), goal: { ...g, coupons: r.coupons }, leftAt: null });
            void get().refresh(); // 쿠폰 진행일은 목표 행을 다시 읽어야 안다
            return r.couponEarned;
          }),

        spendCoupon: () =>
          act(async () => {
            const g = requireGoal();
            const r = await api.spendCoupon(g.id);
            set({ goal: { ...g, coupons: r.coupons, couponProgressDays: 0 }, leftAt: null });
            await get().refresh(); // 오늘 행(coupon)은 서버가 만들었다
          }),

        requestGiveup: () =>
          act(async () => {
            const goal = await api.requestGiveup(requireGoal().id);
            set({ goal });
          }),

        withdrawGiveup: () =>
          act(async () => {
            const goal = await api.withdrawGiveup(requireGoal().id);
            set({ goal });
            void get().refresh(); // 대기 중이던 날의 판정(giveup_wait)
          }),

        declareAchievement: () =>
          act(async () => {
            const goal = await api.declareAchievement(requireGoal().id);
            set({ goal: null, lastGoal: goal, goals: get().goals.map((g) => (g.id === goal.id ? goal : g)) });
            return goal;
          }),

        changeSchedule: (startMinutes, targetMinutes, weekdays) =>
          act(async () => {
            const goal = await api.changeSchedule(requireGoal().id, startMinutes, targetMinutes, weekdays);
            set({ goal });
          }),

        lessonTurn: (text, id) =>
          act(async () => {
            const g = requireGoal();
            const day = today();
            const mine = text ? optimistic(g.id, day, 'B', text, id) : null;
            try {
              const r = await api.lessonTurn(g.id, day, mine ? { id: mine.id, text: mine.text } : undefined);
              putMessages(g.id, day, r.messages, mine?.id);
              return r;
            } catch (e) {
              if (mine) putMessages(g.id, day, [], mine.id); // 화면이 입력창에 문장을 되돌린다
              throw e;
            }
          }),

        quizNext: (phase) => act(() => api.quizNext(requireGoal().id, today(), phase)),

        quizGrade: (phase, questionId, answer, aided) =>
          act(() => api.quizGrade(requireGoal().id, today(), phase, questionId, answer.trim(), aided)),

        loadWritten: () => act(() => api.fetchWritten()),

        loadItems: () =>
          act(async () => {
            const g = requireGoal();
            const [items, events] = await Promise.all([api.fetchItems(g.id), api.fetchItemEvents(g.id)]);
            return { items, events };
          }),

        retroTurn: (text, id) =>
          act(async () => {
            const g = requireGoal();
            const day = today();
            const mine = text ? optimistic(g.id, day, 'retro', text, id) : null;
            try {
              const msgs = await api.retro(g.id, day, mine ? { id: mine.id, text: mine.text } : undefined);
              putMessages(g.id, day, msgs, mine?.id);
              const answer = msgs.find((m) => m.role === 'user' && m.meta.retro_q === 2);
              if (answer) set({ lastRetro: answer.text });
            } catch (e) {
              if (mine) putMessages(g.id, day, [], mine.id);
              throw e;
            }
          }),

        loadDayMessages: (goalId, day) =>
          act(async () => {
            putMessages(goalId, day, await api.fetchMessages(goalId, day));
          }),

        reportMessage: (messageId, reason) => act(() => api.reportMessage(messageId, reason)),

        reflectionTurn: (text) =>
          act(async () => {
            if (!text) {
              set({ reflections: await api.reflection() });
              return;
            }
            const mine: ReflectionMessage = { id: uuidv4(), day: '', role: 'user', text: text.trim(), createdAt: now(), pending: true };
            set({ reflections: [...get().reflections, mine] });
            try {
              const msgs = await api.reflection({ id: mine.id, text: mine.text });
              set({ reflections: mergeById(get().reflections.filter((m) => m.id !== mine.id), msgs) });
            } catch (e) {
              set({ reflections: get().reflections.filter((m) => m.id !== mine.id) });
              throw e;
            }
          }),

        setLeftAt: (at) => set({ leftAt: at === null ? null : { day: today(), at } }),

        signOut: async () => {
          try {
            await api.signOut();
          } finally {
            set({ ...EMPTY_CACHE, reflections: [], authed: false, loadFailed: false, offline: false, error: null });
          }
        },

        deleteAccount: () =>
          act(async () => {
            await api.deleteAccount();
            await get().signOut();
          }),

        shiftTime: (ms) => {
          if (__DEV__) set({ devOffsetMs: get().devOffsetMs + ms });
        },
        resetTime: () => {
          if (__DEV__) set({ devOffsetMs: 0 });
        },
      };
    },
    {
      // 서버 캐시 모양으로 바뀌어 새 키를 쓴다. 옛 기기 저장 데이터(graego-v2)는 읽지 않는다
      name: 'graego-cache-v3',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s): Cache & Pick<Flags, 'onboarded'> => ({
        onboarded: s.onboarded,
        userId: s.userId,
        profile: s.profile,
        goal: s.goal,
        lastGoal: s.lastGoal,
        goals: s.goals,
        days: s.days,
        messages: s.messages,
        lastRetro: s.lastRetro,
        suspendedGoal: s.suspendedGoal,
        leftAt: s.leftAt,
      }),
    },
  ),
);

// 세션이 바뀌면(로그인, 로그아웃, 갱신 실패) store에 알린다
supabase?.auth.onAuthStateChange((_event, session) => {
  useApp.getState().onSession(session);
});
onAuthLost(() => useApp.getState().onSession(null));

/** 서버 기준 현재 시각. 개발 빌드에서만 시간 이동을 더한다(MP 3절) */
export function nowMs(): number {
  const s = useApp.getState();
  return Date.now() + s.serverOffset + (__DEV__ ? s.devOffsetMs : 0);
}

// ---------- 화면용 도우미 ----------

export const todayKey = (s: AppState = useApp.getState()) => todayKeyOf(s, nowMs(), deviceTz);
export const todayRow = (s: AppState = useApp.getState()) => todayRowOf(s, nowMs(), deviceTz);
export const tzOf = (s: Pick<AppState, 'profile'>) => s.profile?.timezone ?? deviceTz;
export { goalDaysOf, todayRowOf, todayKeyOf };
export const messagesOf = (s: AppState, goalId: string, day: string): Message[] => s.messages[dayKeyId(goalId, day)] ?? [];
