import { useEffect, type ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { DUR, EASE } from '@/lib/motion';
import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * 처음 그려질 때 페이드로 나타난다(enter.fade와 같은 200ms, 영향지도 B-7). from이 있으면 그만큼 아래에서 올라온다.
 * 레이아웃 entering 대신 값 애니메이션을 쓴다. 웹에서 entering이 목록 안에서 position absolute를 남긴 적이 있다(U4).
 * 줄인 움직임이면 기다림과 이동 없이 150ms 페이드만 남긴다.
 */
export function Appear({ children, delay = 0, from = 0, style }: { children: ReactNode; delay?: number; from?: number; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0);
  const y = useSharedValue(reduced ? 0 : from);
  useEffect(() => {
    if (reduced) {
      // 줄인 움직임: 기다리지 않고 짧은 페이드만
      o.value = withTiming(1, { duration: DUR.reduced, easing: EASE });
      y.value = 0;
      return;
    }
    o.value = withDelay(delay, withTiming(1, { duration: DUR.base, easing: EASE }));
    y.value = withDelay(delay, withTiming(0, { duration: DUR.slow, easing: EASE }));
  }, [delay, reduced, o, y]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
