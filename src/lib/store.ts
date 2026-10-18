import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { BUILTIN_BOTS, type Bot } from './bots';
import {
  addDays,
  completeDayCoupon,
  dayKeyOf,
  FIRST_COUPON_WEEKS,
  firstDayFor,
  giveupExpired,
  INITIAL_COUPONS,
  PERIOD_DEFAULT,
  settingsFor,
  settle,
  spendCoupon,
  type DayStatus,
  type Goal,
} from './rules';

// MVP는 기기에 저장한다. 포기 확정된 목표는 화면에서만 숨기고 데이터는 남긴다(status 'given_up').
// 다음 단계에서 서버 데이터 계층으로 바뀐다. 그때까지 v9 규칙을 기기에서 따르는 임시 저장소다.

export type Msg = { role: 'user' | 'bot'; text: string; at: number };

/** 기기에 저장하는 하루 기록 */
export type DayRecord = {
  goalId: string;
  day: string;
  status: DayStatus;
  reason: string;
  review: string;
  activeSeconds: number;
  targetMinutes: number;
  botId: string;
  messages: Msg[];
  chars: number;
  leftAt: number | null;
};

/** 기기에 저장하는 목표. 서버 Goal 모양에 봇 선택만 더했다 */
export type AppGoal = Goal & { botId: string };

/** 기기 시간대. 서버 계층에서는 profiles.timezone을 쓴다 */
export const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

// [가정] 요일 선택 화면이 생기기 전까지 기기 저장 목표는 7일 모두 학습 요일로 둔다
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

type GoalInput = { name: string; reason: string; startMinutes: number; targetMinutes: number; botId: string };

type State = {
  onboarded: boolean;
  goals: AppGoal[];
  activeGoalId: string | null;
  records: Record<string, DayRecord>;
  customBots: Bot[];
  devOffsetMs: number;
  /** 계정당 포기 확정 횟수 */
  giveupConfirmedCount: number;
};

type Actions = {
  createGoal: (input: GoalInput) => void;
  setTodayBot: (botId: string) => void;
  startDay: (reason: string) => void;
  addMessage: (m: Msg, chars?: number) => void;
  setActiveSeconds: (sec: number) => void;
  setLeftAt: (t: number | null) => void;
  finishDay: (review: string) => boolean;
  takeCoupon: () => boolean;
  requestGiveup: () => void;
  withdrawGiveup: () => void;
  achieve: () => void;
  changeSchedule: (startMinutes: number, targetMinutes: number) => void;
  saveBot: (bot: Bot) => void;
  removeBot: (id: string) => void;
  settleAll: () => void;
  shiftTime: (ms: number) => void;
  resetTime: () => void;
};

const keyOf = (goalId: string, day: string) => `${goalId}:${day}`;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function newGoal(input: GoalInput, id: string, now: number): AppGoal {
  const firstDay = firstDayFor(now, deviceTz);
  return {
    id,
    name: input.name.trim(),
    reason: input.reason.trim(),
    periodDays: PERIOD_DEFAULT,
    weekdays: ALL_WEEKDAYS,
    startMinutes: input.startMinutes,
    targetMinutes: input.targetMinutes,
    situation: { place: '', myRole: '', partner: '', task: '' },
    firstDay,
    status: 'active',
    coupons: INITIAL_COUPONS,
    couponStreakGoalWeeks: FIRST_COUPON_WEEKS,
    couponProgressDays: 0,
    settledDay: addDays(firstDay, -1),
    pendingChange: null,
    giveupRequestedAt: null,
    createdAt: now,
    endedAt: null,
    botId: input.botId,
  };
}

const blankRec = (g: AppGoal, day: string, status: DayStatus): DayRecord => ({
  goalId: g.id,
  day,
  status,
  reason: '',
  review: '',
  activeSeconds: 0,
  targetMinutes: settingsFor(g, day).targetMinutes,
  botId: g.botId,
  messages: [],
  chars: 0,
  leftAt: null,
});

export const useApp = create<State & Actions>()(
  persist(
    (set, get) => {
      const now = () => Date.now() + get().devOffsetMs;
      const today = () => dayKeyOf(now(), deviceTz);
      const active = () => get().goals.find((g) => g.id === get().activeGoalId) ?? null;
      const updateGoal = (g: AppGoal) => set({ goals: get().goals.map((x) => (x.id === g.id ? g : x)) });
      const todayRec = () => {
        const g = active();
        return g ? get().records[keyOf(g.id, today())] : undefined;
      };
      const putRec = (r: DayRecord) => set({ records: { ...get().records, [keyOf(r.goalId, r.day)]: r } });
      /** 끝난 날을 판정하고 그 결과를 기록에 남긴다 */
      const settleGoal = (g: AppGoal): AppGoal => {
        const r = settle(g, recordsOf(get(), g.id), today(), deviceTz);
        for (const w of r.writes) {
          putRec({ ...(get().records[keyOf(g.id, w.day)] ?? blankRec(g, w.day, w.status)), status: w.status, leftAt: null });
        }
        return { ...g, ...r.goal };
      };

      return {
        onboarded: false,
        goals: [],
        activeGoalId: null,
        records: {},
        customBots: [],
        devOffsetMs: 0,
        giveupConfirmedCount: 0,

        createGoal: (input) => {
          const g = newGoal(input, uid(), now());
          set({ goals: [...get().goals, g], activeGoalId: g.id, onboarded: true });
        },

        setTodayBot: (botId) => {
          const g = active();
          if (g) updateGoal({ ...g, botId });
        },

        startDay: (reason) => {
          const g = active();
          if (!g) return;
          const day = today();
          if (day < g.firstDay) return;
          const existing = get().records[keyOf(g.id, day)];
          if (existing && existing.status !== 'progress') return;
          putRec({
            goalId: g.id,
            day,
            status: 'progress',
            reason: reason.trim(),
            review: '',
            activeSeconds: existing?.activeSeconds ?? 0,
            targetMinutes: settingsFor(g, day).targetMinutes,
            botId: g.botId,
            messages: existing?.messages ?? [],
            chars: existing?.chars ?? 0,
            leftAt: null,
          });
        },

        addMessage: (m, chars = 0) => {
          const r = todayRec();
          if (r) putRec({ ...r, messages: [...r.messages, m], chars: r.chars + chars });
        },

        setActiveSeconds: (sec) => {
          const r = todayRec();
          if (r && r.status === 'progress') putRec({ ...r, activeSeconds: Math.min(sec, r.targetMinutes * 60) });
        },

        setLeftAt: (t) => {
          const r = todayRec();
          if (r && r.status === 'progress') putRec({ ...r, leftAt: t });
        },

        finishDay: (review) => {
          const g = active();
          const r = todayRec();
          if (!g || !r || r.status !== 'progress') return false;
          putRec({ ...r, status: 'done', review: review.trim(), leftAt: null });
          const res = completeDayCoupon(g);
          updateGoal({ ...g, ...res.goal });
          return res.earned;
        },

        takeCoupon: () => {
          const g = active();
          if (!g) return false;
          const spent = spendCoupon(g);
          if (!spent) return false;
          const day = today();
          const r = get().records[keyOf(g.id, day)];
          if (r?.status === 'done') return false;
          putRec({ ...(r ?? blankRec(g, day, 'coupon')), status: 'coupon', leftAt: null });
          updateGoal({ ...g, ...spent });
          return true;
        },

        requestGiveup: () => {
          const g = active();
          if (g && g.giveupRequestedAt === null) updateGoal({ ...g, giveupRequestedAt: now() });
        },

        withdrawGiveup: () => {
          const g = active();
          if (!g || g.giveupRequestedAt === null) return;
          // 대기 중이던 지난 날은 판정에서 giveup_wait로 남는다. 오늘은 아직 열려 있으니 그대로 둔다.
          updateGoal({ ...settleGoal(g), giveupRequestedAt: null });
        },

        achieve: () => {
          const g = active();
          if (!g) return;
          updateGoal({ ...g, status: 'achieved', endedAt: now(), giveupRequestedAt: null });
          set({ activeGoalId: null });
        },

        changeSchedule: (startMinutes, targetMinutes) => {
          const g = active();
          if (!g) return;
          const fromDay = addDays(today(), 1);
          const weekdays = (g.pendingChange ?? g).weekdays;
          updateGoal({ ...g, pendingChange: { startMinutes, targetMinutes, weekdays, fromDay } });
        },

        saveBot: (bot) => {
          const list = get().customBots;
          const exists = list.some((b) => b.id === bot.id);
          set({ customBots: exists ? list.map((b) => (b.id === bot.id ? bot : b)) : [...list, { ...bot, id: bot.id || uid() }] });
        },

        removeBot: (id) => {
          set({ customBots: get().customBots.filter((b) => b.id !== id) });
          const g = active();
          if (g && g.botId === id) updateGoal({ ...g, botId: BUILTIN_BOTS[0].id });
        },

        settleAll: () => {
          const g = active();
          if (!g) return;
          if (giveupExpired(g, now())) {
            // 포기 확정. 이용 정지 화면은 서버 계층과 함께 붙는다
            updateGoal({ ...settleGoal(g), status: 'given_up', endedAt: now() });
            set({ activeGoalId: null, giveupConfirmedCount: get().giveupConfirmedCount + 1 });
            return;
          }
          const s = settleGoal(g);
          if (JSON.stringify(s) !== JSON.stringify(g)) updateGoal(s);
        },

        shiftTime: (ms) => set({ devOffsetMs: get().devOffsetMs + ms }),
        resetTime: () => set({ devOffsetMs: 0 }),
      };
    },
    {
      // v9에서 목표와 기록 모양이 바뀌어 새 키를 쓴다
      name: 'graego-v2',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export const nowMs = () => Date.now() + useApp.getState().devOffsetMs;

export function allBots(custom: Bot[]): Bot[] {
  return [...BUILTIN_BOTS, ...custom];
}

export function findBot(custom: Bot[], id: string): Bot {
  return allBots(custom).find((b) => b.id === id) ?? BUILTIN_BOTS[0];
}

export function activeGoalOf(s: State): AppGoal | null {
  return s.goals.find((g) => g.id === s.activeGoalId) ?? null;
}

export function lastEndedGoal(s: State): AppGoal | null {
  const ended = s.goals.filter((g) => g.status === 'achieved').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  return ended[0] ?? null;
}

export function recordsOf(s: State, goalId: string): DayRecord[] {
  return Object.values(s.records).filter((r) => r.goalId === goalId);
}

export function visibleRecords(s: State): DayRecord[] {
  const visible = new Set(s.goals.filter((g) => g.status !== 'given_up').map((g) => g.id));
  return Object.values(s.records).filter((r) => visible.has(r.goalId));
}

/** 가장 최근 회고. 기기 저장 단계에서는 회고 글 하나를 쓴다 */
export function lastRetroOf(s: State, goalId: string): string | null {
  const withReview = recordsOf(s, goalId).filter((r) => r.review).sort((a, b) => (a.day < b.day ? 1 : -1));
  return withReview[0]?.review ?? null;
}

export { keyOf };
