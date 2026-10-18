// Android 정확한 알람 권한(SCHEDULE_EXACT_ALARM) 확인. 로컬 Expo 모듈이라 개발 빌드나 스토어 빌드에서만 있다.
// iOS, 웹, Expo Go에는 네이티브 모듈이 없다. 그때 Android는 'unknown', 나머지는 'granted'로 본다.
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type ExactAlarmState = 'granted' | 'denied' | 'unknown';

type ExactAlarmNative = { canScheduleExactAlarms(): boolean | null };

const native = Platform.OS === 'android' ? requireOptionalNativeModule<ExactAlarmNative>('ExactAlarm') : null;

export function exactAlarmState(): ExactAlarmState {
  if (Platform.OS !== 'android') return 'granted';
  if (!native) return 'unknown';
  const v = native.canScheduleExactAlarms();
  return v === true ? 'granted' : v === false ? 'denied' : 'unknown';
}
