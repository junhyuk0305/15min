import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatScroll } from '@/components/ChatScroll';
import { Glyph } from '@/components/Glyph';
import { HeaderMore } from '@/components/Header';
import { PrimaryFooter } from '@/components/PrimaryFooter';
import { SurfaceProvider, useSurface } from '@/components/surface';
import { copy } from '@/lib/copy';
import { fmtLeft, type BarCell } from '@/lib/learn';
import { fmtDuration } from '@/lib/rules';
import { B, HIT, PALETTES, S, T, type ThemeName } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

/** 시계가 1초씩 가므로 막대도 1초 동안 선형으로 줄인다(갭분석 M5) */
const BAR_STEP_MS = 1000;
/** "멈춤"이 흐려졌다 돌아오는 한 주기 */
const PAUSE_PULSE_MS = 1200;

/**
 * 학습 화면 틀. 위에 시계, 가운데 스크롤, 아래 입력과 주 버튼.
 * 키보드가 올라오면 react-native-keyboard-controller가 화면 전체를 올려 입력창과 주 버튼이 가려지지 않는다(MP 7.5-1, 7.7-2).
 * follow면 내용이 늘 때마다 맨 아래로 내린다(채팅). topKey가 바뀌면 맨 위로 올린다(복습의 새 문항).
 * 채팅이면 count, mineLast, revealing, onTouch를 넘긴다. 읽는 중 새 메시지 알약과 글자 표시 끝내기는 ChatScroll이 맡는다.
 */
export function LearnShell({
  theme,
  header,
  banner,
  children,
  footer,
  overlay,
  follow,
  topKey,
  count,
  mineLast,
  revealing,
  onTouch,
}: {
  theme: ThemeName;
  header?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 화면 위에 덮는 것(딴짓 팝업, 시트). 모달은 children이나 footer 안에 둔다 */
  overlay?: ReactNode;
  follow?: boolean;
  topKey?: string;
  /** 메시지 수 */
  count?: number;
  /** 마지막 줄이 내가 보낸 줄이다 */
  mineLast?: boolean;
  /** 글자 단위 표시 중이다 */
  revealing?: boolean;
  /** 화면을 누르면 먼저 불린다(글자 표시를 바로 끝낸다). 고정된 함수를 넘긴다 */
  onTouch?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const p = PALETTES[theme];
  return (
    <SurfaceProvider theme={theme}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <View style={{ paddingTop: insets.top + S.sm }}>{header}</View>
        {banner ? <View style={{ paddingHorizontal: S.lg, paddingTop: S.sm }}>{banner}</View> : null}
        <ChatScroll
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.md, gap: S.md }}
          follow={follow}
          topKey={topKey}
          count={count}
          mineLast={mineLast}
          revealing={revealing}
          onTouch={onTouch}
        >
          {children}
        </ChatScroll>
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

/**
 * 위 시계(갭분석 V5). 오른쪽에 "상황 대화 4:33 남음"과 멈춤, 큰 숫자 위에 "오늘 남은 시간", 아래에 A, B, C, 회고 진행 막대.
 * onClose가 있으면 왼쪽 위에 X(닫기)를 둔다. 누르면 학습 나가기 시트를 연다(UXP 3절, 갭분석 N8).
 * onMore가 있으면 오른쪽 끝에 "⋯"(신고하기 메뉴, UXP 3절 "신고 위치"). "멈춤"은 회색이고 딴짓 멈춤(idle)만 빨강이다(갭분석 W7).
 * 회고처럼 단계 남은 시간(phaseLeft)이 없으면 큰 숫자는 그 단계의 남은 시간이다.
 */
export function ClockHeader({
  label,
  phaseLeft,
  remaining,
  cells,
  tick,
  paused,
  idle,
  onClose,
  onMore,
}: {
  label: string;
  /** 그 단계의 남은 초. 회고처럼 단계가 하나면 생략 */
  phaseLeft?: number;
  /** 크게 보이는 남은 초 */
  remaining: number;
  /** 진행 막대 칸(phaseBar) */
  cells: BarCell[];
  /** 막대 오른쪽 끝 아래 눈금 글자(회고 "3분") */
  tick?: string;
  paused: boolean;
  /** 딴짓으로 멈췄다 */
  idle?: boolean;
  onClose?: () => void;
  onMore?: () => void;
}) {
  const { p } = useSurface();
  const where = phaseLeft !== undefined ? copy.learn.phaseLeft(label, fmtLeft(phaseLeft)) : label;
  const caption = phaseLeft !== undefined ? copy.learn.todayLeft : copy.learn.retroLeft;
  return (
    <View style={{ paddingHorizontal: S.lg, paddingBottom: 10, gap: 2, borderBottomWidth: B.hair, borderBottomColor: p.ink }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm }}>
        {onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.ux.close}
            onPress={onClose}
            style={({ pressed }) => ({ width: HIT, height: HIT, marginLeft: -10, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
          >
            <Glyph name="close" color={p.ink} />
          </Pressable>
        ) : null}
        <Text style={[T.label, { flex: 1, color: p.sub }]}>{where}</Text>
        {paused ? <PausedLabel color={idle ? p.redText : p.sub} /> : null}
        {onMore ? (
          <View style={{ marginRight: -10 }}>
            <HeaderMore onPress={onMore} />
          </View>
        ) : null}
      </View>
      <Text style={[T.label, { color: p.sub }]}>{caption}</Text>
      <Text accessibilityLabel={`${caption} ${fmtDuration(remaining * 1000)}`} style={[T.big, { color: p.ink }]}>
        {fmtDuration(remaining * 1000)}
      </Text>
      <PhaseBar cells={cells} tick={tick} />
    </View>
  );
}

/** "멈춤". 1.2초 주기로 천천히 흐려졌다 돌아온다(갭분석 M5). 줄인 움직임이면 그대로 둔다 */
function PausedLabel({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    const half = { duration: PAUSE_PULSE_MS / 2, easing: Easing.inOut(Easing.ease) };
    o.value = withRepeat(withSequence(withTiming(0.35, half), withTiming(1, half)), -1);
    return () => {
      cancelAnimation(o);
      o.value = 1;
    };
  }, [reduced, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.Text accessibilityLiveRegion="polite" style={[T.label, { color }, style]}>
      {copy.learn.paused}
    </Animated.Text>
  );
}

/**
 * 진행 막대(갭분석 V5). A, B, C, 회고 칸의 길이는 그날 단계 시간 비율이다. 칸마다 남은 만큼 차 있다.
 * 지금 칸은 검정(ink), 앞으로 올 칸은 옅은 회색(disabled), 지난 칸은 빈 칸이다. 회고 칸 앞은 조금 더 띄운다.
 */
export function PhaseBar({ cells, tick }: { cells: BarCell[]; tick?: string }) {
  const { p } = useSurface();
  return (
    <View style={{ gap: 2, paddingTop: 2 }}>
      <View style={{ flexDirection: 'row', height: 6 }}>
        {cells.map((c, i) => (
          <BarSegment key={c.phase} cell={c} gapLeft={i === 0 ? 0 : c.phase === 'retro' ? S.sm : 3} />
        ))}
      </View>
      {tick ? <Text style={[T.label, { alignSelf: 'flex-end', color: p.sub }]}>{tick}</Text> : null}
    </View>
  );
}

/** 막대 한 칸. 1초 간격으로 선형으로 줄어 끊김이 없다. 줄인 움직임이면 계단식 */
function BarSegment({ cell, gapLeft }: { cell: BarCell; gapLeft: number }) {
  const { p } = useSurface();
  const reduced = useReducedMotion();
  const v = useSharedValue(cell.fill);
  useEffect(() => {
    v.value = reduced ? cell.fill : withTiming(cell.fill, { duration: BAR_STEP_MS, easing: Easing.linear });
  }, [cell.fill, reduced, v]);
  const fill = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  return (
    <View style={{ flex: cell.share, marginLeft: gapLeft, backgroundColor: p.line, borderRadius: 3, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: cell.state === 'now' ? p.ink : p.disabled }, fill]} />
    </View>
  );
}
