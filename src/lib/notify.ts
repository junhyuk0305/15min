// 네이티브(iOS, Android) 로컬 알림. 웹판은 notify.web.ts.
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { copy } from './copy';
import type { Planned } from './plan';

export type Permission = 'granted' | 'denied' | 'undetermined';

const CHANNEL = 'nag';

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: '독촉',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
    });
  }
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
  return toPermission(
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
  );
}

export function openSystemSettings() {
  void Linking.openSettings();
}

/** 예약된 알림을 모두 지우고 계획대로 다시 건다. */
export async function applyPlan(plan: Planned[]) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const p of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { title: copy.notify.title, body: p.body, data: { url: p.url }, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(p.at), channelId: CHANNEL },
    });
  }
}

export async function clearAll() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** 알림을 눌렀을 때 이동할 경로를 받는다. 앱이 꺼진 상태에서 눌렀을 때도 처리한다. */
export function onNotificationTap(go: (url: string) => void): () => void {
  const last = Notifications.getLastNotificationResponse();
  const lastUrl = last?.notification.request.content.data?.url;
  if (typeof lastUrl === 'string') go(lastUrl);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const url = r.notification.request.content.data?.url;
    if (typeof url === 'string') go(url);
  });
  return () => sub.remove();
}
