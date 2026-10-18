import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useInk } from '@/components/surface';
import { TypingDots } from '@/components/TypingDots';
import { DUR, EASE } from '@/lib/motion';
import { useRevealCount } from '@/lib/useReveal';
import { CHAT_GAP, F, T } from '@/lib/theme';

/**
 * 웹소설식 채팅 한 줄 (D안). 말풍선 없음.
 * 상대는 왼쪽, 나는 오른쪽, 지문은 전체 폭. 코치는 CoachNote가 가운데 괘선 주석으로 그린다.
 * 대사는 따옴표 안 명조. 상대는 400, 나는 900. 속마음은 회색 명조. 긁는 한 줄은 빨강.
 * reveal이면 어절 단위로 보인다(UXP 3절). 남은 글자는 투명하게 그려 두어 줄 높이가 처음부터 같다. 스크린리더는 처음부터 전체 문장을 읽는다.
 */
export type ChatSpeaker = 'partner' | 'me' | 'narration' | 'coach';
export type ChatLineKind = 'say' | 'thought' | 'scold';

/** 앞 줄과의 간격. 같은 화자면 4, 바뀌면 14, 첫 줄은 0 */
export function chatGap(prev: ChatSpeaker | null | undefined, cur: ChatSpeaker): number {
  if (!prev) return 0;
  return prev === cur ? CHAT_GAP.same : CHAT_GAP.change;
}

export function ChatLine({
  speaker,
  kind = 'say',
  text,
  who,
  prev,
  reveal,
}: {
  speaker: Exclude<ChatSpeaker, 'coach'>;
  kind?: ChatLineKind;
  text: string;
  /** 화자 이름(역할 이름, "나"). 화자가 바뀐 첫 줄에만 보인다 */
  who?: string;
  /** 앞 줄의 화자. 간격과 이름 표시를 정한다 */
  prev?: ChatSpeaker | null;
  /** 글자 단위로 보이는 중이다 */
  reveal?: boolean;
}) {
  const { ink, sub, alert } = useInk();
  const n = useRevealCount(text, !!reveal);
  const me = speaker === 'me';
  const showWho = !!who && speaker !== 'narration' && prev !== speaker;

  if (speaker === 'narration') {
    return <Text style={[s.narration, { color: sub, marginTop: chatGap(prev, speaker) }]}>{text}</Text>;
  }

  const line =
    kind === 'thought'
      ? [s.thought, { color: sub }]
      : kind === 'scold'
        ? [s.say, { fontFamily: F.serifBlack, color: alert }]
        : [s.say, { fontFamily: me ? F.serifBlack : F.serif, color: ink }];

  return (
    <View style={{ marginTop: chatGap(prev, speaker), alignItems: me ? 'flex-end' : 'flex-start', gap: CHAT_GAP.same }}>
      {showWho ? <Text style={[s.who, { color: sub }]}>{who}</Text> : null}
      <Text accessibilityLabel={reveal ? text : undefined} style={[line, { textAlign: me ? 'right' : 'left' }]}>
        {kind === 'say' ? '“' : ''}
        {text.slice(0, n)}
        <Text style={n < text.length ? s.hidden : undefined}>{`${text.slice(n)}${kind === 'say' ? '”' : ''}`}</Text>
      </Text>
    </View>
  );
}

/**
 * 응답을 기다리는 동안 화자 이름 아래 점 3개(갭분석 F7, M9). note가 있으면 점 옆에 작은 회색 글자(학습 시계 규칙 고지).
 */
export function TypingLine({ who, note, prev }: { who: string; note?: string; prev?: ChatSpeaker | null }) {
  const { sub } = useInk();
  return (
    <View style={{ marginTop: chatGap(prev, 'partner'), gap: CHAT_GAP.same }}>
      {prev !== 'partner' ? <Text style={[s.who, { color: sub }]}>{who}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TypingDots />
        {note ? <Text style={[T.small, { color: sub, flexShrink: 1 }]}>{note}</Text> : null}
      </View>
    </View>
  );
}

/**
 * 새 줄 등장(갭분석 M7): 페이드 + 8px 올라옴 220ms. animate가 거짓이면 바로 보인다.
 * 줄인 움직임이면 withTiming의 기본(ReduceMotion.System)이 바로 끝값으로 보낸다(줄이 200개여도 설정 구독을 줄마다 만들지 않는다).
 * Reanimated 레이아웃 entering은 웹에서 끝난 뒤에도 position absolute를 남겨 줄이 겹친다(2026-10-19 확인). 그래서 값 애니메이션으로 만든다.
 */
export function LineEnter({ animate, style, children }: { animate: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  // 이미 있던 줄은 애니메이션 값 없이 그린다. 줄이 200개여도 값과 스타일을 줄마다 만들지 않는다
  if (!animate) return <View style={style}>{children}</View>;
  return <Enter style={style}>{children}</Enter>;
}

function Enter({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (v.value < 1) v.value = withTiming(1, { duration: DUR.line, easing: EASE });
  }, [v]);
  const anim = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: 8 * (1 - v.value) }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

const s = StyleSheet.create({
  // 화자 이름은 웹소설 콘셉트라 자간 2를 두고 크기만 13으로(갭분석 V4)
  who: { fontFamily: F.serifBlack, fontSize: 13, lineHeight: 18, letterSpacing: 2 },
  say: { fontSize: 15, lineHeight: 26, maxWidth: '92%' },
  thought: { fontFamily: F.serif, fontSize: 14, lineHeight: 24, maxWidth: '92%' },
  narration: { fontFamily: F.serif, fontSize: 14, lineHeight: 24 },
  hidden: { color: 'transparent' },
});
