// 처음 안내를 이미 봤는지(메가프롬프트 3절 "처음 안내"). 기기 기준이라 로그아웃해도 지우지 않는다.
// store.ts와 따로 둔 작은 저장소다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type Tips = {
  seenTips: string[];
  /** 저장소 읽기가 끝났는지. 읽기에 실패해도 true가 된다(persist의 hasHydrated는 실패하면 false로 남는다) */
  ready: boolean;
  markSeen: (id: string) => void;
  resetTips: () => void;
};

export const useTips = create<Tips>()(
  persist(
    (set, get) => ({
      seenTips: [],
      ready: false,
      markSeen: (id) => {
        if (!get().seenTips.includes(id)) set({ seenTips: [...get().seenTips, id] });
      },
      resetTips: () => set({ seenTips: [] }),
    }),
    {
      name: 'graego-tips-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ seenTips: s.seenTips }),
      onRehydrateStorage: () => () => useTips.setState({ ready: true }),
    },
  ),
);

export const seen = (id: string) => useTips.getState().seenTips.includes(id);
export const markSeen = (id: string) => useTips.getState().markSeen(id);
export const resetTips = () => useTips.getState().resetTips();

/** 화면에서 읽는 훅. 저장소를 다 읽기 전에는 본 것으로 둔다(안내가 잠깐 떴다 사라지지 않게) */
export function useTipSeen(id: string): boolean {
  const ready = useTips((s) => s.ready);
  const has = useTips((s) => s.seenTips.includes(id));
  return !ready || has;
}
