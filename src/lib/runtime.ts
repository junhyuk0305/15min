import { create } from 'zustand';
import type { Permission } from './notify';

// 저장하지 않는 실행 중 상태
export const useRuntime = create<{
  inSession: boolean;
  permission: Permission;
  setInSession: (v: boolean) => void;
  setPermission: (p: Permission) => void;
}>((set) => ({
  inSession: false,
  permission: 'undetermined',
  setInSession: (inSession) => set({ inSession }),
  setPermission: (permission) => set({ permission }),
}));
