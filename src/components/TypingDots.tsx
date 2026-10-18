import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSurface } from '@/components/surface';
import { copy } from '@/lib/copy';
import { DUR, EASE } from '@/lib/motion';
import { useReducedMotion } from '@/lib/useReducedMotion';

const SIZE = 6;

/** 입력 중 표시(갭분석 F7, M9). 점 3개가 150ms 간격으로 차례로 오르내린다. 1.2초 반복. 줄인 움직임이면 멈춘 점 */
export function TypingDots() {
  const { p } = useSurface();
  const reduced = useReducedMotion();
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  const c = useSharedValue(0);
  useEffect(() => {
    const dots = [a, b, c];
    if (reduced) {
      dots.forEach((d) => {
        cancelAnimation(d);
        d.value = 0;
      });
      return;
    }
    const up = DUR.dots / 4;
    dots.forEach((d, i) => {
      d.value = withDelay(
        i * DUR.dotGap,
        withRepeat(
          withSequence(
            withTiming(1, { duration: up, easing: EASE }),
            withTiming(0, { duration: up, easing: EASE }),
            withTiming(0, { duration: DUR.dots - up * 2 }),
          ),
          -1,
        ),
      );
    });
    return () => dots.forEach((d) => cancelAnimation(d));
  }, [reduced, a, b, c]);
  return (
    <View
      accessible
      accessibilityLabel={copy.ux.typing}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 18, paddingVertical: 4 }}
    >
      {[a, b, c].map((v, i) => (
        <Dot key={i} v={v} color={p.sub} />
      ))}
    </View>
  );
}

function Dot({ v, color }: { v: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * v.value, transform: [{ translateY: -3 * v.value }] }));
  return <Animated.View style={[{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: color }, style]} />;
}
