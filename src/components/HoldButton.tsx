import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type AccessibilityActionEvent } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useInk } from '@/components/surface';
import { heavy } from '@/lib/haptics';
import { DUR } from '@/lib/motion';
import { B, R, S, T } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

const HOLD_MS = 2000;
const REDUCED_WAIT_MS = 1000;

/**
 * 길게 눌러 확정하는 버튼(3절 "포기 확정", 갭분석 F11, M13). 누르는 동안 왼쪽부터 채워지고(UI 스레드, 2초 선형),
 * 손을 떼면 200ms에 되돌아간다. 다 차면 heavy 햅틱 뒤 onConfirm.
 * 빨강 바탕에서 쓴다. 빨강 위 빨강은 안 보이므로 테두리만 있는 흰 버튼이 흰색으로 차오르고 글자가 빨강으로 뒤집힌다.
 * 줄인 움직임이면 길게 누르기 대신 처음 1초 비활성 뒤 탭으로 확정한다.
 * 스크린리더는 길게 누르기가 어려우니 두 번 탭(activate 동작)으로 확정한다.
 */
export function HoldButton({
  title,
  hint,
  a11yHint,
  onConfirm,
  busy,
}: {
  title: string;
  /** 버튼 아래 작은 안내. 길게 누르기일 때만 보인다 */
  hint: string;
  a11yHint: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const { p } = useInk(true);
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const [width, setWidth] = useState(0);
  const [armed, setArmed] = useState(!reduced);
  // 화면에 있는 동안 줄인 움직임 설정이 바뀌면 다시 맞춘다(렌더 중 상태 맞추기). 켜지면 1초 비활성부터 다시 거친다
  const [armedFor, setArmedFor] = useState(reduced);
  if (armedFor !== reduced) {
    setArmedFor(reduced);
    setArmed(!reduced);
  }
  const done = useRef(false);

  // 줄인 움직임: 단계에 들어온 뒤 1초 동안 눌리지 않는다(연타로 확인을 건너뛰지 않게)
  useEffect(() => {
    if (!reduced) return;
    const id = setTimeout(() => setArmed(true), REDUCED_WAIT_MS);
    return () => clearTimeout(id);
  }, [reduced]);

  // 요청이 끝났는데 화면에 남아 있으면(실패) 다시 누를 수 있게 비운다
  useEffect(() => {
    if (busy || !done.current) return;
    done.current = false;
    progress.set(withTiming(0, { duration: DUR.base }));
  }, [busy, progress]);

  const confirm = () => {
    if (done.current || busy) return;
    done.current = true;
    heavy();
    onConfirm();
  };

  const onPressIn = () => {
    if (reduced || busy || done.current) return;
    progress.set(
      withTiming(1, { duration: HOLD_MS * (1 - progress.get()), easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(confirm);
      }),
    );
  };
  const onPressOut = () => {
    if (reduced || done.current) return;
    cancelAnimation(progress);
    progress.set(withTiming(0, { duration: DUR.base }));
  };
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'activate' && armed) confirm();
  };

  const fill = useAnimatedStyle(() => ({ width: progress.value * width }));
  const off = !!busy || !armed;
  const label = (color: string) => (
    <View style={{ width, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm, paddingHorizontal: S.md }}>
      {busy ? <ActivityIndicator size="small" color={color} /> : null}
      <Text style={[T.buttonSm, { color, textAlign: 'center' }]}>{title}</Text>
    </View>
  );

  return (
    <View style={{ gap: S.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={a11yHint}
        accessibilityState={{ disabled: off, busy: !!busy }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onAction}
        disabled={off}
        onPress={reduced ? confirm : undefined}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ minHeight: 50, borderRadius: R.lg, borderWidth: B.base, borderColor: p.onRed, overflow: 'hidden', justifyContent: 'center', opacity: off && !busy ? 0.55 : 1 }}
      >
        {width > 0 ? label(p.onRed) : <View style={{ minHeight: 50 }} />}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden', backgroundColor: p.onRed }, fill]}>
          {width > 0 ? label(p.red) : null}
        </Animated.View>
      </Pressable>
      {reduced ? null : <Text style={[T.small, { color: p.onRed, textAlign: 'center' }]}>{hint}</Text>}
    </View>
  );
}
