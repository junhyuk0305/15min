import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { SurfaceProvider, useSurface } from '@/components/surface';
import { TextButton } from '@/components/TextButton';
import { Body, Button } from '@/components/ui';
import { copy } from '@/lib/copy';
import { DUR, EASE, SPRING, SPRING_OK } from '@/lib/motion';
import { B, FRAME_MAX, PALETTES, R, S, T, type ThemeName } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

/** 이만큼 끌어내리거나 빠르게 내리면 닫는다 */
const DRAG_CLOSE = 80;
const FAR = 1000;

/**
 * 아래에서 올라오는 시트(메가프롬프트 3절 "시트", 갭분석 M2, N9).
 * RN Modal transparent + Reanimated. 바탕은 200ms 페이드, 내용은 아래에서 올라온다(네이티브 스프링, 웹 320ms).
 * Modal은 visible=false가 되면 바로 사라져 내용의 exiting이 안 보인다(영향지도 B-4). 그래서 닫힘 움직임이 끝난 뒤 Modal을 내린다.
 * 바탕 누르기, Android 뒤로, 손잡이를 아래로 끌기로 닫는다. dismissible=false면 셋 다 막는다.
 * 줄인 움직임이면 이동 없이 150ms 페이드만 한다.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  dismissible = true,
  theme: themeProp,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  dismissible?: boolean;
  theme?: ThemeName;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // theme을 주지 않으면 시트를 연 화면의 바탕을 따른다(학습 B는 다크)
  const outer = useSurface().theme;
  const theme = themeProp ?? outer;
  const p = PALETTES[theme];
  const [mounted, setMounted] = useState(visible);
  // 열리면 바로 그린다(렌더 중 상태 맞추기). 닫힘은 움직임이 끝난 뒤 내린다
  if (visible && !mounted) setMounted(true);
  // 내용 높이. 잰 뒤에 올린다
  const [h, setH] = useState(0);
  const shown = useRef(false);
  // 닫힘 완료가 JS로 넘어온 뒤 다시 열렸으면 내리지 않는다
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  const y = useSharedValue(FAR);
  const dim = useSharedValue(0);

  useEffect(() => {
    if (!mounted || h === 0) return;
    if (visible) {
      if (shown.current) return;
      shown.current = true;
      dim.value = withTiming(1, { duration: reduced ? DUR.reduced : DUR.base });
      if (reduced) y.value = 0;
      else {
        y.value = h;
        y.value = SPRING_OK ? withSpring(0, SPRING) : withTiming(0, { duration: DUR.slow, easing: EASE });
      }
      return;
    }
    shown.current = false;
    const finish = () => {
      if (visibleRef.current) return;
      setMounted(false);
      setH(0);
    };
    const out = reduced ? DUR.reduced : DUR.base;
    dim.value = withTiming(0, { duration: out });
    y.value = withTiming(reduced ? 0 : h, { duration: out, easing: EASE }, (done) => {
      if (done) scheduleOnRN(finish);
    });
  }, [visible, mounted, h, reduced, dim, y]);

  // 끌기 중에 부모가 다시 그려도(학습 화면 1초 시계) 손잡이 처리기가 바뀌지 않게 닫기 함수는 ref로 읽는다
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const pan = useMemo(
    () =>
      // 처리기는 손가락이 움직일 때만 불린다. 렌더 중에 ref를 읽지 않는다
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => y.set(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > DRAG_CLOSE || g.vy > 0.8) closeRef.current();
          else y.set(withTiming(0, { duration: DUR.base, easing: EASE }));
        },
      }),
    [y],
  );

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const sheetStyle = useAnimatedStyle(() => (reduced ? { opacity: dim.value } : { transform: [{ translateY: y.value }] }), [reduced]);

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={dismissible && visible ? onClose : () => undefined}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }, dimStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={dismissible ? copy.ux.close : undefined}
            disabled={!dismissible || !visible}
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        {/* 닫히는 동안에는 안을 누를 수 없다. 나가기 같은 동작이 두 번 불리지 않게 */}
        <Animated.View
          accessibilityViewIsModal
          pointerEvents={visible ? 'auto' : 'none'}
          onLayout={(e) => {
            const next = Math.round(e.nativeEvent.layout.height);
            if (next !== h) setH(next);
          }}
          style={[
            {
              width: '100%',
              maxWidth: FRAME_MAX,
              alignSelf: 'center',
              backgroundColor: p.bg,
              borderTopLeftRadius: R.sheet,
              borderTopRightRadius: R.sheet,
              paddingHorizontal: S.lg,
              paddingBottom: insets.bottom + S.md,
              gap: S.sm,
            },
            sheetStyle,
          ]}
        >
          <View {...(dismissible ? pan.panHandlers : {})} style={{ alignItems: 'center', paddingTop: S.sm, paddingBottom: S.xs }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: p.line }} />
          </View>
          <SurfaceProvider theme={theme}>{children}</SurfaceProvider>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** 동작 고르기 시트(갭분석 N10, C6). 줄 목록과 맨 아래 "닫기" */
export function ActionSheet({
  visible,
  onClose,
  title,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: { label: string; onPress: () => void; danger?: boolean }[];
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {title ? <SheetLabel>{title}</SheetLabel> : null}
      <ActionList actions={actions} />
      <TextButton title={copy.ux.close} tone="sub" onPress={onClose} />
    </BottomSheet>
  );
}

function SheetTitle({ children }: { children: string }) {
  const { p } = useSurface();
  return (
    <Text accessibilityRole="header" style={[T.h2, { color: p.ink }]}>
      {children}
    </Text>
  );
}

function SheetLabel({ children }: { children: string }) {
  const { p } = useSurface();
  return <Text style={[T.small, { color: p.sub, textAlign: 'center' }]}>{children}</Text>;
}

function ActionList({ actions }: { actions: { label: string; onPress: () => void; danger?: boolean }[] }) {
  const { p } = useSurface();
  return (
    <View style={{ backgroundColor: p.card, borderRadius: R.lg, borderWidth: B.hair, borderColor: p.line, overflow: 'hidden' }}>
      {actions.map((a, i) => (
        <Pressable
          key={a.label}
          accessibilityRole="button"
          onPress={a.onPress}
          style={({ pressed }) => ({
            minHeight: 52,
            justifyContent: 'center',
            paddingHorizontal: S.md,
            backgroundColor: pressed ? p.line : 'transparent',
            borderTopWidth: i === 0 ? 0 : B.hair,
            borderTopColor: p.line,
          })}
        >
          <Text style={[T.body, { color: a.danger ? p.redText : p.ink, textAlign: 'center' }]}>{a.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * 확인 시트. 제목, 본문, 주 버튼(안전한 쪽), 글자 버튼(동작). danger면 글자 버튼이 빨강이다.
 * 예: 학습 나가기 "계속하기"(주) / "나가기"(글자). 바탕 누르기와 뒤로는 onClose.
 */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  body,
  primary,
  onPrimary,
  secondary,
  onSecondary,
  danger,
  busy,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  primary: string;
  onPrimary: () => void;
  secondary?: string;
  onSecondary?: () => void;
  danger?: boolean;
  busy?: boolean;
  theme?: ThemeName;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} dismissible={!busy} theme={theme}>
      <SheetTitle>{title}</SheetTitle>
      {body ? <Body>{body}</Body> : null}
      <Button title={primary} onPress={onPrimary} disabled={busy} style={{ marginTop: S.sm }} />
      {secondary && onSecondary ? <TextButton title={secondary} tone={danger ? 'danger' : 'sub'} onPress={onSecondary} busy={busy} /> : null}
    </BottomSheet>
  );
}
