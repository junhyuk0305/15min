// 목표 설정 중인 대화와 값. 앱을 다시 켜도 이어지도록 기기에 저장한다(목표를 만들면 지운다).
// goal-setup 함수는 대화를 저장하지 않는다(무상태). 그래서 대화는 이 기기가 들고 있다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toApiError } from '@/lib/api';
import { copy } from '@/lib/copy';
import { uuidv4, type GoalSetupFields } from '@/lib/model';
import { useApp } from '@/lib/store';
import { api } from '@/lib/supabase';
import { defaultPlan, mergeFields, type Plan, type SetupLine, type SetupStage } from './logic';

type Draft = {
  userId: string | null;
  lines: SetupLine[];
  fields: GoalSetupFields;
  /** 서버가 여섯 항목을 다 채웠다고 답했나 */
  done: boolean;
  subsituations: string[];
  /** 대화 횟수를 다 써서 남은 항목을 직접 쓴다 */
  manual: boolean;
  stage: SetupStage;
  plan: Plan;
};

type Actions = {
  /** 다른 계정의 초안이면 버리고 새로 시작한다 */
  begin: (userId: string | null, last?: Parameters<typeof defaultPlan>[0]) => void;
  /** 사용자 답을 보내고 코치 답을 붙인다. 실패하면 보낸 줄을 빼고 ApiError를 던진다 */
  send: (text: string) => Promise<void>;
  setStage: (stage: SetupStage) => void;
  setPlan: (plan: Plan) => void;
  setField: (key: keyof GoalSetupFields, value: string) => void;
  setManual: () => void;
  reset: () => void;
};

const fresh = (userId: string | null, last?: Parameters<typeof defaultPlan>[0]): Draft => ({
  userId,
  lines: [{ id: uuidv4(), role: 'coach', text: copy.goalSetup.first }],
  fields: {},
  done: false,
  subsituations: [],
  manual: false,
  stage: 'chat',
  plan: defaultPlan(last),
});

export const useGoalDraft = create<Draft & Actions>()(
  persist(
    (set, get) => ({
      // 첫 줄(uuid)은 begin에서 만든다. 모듈을 읽을 때는 crypto 준비 전일 수 있다
      userId: null,
      lines: [],
      fields: {},
      done: false,
      subsituations: [],
      manual: false,
      stage: 'chat',
      plan: defaultPlan(),

      begin: (userId, last) => {
        if (get().userId !== userId || get().lines.length === 0) set(fresh(userId, last));
      },

      send: async (text) => {
        const mine: SetupLine = { id: uuidv4(), role: 'user', text: text.trim() };
        const history = [...get().lines, mine];
        set({ lines: history });
        try {
          const r = await api.goalSetup(history.map(({ role, text: t }) => ({ role, text: t })));
          const coach: SetupLine = { id: uuidv4(), role: 'coach', text: r.reply };
          const done = r.done === true;
          set({
            lines: [...get().lines, coach],
            fields: mergeFields(get().fields, r.fields),
            done,
            subsituations: done && Array.isArray(r.subsituations) ? r.subsituations : get().subsituations,
            stage: done ? 'plan' : get().stage,
          });
        } catch (e) {
          set({ lines: get().lines.filter((l) => l.id !== mine.id) });
          const err = toApiError(e);
          // 정지가 서버에서 오면 프로필을 다시 읽어 라우팅이 반성문 화면으로 바뀌게 한다
          if (err.kind === 'suspended' || err.kind === 'banned') void useApp.getState().refresh();
          throw err;
        }
      },

      setStage: (stage) => set({ stage }),
      setPlan: (plan) => set({ plan }),
      setField: (key, value) => set({ fields: { ...get().fields, [key]: value } }),
      setManual: () => set({ manual: true }),
      // 다음 목표 때 begin이 지난 목표의 시각으로 새로 채운다
      reset: () => set({ userId: null, lines: [], fields: {}, done: false, subsituations: [], manual: false, stage: 'chat' }),
    }),
    {
      name: 'graego-goal-setup-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s): Draft => ({
        userId: s.userId,
        lines: s.lines,
        fields: s.fields,
        done: s.done,
        subsituations: s.subsituations,
        manual: s.manual,
        stage: s.stage,
        plan: s.plan,
      }),
    },
  ),
);
