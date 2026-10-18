// 네이티브(iOS, Android) 로컬 알림. 웹판은 notify.web.ts.
import Constants from 'expo-constants';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { exactAlarmState, type ExactAlarmState } from '../../modules/exact-alarm';
import { copy } from './copy';
import type { TapData } from './notifyTarget';
import { MAX_PENDING, type Planned } from './plan';
import { reportError } from './report';

export type Permission = 'granted' | 'denied' | 'undetermined';
export type { ExactAlarmState };

const CHANNEL = 'nag';

let channelJob: Promise<unknown> | null = null;

/** Android 13은 채널이 있어야 권한 창이 뜬다. 권한을 묻기 전에 한 번 만든다 */
function ensureChannel(): Promise<unknown> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelJob) {
    channelJob = Notifications.setNotificationChannelAsync(CHANNEL, {
      name: copy.notify.channel,
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
    }).catch((e: unknown) => {
      channelJob = null;
      throw e;
    });
  }
  return channelJob;
}

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  await ensureChannel();
}

function toPermission(p: Notifications.NotificationPermissionsStatus): Permission {
  if (Platform.OS === 'ios' && p.ios) {
    const s = p.ios.status;
    if (s === Notifications.IosAuthorizationStatus.AUTHORIZED || s === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    if (s === Notifications.IosAuthorizationStatus.DENIED) return 'denied';
    return 'undetermined';
  }
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

export async function getPermission(): Promise<Permission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

export async function requestPermission(): Promise<Permission> {
  await ensureChannel();
  return toPermission(
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
  );
}

export function openSystemSettings() {
  void Linking.openSettings();
}

/** Android 정확한 알람 권한. 네이티브 모듈이 없으면(Expo Go) 'unknown' */
export function getExactAlarm(): ExactAlarmState {
  try {
    return exactAlarmState();
  } catch (e) {
    reportError(e, 'exact-alarm');
    return 'unknown';
  }
}

/** "알람 및 리마인더" 설정 화면. 사용자가 돌아오면 끝난다. 열지 못하면 앱 설정을 연다 */
export async function openExactAlarmSettings() {
  const pkg = Constants.expoConfig?.android?.package;
  try {
    await startActivityAsync(ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM, pkg ? { data: `package:${pkg}` } : undefined);
  } catch (e) {
    reportError(e, 'exact-alarm');
    await Linking.openSettings();
  }
}

/** 예약된 알림을 모두 지우고 계획대로 다시 건다. iOS 대기 상한(64)을 넘지 않게 자른다 */
export async function applyPlan(plan: Planned[]) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await ensureChannel();
  for (const p of plan.slice(0, MAX_PENDING)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: copy.notify.title, body: p.body, data: { url: p.url, kind: p.kind, day: p.day }, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(p.at), channelId: CHANNEL },
    });
  }
}

export async function clearAll() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

function tapOf(r: Notifications.NotificationResponse | null): TapData | null {
  if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  return (r.notification.request.content.data ?? null) as TapData | null;
}

/**
 * 알림을 눌렀을 때 그 알림의 data를 넘긴다. 앱이 꺼진 상태에서 눌렀을 때(getLastNotificationResponse, v57은 동기)도 처리한다.
 * 처리한 마지막 응답은 지워서 다시 열 때 또 처리하지 않는다.
 */
export function onNotificationTap(go: (tap: TapData) => void): () => void {
  const last = tapOf(Notifications.getLastNotificationResponse());
  if (last) {
    Notifications.clearLastNotificationResponse();
    go(last);
  }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const tap = tapOf(r);
    if (tap) go(tap);
  });
  return () => sub.remove();
}
