import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { DUR, EASE } from '@/lib/motion';
import { S } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * 0에서 value까지 세는 숫자(갭분석 M10, F9, F10, M16). 값은 UI 스레드에서 움직이고, 보이는 정수가 바뀔 때만 글자를 바꾼다(웹에서도 같다).
 * pop이면 다 센 뒤 크기 1 → 1.08 → 1. 줄인 움직임이면 처음부터 최종 값이다.
 * 스크린리더는 처음부터 최종 값을 읽는다.
 * 자리 폭은 최종 값으로 처음부터 잡는다. 세는 동안 숫자 폭이 늘어 옆 묶음이 밀리지 않게 한다(U9 M4).
 */
export function CountUp({
  value,
  format,
  style,
  delay = 0,
  pop,
}: {
  value: number;
  format: (n: number) => string;
  style: StyleProp<TextStyle>;
  delay?: number;
  pop?: boolean;
}) {
  const reduced = useReducedMotion();
  const v = useSharedValue(0);
  const scale = useSharedValue(1);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(delay, withTiming(value, { duration: DUR.count, easing: EASE }));
    if (pop) {
      const half = DUR.base / 2;
      scale.value = withDelay(
        delay + DUR.count,
        withSequence(withTiming(1.08, { duration: half, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: half, easing: EASE })),
      );
    }
  }, [value, delay, pop, reduced, v, scale]);

  useAnimatedReaction(
    () => Math.round(v.value),
    (n, prev) => {
      if (n !== prev) scheduleOnRN(setShown, n);
    },
  );
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const text = format(reduced ? value : shown);
  return (
    <Animated.View accessible accessibilityLabel={format(value)} style={[{ alignSelf: 'flex-start' }, anim]}>
      {/* 최종 값을 투명하게 그려 폭을 잡고, 세는 숫자는 그 위에 겹친다. 글꼴 숫자 폭이 조금 달라도 줄이 바뀌지 않게 오른쪽에 여유를 둔다 */}
      <Text style={[style, { opacity: 0 }]} importantForAccessibility="no">
        {format(value)}
      </Text>
      <Text style={[style, { position: 'absolute', left: 0, top: 0, right: -S.xl }]} importantForAccessibility="no">
        {text}
      </Text>
    </Animated.View>
  );
}
