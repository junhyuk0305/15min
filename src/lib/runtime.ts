import { create } from 'zustand';
import { openSystemSettings, requestPermission, type ExactAlarmState, type Permission } from './notify';

// 저장하지 않는 실행 중 상태
export const useRuntime = create<{
  inSession: boolean;
  /** 알림 권한. 아직 읽지 않았으면 null(앱 시작 직후, 읽기 실패) */
  permission: Permission | null;
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
  permission: null,
  exactAlarm: 'unknown',
  notice: null,
  setInSession: (inSession) => set({ inSession }),
  setPermission: (permission) => set({ permission }),
  setExactAlarm: (exactAlarm) => set({ exactAlarm }),
  setNotice: (notice) => set({ notice }),
}));

/**
 * 알림 켜기(설정 알림 줄, 홈 배너). 아직 묻지 않았으면(undetermined) 권한 창을 띄우고, 거부했으면 시스템 설정을 연다.
 * iOS는 한 번도 묻지 않은 앱을 알림 설정 목록에 두지 않아 설정만 열면 켤 수 없다(U9 Q2).
 */
export async function turnOnNotifications() {
  const { permission, setPermission } = useRuntime.getState();
  if (permission === 'undetermined') setPermission(await requestPermission());
  else openSystemSettings();
}
