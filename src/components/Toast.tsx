import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PanResponder, Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';
import { DUR, EASE } from '@/lib/motion';
import { FRAME_MAX, PALETTES, R, S, T } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * 화면 위 한 줄 안내(갭분석 F4). 어디서든 showToast(text)로 부른다.
 * _layout.tsx의 Notice(useRuntime.setNotice)를 대신할 수 있다. ToastHost를 루트에 한 번 붙인다.
 */
const useToast = create<{ text: string | null; id: number }>(() => ({ text: null, id: 0 }));

export const showToast = (text: string) => useToast.setState((s) => ({ text, id: s.id + 1 }));
export const hideToast = () => useToast.setState({ text: null });

// 떠 있는 다크 화면(학습 B) 수. 다크 위에서는 검정 토스트가 바탕에 묻혀 밝은 바탕으로 바꾼다(U9 Q7)
const useDarkCount = create<{ n: number }>(() => ({ n: 0 }));

/** 다크 화면이 떠 있는 동안 on을 참으로 둔다(LearnShell) */
export function useDarkToast(on: boolean) {
  useEffect(() => {
    if (!on) return;
    useDarkCount.setState((s) => ({ n: s.n + 1 }));
    return () => useDarkCount.setState((s) => ({ n: s.n - 1 }));
  }, [on]);
}

const HIDDEN = -160;

/**
 * 위에서 200ms 내려오고 4초 뒤 올라가며 사라진다. 위로 밀면 바로 닫힌다. 줄인 움직임이면 150ms 페이드.
 * 헤더를 덮을 때 양옆 버튼(chevron, ⋯)이 반만 비치지 않게 좌우 8만 남긴다(U9 A22).
 */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { text, id } = useToast();
  const p = PALETTES[useDarkCount((s) => s.n > 0) ? 'dark' : 'ivory'];
  const y = useSharedValue(HIDDEN);
  const o = useSharedValue(0);

  const leave = useCallback(() => {
    const done = () => useToast.setState((s) => (s.id === id ? { text: null } : s));
    const out = reduced ? DUR.reduced : DUR.base;
    o.set(withTiming(0, { duration: out }));
    y.set(
      withTiming(reduced ? 0 : HIDDEN, { duration: out, easing: EASE }, (fin) => {
        if (fin) scheduleOnRN(done);
      }),
    );
  }, [id, reduced, o, y]);
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  }, [leave]);

  useEffect(() => {
    if (!text) return;
    o.set(withTiming(1, { duration: reduced ? DUR.reduced : DUR.base }));
    if (reduced) y.set(0);
    else {
      y.set(HIDDEN);
      y.set(withTiming(0, { duration: DUR.base, easing: EASE }));
    }
    const t = setTimeout(leave, DUR.toast);
    return () => clearTimeout(t);
    // 같은 문장을 다시 불러도(id) 다시 내려온다
  }, [id, text, reduced, o, y, leave]);

  const pan = useMemo(
    () =>
      // 처리기는 손가락이 움직일 때만 불린다. 렌더 중에 ref를 읽지 않는다
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy < -4,
        onPanResponderMove: (_, g) => y.set(Math.min(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -20 || g.vy < -0.5) leaveRef.current();
          else y.set(withTiming(0, { duration: DUR.fast }));
        },
      }),
    [y],
  );

  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  if (!text) return null;
  return (
    <Animated.View
      {...pan.panHandlers}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        {
          position: 'absolute',
          top: insets.top + S.sm,
          left: S.sm,
          right: S.sm,
          maxWidth: FRAME_MAX - S.sm * 2,
          alignSelf: 'center',
          backgroundColor: p.ink,
          borderRadius: R.lg,
          padding: S.md,
        },
        style,
      ]}
    >
      {/* 누르면 닫힌다. 토스트가 헤더 뒤로 버튼 자리를 4초 동안 가리지 않게 */}
      <Pressable onPress={hideToast}>
        <Text style={[T.small, { color: p.onInk }]}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}
