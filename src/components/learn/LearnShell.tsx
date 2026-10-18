import { StatusBar } from 'expo-status-bar';
import { useRef, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryFooter } from '@/components/PrimaryFooter';
import { SurfaceProvider, useSurface } from '@/components/surface';
import { Gauge } from '@/components/ui';
import { copy } from '@/lib/copy';
import { fmtDuration } from '@/lib/rules';
import { B, PALETTES, S, T, type ThemeName } from '@/lib/theme';

/**
 * 학습 화면 틀. 위에 시계, 가운데 스크롤, 아래 입력과 주 버튼.
 * 키보드가 올라오면 react-native-keyboard-controller가 화면 전체를 올려 입력창과 주 버튼이 가려지지 않는다(MP 7.5-1, 7.7-2).
 * follow면 내용이 늘 때마다 맨 아래로 내린다(채팅).
 */
export function LearnShell({
  theme,
  header,
  banner,
  children,
  footer,
  overlay,
  follow,
}: {
  theme: ThemeName;
  header?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 화면 위에 덮는 것(단계 전환 안내). 모달은 children이나 footer 안에 둔다 */
  overlay?: ReactNode;
  follow?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const p = PALETTES[theme];
  const scroll = useRef<ScrollView>(null);
  return (
    <SurfaceProvider theme={theme}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <View style={{ paddingTop: insets.top + S.sm }}>{header}</View>
        {banner ? <View style={{ paddingHorizontal: S.lg, paddingTop: S.sm }}>{banner}</View> : null}
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.md, gap: S.md }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={follow ? () => scroll.current?.scrollToEnd({ animated: true }) : undefined}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View style={{ borderTopWidth: B.hair, borderTopColor: p.line, backgroundColor: p.bg }}>
            <PrimaryFooter>{footer}</PrimaryFooter>
          </View>
        ) : null}
        {overlay}
      </KeyboardAvoidingView>
    </SurfaceProvider>
  );
}

/** 위 시계. 단계 이름, 그 단계 남은 시간(멈추면 멈춤), 전체 남은 시간, 게이지 */
export function ClockHeader({
  label,
  phaseLeft,
  remaining,
  ratio,
  paused,
}: {
  label: string;
  /** 그 단계의 남은 초. 회고처럼 단계가 하나면 생략 */
  phaseLeft?: number;
  /** 크게 보이는 남은 초 */
  remaining: number;
  ratio: number;
  paused: boolean;
}) {
  const { p } = useSurface();
  const right = paused ? copy.learn.paused : phaseLeft !== undefined ? copy.learn.phaseLeft(fmtDuration(phaseLeft * 1000)) : '';
  return (
    <View style={{ paddingHorizontal: S.lg, paddingBottom: 10, gap: 2, borderBottomWidth: B.hair, borderBottomColor: p.ink }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
        <Text style={[T.label, { color: p.sub }]}>{label}</Text>
        <Text accessibilityLiveRegion="polite" style={[T.label, { color: paused ? p.redText : p.sub }]}>
          {right}
        </Text>
      </View>
      <Text accessibilityLabel={`${copy.learn.left} ${fmtDuration(remaining * 1000)}`} style={[T.big, { color: p.ink }]}>
        {fmtDuration(remaining * 1000)}
      </Text>
      <Gauge ratio={ratio} />
    </View>
  );
}
