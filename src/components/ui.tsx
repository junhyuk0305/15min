import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nowMs } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

/** 1초마다 갱신되는 현재 시각 (개발용 시간 이동 반영) */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(nowMs());
  useEffect(() => {
    const id = setInterval(() => setNow(nowMs()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Screen({
  children,
  danger,
  scroll = true,
  footer,
}: {
  children: ReactNode;
  danger?: boolean;
  scroll?: boolean;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const bg = danger ? C.red : C.bg;
  const body = (
    <View style={{ paddingHorizontal: S.lg, paddingTop: insets.top + S.lg, paddingBottom: S.lg, gap: S.md }}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: S.lg, paddingBottom: insets.bottom + S.md, paddingTop: S.sm, gap: S.sm }}>{footer}</View> : null}
    </View>
  );
}

export function H1({ children, inverse }: { children: ReactNode; inverse?: boolean }) {
  return <Text style={[T.h1, { color: inverse ? C.redInk : C.ink }]}>{children}</Text>;
}

export function Body({ children, inverse, muted }: { children: ReactNode; inverse?: boolean; muted?: boolean }) {
  return <Text style={[T.body, { color: inverse ? C.redInk : muted ? C.sub : C.ink }]}>{children}</Text>;
}

export function Label({ children, inverse }: { children: ReactNode; inverse?: boolean }) {
  return <Text style={[T.label, { color: inverse ? C.redInk : C.sub }]}>{children}</Text>;
}

export function Big({ children, inverse, hero }: { children: ReactNode; inverse?: boolean; hero?: boolean }) {
  return <Text style={[hero ? T.hero : T.big, { color: inverse ? C.redInk : C.ink }]}>{children}</Text>;
}

type BtnKind = 'primary' | 'secondary' | 'danger' | 'inverse';

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: BtnKind;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = disabled ? C.disabled : kind === 'primary' ? C.ink : kind === 'danger' ? C.red : kind === 'inverse' ? C.redInk : 'transparent';
  const fg = kind === 'secondary' ? C.ink : kind === 'inverse' ? C.red : C.redInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderWidth: kind === 'secondary' ? 2 : 0, opacity: pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={[T.h2, { color: disabled ? C.card : fg }]}>{title}</Text>
    </Pressable>
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
}) {
  const n = value.trim().length;
  return (
    <View style={{ gap: S.xs }}>
      {label ? (
        <View style={styles.rowBetween}>
          <Label>{label}</Label>
          {min ? <Text style={[T.small, { color: n >= min ? C.ink : C.red }]}>{`${n}/${min}`}</Text> : null}
        </View>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.disabled}
        multiline={multiline}
        editable={editable}
        style={[
          styles.input,
          multiline && { minHeight: 96, textAlignVertical: 'top' },
          !editable && { backgroundColor: 'transparent', color: C.sub },
        ]}
      />
      {error ? <Text style={[T.small, { color: C.red }]}>{error}</Text> : note ? <Text style={[T.small, { color: C.sub }]}>{note}</Text> : null}
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
}: {
  label: string;
  value?: number;
  display?: string;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel?: string;
  plusLabel?: string;
}) {
  return (
    <View style={{ gap: S.xs }}>
      <Label>{label}</Label>
      <View style={[styles.rowBetween, styles.stepper]}>
        <Pressable accessibilityRole="button" onPress={onMinus} style={styles.stepBtn}>
          <Text style={T.h2}>{minusLabel}</Text>
        </Pressable>
        <Text style={T.big}>{display ?? value}</Text>
        <Pressable accessibilityRole="button" onPress={onPlus} style={styles.stepBtn}>
          <Text style={T.h2}>{plusLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Gauge({ ratio, inverse }: { ratio: number; inverse?: boolean }) {
  const r = Math.max(0, Math.min(1, ratio));
  return (
    <View style={[styles.gauge, { backgroundColor: inverse ? 'rgba(255,255,255,0.3)' : C.line }]}>
      <View style={{ width: `${r * 100}%`, height: '100%', backgroundColor: inverse ? C.redInk : C.ink }} />
    </View>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.8 : 1 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={styles.card}>{children}</View>;
}

export function Row({ left, right, onPress }: { left: string; right?: string; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[styles.rowBetween, styles.row]}>
      <Text style={T.body}>{left}</Text>
      {right ? <Text style={[T.body, { color: C.sub }]}>{right}</Text> : null}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  btn: { minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.md },
  input: {
    borderWidth: 2,
    borderColor: C.ink,
    borderRadius: 12,
    padding: S.md,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.card,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { borderWidth: 2, borderColor: C.ink, borderRadius: 12, padding: S.sm },
  stepBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  gauge: { height: 8, borderRadius: 4, overflow: 'hidden' },
  card: { backgroundColor: C.card, borderRadius: 14, padding: S.md, gap: S.xs, borderWidth: 1, borderColor: C.line },
  row: { paddingVertical: S.md, borderBottomWidth: 1, borderBottomColor: C.line },
});
