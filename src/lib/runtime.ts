import { create } from 'zustand';
import type { ExactAlarmState, Permission } from './notify';

// 저장하지 않는 실행 중 상태
export const useRuntime = create<{
  inSession: boolean;
  permission: Permission;
  /** Android 정확한 알람 권한. 확인할 수 없으면 'unknown'이고 배너를 띄우지 않는다 */
  exactAlarm: ExactAlarmState;
  /** 화면 위에 잠깐 띄우는 한 줄 안내 (없는 경로 등) */
  notice: string | null;
  setInSession: (v: boolean) => void;
  setPermission: (p: Permission) => void;
  setExactAlarm: (s: ExactAlarmState) => void;
  setNotice: (n: string | null) => void;
}>((set) => ({
  inSession: false,
  permission: 'undetermined',
  exactAlarm: 'unknown',
  notice: null,
  setInSession: (inSession) => set({ inSession }),
  setPermission: (permission) => set({ permission }),
  setExactAlarm: (exactAlarm) => set({ exactAlarm }),
  setNotice: (notice) => set({ notice }),
}));
