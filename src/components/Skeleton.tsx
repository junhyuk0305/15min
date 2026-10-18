import { useEffect } from 'react';
import type { DimensionValue, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSurface } from '@/components/surface';
import { DUR } from '@/lib/motion';
import { R } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * 로딩 자리의 회색 막대(갭분석 F6, M19). 밝기가 0.5와 1 사이를 1초 주기로 오간다. 줄인 움직임이면 멈춘 회색.
 * 막대는 장식이다. 감싸는 쪽이 "불러오는 중입니다." 접근성 이름을 준다.
 */
export function Skeleton({ width = '100%', height = 14, radius = R.sm, style }: { width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle }) {
  const { p } = useSurface();
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(o);
      o.value = 1;
      return;
    }
    o.value = withRepeat(withTiming(0.5, { duration: DUR.pulse / 2 }), -1, true);
    return () => cancelAnimation(o);
  }, [reduced, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no"
      style={[{ width, height, borderRadius: radius, backgroundColor: p.line }, style, anim]}
    />
  );
}
