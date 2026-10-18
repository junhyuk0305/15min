import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeIn, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glyph } from '@/components/Glyph';
import { PrimaryFooter } from '@/components/PrimaryFooter';
import { SurfaceProvider, useInk, useSurface } from '@/components/surface';
import { TextButton } from '@/components/TextButton';
import { copy } from '@/lib/copy';
import { tap } from '@/lib/haptics';
import { DUR, EASE } from '@/lib/motion';
import { nowMs } from '@/lib/store';
import { B, C, HIT, PALETTES, R, S, T, type ThemeName } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * 눌림 움직임(갭분석 F1). 누르는 동안 0에서 1로 간다. 들어감 100ms, 나옴 150ms.
 * scale이면 크기 0.97 + 불투명도 0.9. 줄인 움직임이면 크기는 그대로 두고 불투명도만 바꾼다.
 * base는 평소 불투명도(처리 중 흐림 등).
 */
function usePress(base = 1, scale = true) {
  const reduced = useReducedMotion();
  const v = useSharedValue(0);
  const shrink = scale && !reduced;
  const style = useAnimatedStyle(
    () => ({
      opacity: base * (1 - 0.1 * v.value),
      transform: [{ scale: shrink ? 1 - 0.03 * v.value : 1 }],
    }),
    [base, shrink],
  );
  return {
    v,
    style,
    onPressIn: () => {
      v.value = withTiming(1, { duration: DUR.pressIn, easing: EASE });
    },
    onPressOut: () => {
      v.value = withTiming(0, { duration: DUR.pressOut, easing: EASE });
    },
  };
}

/** 1초마다 갱신되는 현재 시각. now를 주면 그 함수로 읽는다(개발용 시간 이동) */
export function useNow(intervalMs = 1000, now: () => number = nowMs): number {
  const [t, setT] = useState(now());
  useEffect(() => {
    const id = setInterval(() => setT(now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, now]);
  return t;
}

/**
 * 화면 틀. theme: ivory(기본), white(학습 A, C), dark(학습 B). danger면 빨강 바탕.
 * footer는 바닥에 고정되고 키보드가 올라오면 함께 올라간다 (MP 7.5-1).
 * header(공통 Header)는 위에 고정되고 본문만 스크롤된다.
 */
export function Screen({
  children,
  danger,
  scroll = true,
  footer,
  header,
  theme = 'ivory',
}: {
  children: ReactNode;
  danger?: boolean;
  scroll?: boolean;
  footer?: ReactNode;
  header?: ReactNode;
  theme?: ThemeName;
}) {
  const insets = useSafeAreaInsets();
  const p = PALETTES[theme];
  const bg = danger ? p.red : p.bg;
  const body = (
    <View style={{ paddingHorizontal: S.lg, paddingTop: header ? S.sm : insets.top + S.lg, paddingBottom: S.lg, gap: S.md }}>{children}</View>
  );
  return (
    <SurfaceProvider theme={theme} red={!!danger}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: bg }}>
        <StatusBar style={danger || theme === 'dark' ? 'light' : 'dark'} />
        {header ? <View style={{ paddingTop: insets.top }}>{header}</View> : null}
        {scroll ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            {body}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{body}</View>
        )}
        {footer ? <PrimaryFooter>{footer}</PrimaryFooter> : null}
      </KeyboardAvoidingView>
    </SurfaceProvider>
  );
}

export function H1({ children, inverse, serif }: { children: ReactNode; inverse?: boolean; serif?: boolean }) {
  const { ink } = useInk(inverse);
  return (
    <Text accessibilityRole="header" style={[serif ? T.h1Serif : T.h1, { color: ink }]}>
      {children}
    </Text>
  );
}

export function Body({ children, inverse, muted, serif }: { children: ReactNode; inverse?: boolean; muted?: boolean; serif?: boolean }) {
  const { ink, sub } = useInk(inverse);
  return <Text style={[serif ? T.bodySerif : T.body, { color: muted ? sub : ink }]}>{children}</Text>;
}

export function Label({ children, inverse }: { children: ReactNode; inverse?: boolean }) {
  const { sub } = useInk(inverse);
  return <Text style={[T.label, { color: sub }]}>{children}</Text>;
}

/** 숫자. 명조 900 */
export function Big({ children, inverse, hero }: { children: ReactNode; inverse?: boolean; hero?: boolean }) {
  const { ink } = useInk(inverse);
  return <Text style={[hero ? T.hero : T.big, { color: ink }]}>{children}</Text>;
}

/**
 * primary: 검정 채움, 화면당 하나. secondary: 테두리. danger: 빨강 채움(주 버튼 자리에 두지 않는다).
 * inverse: 빨강 바탕 위 흰 채움. text: 글자 버튼(TextButton).
 */
type BtnKind = 'primary' | 'secondary' | 'danger' | 'inverse' | 'text';

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  disabledReason,
  accessibilityLabel,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: BtnKind;
  disabled?: boolean;
  /** 처리 중. 비활성으로 바꾸고 진행 표시를 한다 (MP 7.5-6) */
  busy?: boolean;
  /** 비활성일 때 버튼 바로 위에 보이는 빨강 이유 (MP 7.5-5, 3절 빨강 안내). 조건을 못 채운 이유에만 쓴다. 빈 입력 안내는 넘기지 않는다 */
  disabledReason?: string | null;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  const { p, inv, alert } = useInk();
  const off = !!disabled || !!busy;
  // 비활성은 회색. 빨강 바탕 위에서는 원래 모양을 흐리게 한다.
  const grey = !!disabled && !busy && !(kind === 'inverse' || inv);
  const press = usePress(off && !grey ? 0.55 : 1);
  if (kind === 'text') {
    return <TextButton title={title} onPress={onPress} disabled={disabled} busy={busy} accessibilityLabel={accessibilityLabel} style={style} />;
  }
  const small = kind === 'secondary';
  const outline = inv ? p.onRed : p.ink;
  const look =
    kind === 'primary'
      ? { bg: p.ink, fg: p.onInk, border: p.ink }
      : kind === 'danger'
        ? { bg: p.red, fg: p.onRed, border: p.red }
        : kind === 'inverse'
          ? { bg: p.onRed, fg: p.red, border: p.onRed }
          : { bg: 'transparent', fg: outline, border: outline };
  const bg = grey ? p.disabled : look.bg;
  const fg = grey ? p.onDisabled : look.fg;
  const border = grey ? p.disabled : look.border;

  const btn = (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: off, busy: !!busy }}
      disabled={off}
      onPress={() => {
        if (kind === 'primary') tap();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[styles.btn, small && { minHeight: 50 }, { backgroundColor: bg, borderColor: border }, !disabledReason && style, press.style]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm }}>
        {busy ? <ActivityIndicator size="small" color={fg} /> : null}
        <Text style={[small ? T.buttonSm : T.button, { color: fg, textAlign: 'center', flexShrink: 1 }]}>{title}</Text>
      </View>
    </AnimatedPressable>
  );
  if (!disabledReason) return btn;
  return (
    <View style={[{ gap: S.xs }, style]}>
      {disabled && !busy ? (
        // 문장이 바뀌면 key가 바뀌어 120ms 페이드로 다시 나타난다
        <Animated.Text
          key={disabledReason}
          entering={FadeIn.duration(DUR.fast)}
          accessibilityLiveRegion="polite"
          style={[T.small, { color: alert, textAlign: 'center' }]}
        >
          {disabledReason}
        </Animated.Text>
      ) : null}
      {btn}
    </View>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  min,
  multiline,
  editable = true,
  note,
  error,
  serif,
  maxLength,
}: {
  label?: string;
  value: string;
  onChange?: (t: string) => void;
  placeholder?: string;
  min?: number;
  multiline?: boolean;
  editable?: boolean;
  note?: string;
  error?: string | null;
  /** 이유처럼 사용자가 쓴 문장은 명조로 */
  serif?: boolean;
  /** 서버 상한과 같은 글자 수 상한 */
  maxLength?: number;
}) {
  const { p, sub, alert } = useInk();
  const n = value.trim().length;
  return (
    <View style={{ gap: S.xs }}>
      {label ? (
        <View style={styles.rowBetween}>
          <Label>{label}</Label>
          {/* 비었으면 회색, 쓰기 시작했는데 모자라면 빨강(3절 빨강 안내) */}
          {min ? <Text style={[T.small, { color: n === 0 ? sub : n >= min ? p.ink : alert }]}>{`${n}/${min}`}</Text> : null}
        </View>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={p.sub}
        accessibilityLabel={label ?? placeholder}
        multiline={multiline}
        editable={editable}
        maxLength={maxLength}
        style={[
          styles.input,
          serif ? T.bodySerif : T.body,
          { borderColor: p.ink, backgroundColor: p.card, color: p.ink },
          multiline && { minHeight: 92, textAlignVertical: 'top' },
          !editable && { borderColor: p.line, backgroundColor: 'transparent', color: p.sub },
        ]}
      />
      {error ? <Text style={[T.small, { color: alert }]}>{error}</Text> : note ? <Text style={[T.small, { color: sub }]}>{note}</Text> : null}
    </View>
  );
}

export function Stepper({
  label,
  value,
  display,
  onMinus,
  onPlus,
  minusLabel = '−',
  plusLabel = '+',
  minusA11y = copy.ui.decrease,
  plusA11y = copy.ui.increase,
}: {
  label: string;
  value?: number;
  display?: string;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel?: string;
  plusLabel?: string;
  /** 기호만 있는 버튼의 접근성 이름 (MP 7.7-3) */
  minusA11y?: string;
  plusA11y?: string;
}) {
  const { p } = useSurface();
  return (
    <View style={{ gap: S.xs }}>
      <Label>{label}</Label>
      <View style={[styles.rowBetween, styles.stepper, { borderColor: p.ink, backgroundColor: p.card }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${minusA11y}`} onPress={onMinus} style={styles.stepBtn}>
          <Text style={[T.h2, { color: p.ink }]}>{minusLabel}</Text>
        </Pressable>
        <Text style={[T.big, { fontSize: 28, lineHeight: 36, color: p.ink }]}>{display ?? value}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${plusA11y}`} onPress={onPlus} style={styles.stepBtn}>
          <Text style={[T.h2, { color: p.ink }]}>{plusLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** 값이 바뀌면 이전 값에서 600ms 동안 채워진다(갭분석 M6). 줄인 움직임이면 바로 바뀐다 */
export function Gauge({ ratio, inverse }: { ratio: number; inverse?: boolean }) {
  const { p, inv } = useInk(inverse);
  const r = Math.max(0, Math.min(1, ratio));
  const reduced = useReducedMotion();
  const v = useSharedValue(r);
  useEffect(() => {
    v.value = reduced ? r : withTiming(r, { duration: DUR.gauge, easing: EASE });
  }, [r, reduced, v]);
  const fill = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  return (
    <View style={[styles.gauge, { backgroundColor: inv ? 'rgba(255,255,255,0.3)' : p.line }]}>
      <Animated.View style={[{ height: '100%', backgroundColor: inv ? p.onRed : p.ink }, fill]} />
    </View>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const { p } = useSurface();
  const press = usePress();
  const look = { backgroundColor: p.card, borderColor: p.line };
  if (onPress) {
    return (
      <AnimatedPressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.card, look, press.style]}
      >
        {children}
      </AnimatedPressable>
    );
  }
  return <View style={[styles.card, look]}>{children}</View>;
}

/**
 * 한 줄. right는 오른쪽 글자(여러 줄 허용). 설정 화면식 줄은 아래 선택 prop을 쓴다(갭분석 7.2).
 * value: 오른쪽 현재 값(회색 한 줄 말줄임). chevron: 오른쪽 화살표 16. pressBg: 눌림을 크기 대신 배경(C.line, 100ms)으로.
 */
export function Row({
  left,
  right,
  onPress,
  danger,
  value,
  chevron,
  pressBg,
}: {
  left: string;
  right?: string;
  onPress?: () => void;
  danger?: boolean;
  value?: string;
  chevron?: boolean;
  pressBg?: boolean;
}) {
  const { p, ink, sub, alert } = useInk();
  const press = usePress(1, !pressBg);
  const line = p.line;
  const pv = press.v;
  const bg = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(pv.value, [0, 1], [`${line}00`, line]) }), [line]);
  return (
    <AnimatedPressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[styles.rowBetween, styles.row, { borderBottomColor: p.line }, pressBg ? bg : press.style]}
    >
      <Text style={[T.body, { color: danger ? alert : ink, flexShrink: 1 }]}>{left}</Text>
      {right ? <Text style={[T.body, { color: danger ? alert : sub, flexShrink: 1, textAlign: 'right' }]}>{right}</Text> : null}
      {value || chevron ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.xs, flexShrink: 1, maxWidth: '60%' }}>
          {value ? (
            <Text numberOfLines={1} style={[T.body, { color: danger ? alert : sub, flexShrink: 1 }]}>
              {value}
            </Text>
          ) : null}
          {chevron ? <Glyph name="forward" size={16} color={sub} /> : null}
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

// 치수는 docs/ia-screens.html 기준. 색은 ivory 기본값이고, 부품 안에서는 바탕에 맞는 색으로 덮어쓴다.
export const styles = StyleSheet.create({
  btn: {
    minHeight: 56,
    borderRadius: R.lg,
    borderWidth: B.base,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
  },
  input: {
    minHeight: 48,
    borderWidth: B.base,
    borderColor: C.ink,
    borderRadius: R.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: C.ink,
    backgroundColor: C.card,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  stepper: { borderWidth: B.base, borderColor: C.ink, borderRadius: R.md, paddingVertical: S.xs, paddingHorizontal: S.sm, backgroundColor: C.card },
  stepBtn: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  gauge: { height: 6, borderRadius: 3, overflow: 'hidden' },
  card: { backgroundColor: C.card, borderRadius: R.lg, paddingVertical: 12, paddingHorizontal: 14, gap: 3, borderWidth: B.hair, borderColor: C.line },
  row: { minHeight: HIT, paddingVertical: 13, borderBottomWidth: B.hair, borderBottomColor: C.line },
});
