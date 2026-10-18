import { create } from 'zustand';
import type { Permission } from './notify';

// 저장하지 않는 실행 중 상태
export const useRuntime = create<{
  inSession: boolean;
  permission: Permission;
  /** 화면 위에 잠깐 띄우는 한 줄 안내 (없는 경로 등) */
  notice: string | null;
  setInSession: (v: boolean) => void;
  setPermission: (p: Permission) => void;
  setNotice: (n: string | null) => void;
}>((set) => ({
  inSession: false,
  permission: 'undetermined',
  notice: null,
  setInSession: (inSession) => set({ inSession }),
  setPermission: (permission) => set({ permission }),
  setNotice: (notice) => set({ notice }),
}));
