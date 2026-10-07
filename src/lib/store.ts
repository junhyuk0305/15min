import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { BUILTIN_BOTS, type Bot } from './bots';
import {
  addDays,
  completeDay,
  dayKeyOf,
  giveupAction,
  giveupExpired,
  newGoal,
  settle,
  spendCoupon,
  type DayRecord,
  type Goal,
  type Msg,
} from './rules';

// MVP는 기기에 저장한다. 삭제된 목표는 화면에서만 숨기고 데이터는 남긴다(status 'deleted').
// 서버를 붙이면 이 보관분이 서버로 간다. 개인정보처리방침에 보관 사실과 기간을 적어야 한다.

type GoalInput = { name: string; reason: string; startMinutes: number; targetMinutes: number; botId: string };

type State = {
  onboarded: boolean;
  goals: Goal[];
  activeGoalId: string | null;
  records: Record<string, DayRecord>;
  customBots: Bot[];
  devOffsetMs: number;
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
  requestGiveup: () => 'wait' | 'deleted';
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

export const useApp = create<State & Actions>()(
  persist(
    (set, get) => {
      const now = () => Date.now() + get().devOffsetMs;
      const active = () => get().goals.find((g) => g.id === get().activeGoalId) ?? null;
      const updateGoal = (g: Goal) => set({ goals: get().goals.map((x) => (x.id === g.id ? g : x)) });
      const todayRec = () => {
        const g = active();
        return g ? get().records[keyOf(g.id, dayKeyOf(now()))] : undefined;
      };
      const putRec = (r: DayRecord) => set({ records: { ...get().records, [keyOf(r.goalId, r.day)]: r } });
      const recordOf = (goalId: string) => (d: string) => get().records[keyOf(goalId, d)];
      const removeGoal = (g: Goal) => {
        updateGoal({ ...g, status: 'deleted', endedAt: now(), giveupSince: null });
        set({ activeGoalId: null });
      };

      return {
        onboarded: false,
        goals: [],
        activeGoalId: null,
        records: {},
        customBots: [],
        devOffsetMs: 0,

        createGoal: (input) => {
          const g = newGoal({ ...input, id: uid(), now: now() });
          set({ goals: [...get().goals, g], activeGoalId: g.id, onboarded: true });
        },

        setTodayBot: (botId) => {
          const g = active();
          if (g) updateGoal({ ...g, botId });
        },

        startDay: (reason) => {
          const g = active();
          if (!g) return;
          const day = dayKeyOf(now());
          const existing = get().records[keyOf(g.id, day)];
          if (existing && existing.status !== 'progress') return;
          const s = g.pendingChange && day >= g.pendingChange.fromDay ? g.pendingChange : g;
          putRec({
            goalId: g.id,
            day,
            status: 'progress',
            reason: reason.trim(),
            review: '',
            activeSeconds: existing?.activeSeconds ?? 0,
            targetMinutes: s.targetMinutes,
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
          const res = completeDay(g);
          updateGoal(res.goal);
          return res.earned;
        },

        takeCoupon: () => {
          const g = active();
          if (!g) return false;
          const spent = spendCoupon(g);
          if (!spent) return false;
          const day = dayKeyOf(now());
          const r = get().records[keyOf(g.id, day)];
          if (r?.status === 'done') return false;
          putRec({
            goalId: g.id, day, status: 'coupon', reason: r?.reason ?? '', review: '', activeSeconds: r?.activeSeconds ?? 0,
            targetMinutes: g.targetMinutes, botId: g.botId, messages: r?.messages ?? [], chars: r?.chars ?? 0, leftAt: null,
          });
          updateGoal(spent);
          return true;
        },

        requestGiveup: () => {
          const g = active();
          if (!g) return 'deleted';
          if (giveupAction(g) === 'delete') {
            removeGoal(g);
            return 'deleted';
          }
          updateGoal({ ...g, giveupCount: g.giveupCount + 1, giveupSince: now() });
          return 'wait';
        },

        withdrawGiveup: () => {
          const g = active();
          if (!g || g.giveupSince === null) return;
          // 대기 중이던 날은 실패로 세지 않는다. 오늘은 아직 열려 있으니 그대로 둔다.
          const today = dayKeyOf(now());
          for (let d = dayKeyOf(g.giveupSince); d < today; d = addDays(d, 1)) {
            const r = get().records[keyOf(g.id, d)];
            if (!r || r.status === 'progress') {
              putRec({
                goalId: g.id, day: d, status: 'paused', reason: r?.reason ?? '', review: '', activeSeconds: r?.activeSeconds ?? 0,
                targetMinutes: g.targetMinutes, botId: g.botId, messages: r?.messages ?? [], chars: r?.chars ?? 0, leftAt: null,
              });
            }
          }
          updateGoal({ ...g, giveupSince: null });
        },

        achieve: () => {
          const g = active();
          if (!g) return;
          updateGoal({ ...g, status: 'achieved', endedAt: now(), giveupSince: null });
          set({ activeGoalId: null });
        },

        changeSchedule: (startMinutes, targetMinutes) => {
          const g = active();
          if (!g) return;
          const fromDay = addDays(dayKeyOf(now()), 1);
          updateGoal({ ...g, pendingChange: { startMinutes, targetMinutes, fromDay } });
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
            removeGoal(g);
            return;
          }
          const s = settle(g, recordOf(g.id), now());
          if (JSON.stringify(s) !== JSON.stringify(g)) updateGoal(s);
        },

        shiftTime: (ms) => set({ devOffsetMs: get().devOffsetMs + ms }),
        resetTime: () => set({ devOffsetMs: 0 }),
      };
    },
    {
      name: 'graego-v1',
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

export function activeGoalOf(s: State): Goal | null {
  return s.goals.find((g) => g.id === s.activeGoalId) ?? null;
}

export function lastEndedGoal(s: State): Goal | null {
  const ended = s.goals.filter((g) => g.status === 'achieved').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  return ended[0] ?? null;
}

export function recordsOf(s: State, goalId: string): DayRecord[] {
  return Object.values(s.records).filter((r) => r.goalId === goalId);
}

export function visibleRecords(s: State): DayRecord[] {
  const visible = new Set(s.goals.filter((g) => g.status !== 'deleted').map((g) => g.id));
  return Object.values(s.records).filter((r) => visible.has(r.goalId));
}

export { keyOf };
