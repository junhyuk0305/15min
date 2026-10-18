import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatScroll } from '@/components/ChatScroll';
import { Glyph } from '@/components/Glyph';
import { HeaderMore } from '@/components/Header';
import { PrimaryFooter } from '@/components/PrimaryFooter';
import { SurfaceProvider, useSurface } from '@/components/surface';
import { Gauge } from '@/components/ui';
import { copy } from '@/lib/copy';
import { fmtDuration } from '@/lib/rules';
import { B, HIT, PALETTES, S, T, type ThemeName } from '@/lib/theme';

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
  /** 화면 위에 덮는 것(단계 전환 안내). 모달은 children이나 footer 안에 둔다 */
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
 * 위 시계. 단계 이름, 그 단계 남은 시간(멈추면 멈춤), 전체 남은 시간, 게이지.
 * onClose가 있으면 왼쪽 위에 X(닫기)를 둔다. 누르면 학습 나가기 시트를 연다(UXP 3절, 갭분석 N8).
 * onMore가 있으면 오른쪽 끝에 "⋯"(신고하기 메뉴, UXP 3절 "신고 위치"). "멈춤"은 회색이고 딴짓 멈춤(idle)만 빨강이다(갭분석 W7).
 */
export function ClockHeader({
  label,
  phaseLeft,
  remaining,
  ratio,
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
  ratio: number;
  paused: boolean;
  /** 딴짓으로 멈췄다 */
  idle?: boolean;
  onClose?: () => void;
  onMore?: () => void;
}) {
  const { p } = useSurface();
  const right = paused ? copy.learn.paused : phaseLeft !== undefined ? copy.learn.phaseLeft(fmtDuration(phaseLeft * 1000)) : '';
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
        <Text style={[T.label, { flex: 1, color: p.sub }]}>{label}</Text>
        <Text accessibilityLiveRegion="polite" style={[T.label, { color: paused && idle ? p.redText : p.sub }]}>
          {right}
        </Text>
        {onMore ? (
          <View style={{ marginRight: -10 }}>
            <HeaderMore onPress={onMore} />
          </View>
        ) : null}
      </View>
      <Text accessibilityLabel={`${copy.learn.left} ${fmtDuration(remaining * 1000)}`} style={[T.big, { color: p.ink }]}>
        {fmtDuration(remaining * 1000)}
      </Text>
      <Gauge ratio={ratio} />
    </View>
  );
}
