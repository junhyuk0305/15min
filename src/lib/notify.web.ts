// 웹판: 로컬 알림 예약이 없다. 화면 흐름 확인용으로 권한은 켜진 것으로 본다.
import type { TapData } from './notifyTarget';
import type { Planned } from './plan';

export type Permission = 'granted' | 'denied' | 'undetermined';
export type ExactAlarmState = 'granted' | 'denied' | 'unknown';

export async function setupNotifications() {}
export async function getPermission(): Promise<Permission> {
  return 'granted';
}
export async function requestPermission(): Promise<Permission> {
  return 'granted';
}
export function openSystemSettings() {}
export function getExactAlarm(): ExactAlarmState {
  return 'granted';
}
export async function openExactAlarmSettings() {}
export async function applyPlan(_plan: Planned[]) {}
export async function clearAll() {}
export function onNotificationTap(_go: (tap: TapData) => void): () => void {
  return () => {};
}
