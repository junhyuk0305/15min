// 햅틱 래퍼(갭분석 4절 햅틱 지도). 웹은 아무것도 하지 않는다.
// 학습 중 알림 진동과 겹치지 않게 지도에 있는 순간에만 부른다.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { reportError } from '@/lib/report';

const run = (p: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  p().catch((e: unknown) => reportError(e, 'haptics'));
};

/** 주 버튼 누름 */
export const tap = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
/** 스테퍼, 요일 토글, 칩, 보기 선택 */
export const select = () => run(() => Haptics.selectionAsync());
/** 정답, 완료, 쿠폰 획득, 달성 선언 */
export const success = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
/** 오답 */
export const error = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
/** 독촉 진입, 딴짓 팝업 */
export const warning = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
/** 포기 길게 누르기 완료, 계정 삭제 확정 */
export const heavy = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
