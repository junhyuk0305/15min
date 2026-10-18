import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { chatGap, type ChatSpeaker } from '@/components/ChatLine';
import { useSurface } from '@/components/surface';
import { DUR, EASE } from '@/lib/motion';
import { useRevealCount } from '@/lib/useReveal';
import { B, F, R, S, T } from '@/lib/theme';

/**
 * 코치 주석. 채팅 안(inline)에서는 가운데에 위아래 괘선을 긋는다.
 * modal이면 코치 모달 본문으로 쓴다: 카드 바탕, 1.5 테두리. 보기와 버튼은 children으로 넣는다.
 * reveal이면 첫 문장(lead, 없으면 description)을 어절 단위로 보이고, 표현 카드(표현, 뜻, 설명, 단어)는 표시가 끝난 뒤 200ms 페이드인한다(갭분석 C2).
 * 코치 모달에는 쓰지 않는다.
 */
export function CoachNote({
  kicker,
  lead,
  expression,
  meaning,
  description,
  words,
  children,
  modal,
  prev,
  reveal,
}: {
  /** 맨 위 작은 머리글. 예: 코치, 코치 퀴즈 */
  kicker: string;
  /** 표현 앞에 오는 코치 문장. 예: 원하는 것을 말할 때는 아래 표현을 써 보십시오. */
  lead?: string;
  /** 새 표현(영어) */
  expression?: string;
  /** 표현의 뜻 */
  meaning?: string;
  /** 언제 쓰는지 한 문장 */
  description?: string;
  words?: { word: string; meaning: string }[];
  children?: ReactNode;
  modal?: boolean;
  /** 채팅 안에서 앞 줄의 화자 */
  prev?: ChatSpeaker | null;
  /** 글자 단위로 보이는 중이다 */
  reveal?: boolean;
}) {
  const { p } = useSurface();
  const head = lead ?? description ?? '';
  const n = useRevealCount(head, !!reveal);
  const fade = useSharedValue(reveal ? 0 : 1);
  useEffect(() => {
    fade.value = reveal ? 0 : withTiming(1, { duration: DUR.base, easing: EASE });
  }, [reveal, fade]);
  const cardStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  // 표현 카드. 첫 문장 뒤에 페이드인한다
  const card = !!expression || !!meaning || (!!lead && !!description) || !!words?.length;
  const headText = (style: object) => (
    <Text accessibilityLabel={reveal ? head : undefined} style={[style, { color: lead ? p.ink : p.sub }]}>
      {head.slice(0, n)}
      <Text style={n < head.length ? { color: 'transparent' } : undefined}>{head.slice(n)}</Text>
    </Text>
  );
  const box = modal
    ? [s.modal, { backgroundColor: p.card, borderColor: p.ink }]
    : [s.inline, { borderColor: p.ink, marginTop: chatGap(prev, 'coach') }];
  return (
    <View style={box} accessibilityRole={modal ? undefined : 'summary'}>
      <Text style={[modal ? T.label : s.kicker, { color: p.sub }]}>{kicker}</Text>
      {lead ? headText(modal ? T.body : s.lead) : description ? headText(modal ? T.small : s.desc) : null}
      {card ? (
        <Animated.View style={[{ gap: modal ? S.sm : S.xs }, cardStyle]}>
          {expression ? <Text style={[modal ? s.exModal : s.ex, { color: p.ink }]}>{expression}</Text> : null}
          {meaning ? <Text style={[modal ? T.body : s.mean, { color: p.ink }]}>{meaning}</Text> : null}
          {lead && description ? <Text style={[modal ? T.small : s.desc, { color: p.sub }]}>{description}</Text> : null}
          {words?.map((w) => (
            <View key={w.word} style={[s.word, { borderTopColor: p.line }]}>
              <Text style={[s.wordKey, { color: p.ink }]}>{w.word}</Text>
              <Text style={[T.small, { color: p.sub, flexShrink: 1, textAlign: 'right' }]}>{w.meaning}</Text>
            </View>
          ))}
        </Animated.View>
      ) : null}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  inline: { borderTopWidth: B.hair, borderBottomWidth: B.hair, paddingVertical: 10, paddingHorizontal: 2, gap: S.xs },
  modal: { borderWidth: B.base, borderRadius: R.xl, padding: S.md, gap: S.sm },
  kicker: { fontFamily: F.serifBlack, fontSize: 13, lineHeight: 18, letterSpacing: 2 },
  ex: { fontFamily: F.sansBold, fontSize: 16, lineHeight: 23 },
  exModal: { fontFamily: F.sansBold, fontSize: 17, lineHeight: 24 },
  mean: { fontFamily: F.serifBlack, fontSize: 14, lineHeight: 21 },
  desc: { fontFamily: F.serif, fontSize: 13, lineHeight: 20 },
  lead: { fontFamily: F.serif, fontSize: 14, lineHeight: 21 },
  word: { flexDirection: 'row', justifyContent: 'space-between', gap: S.sm, borderTopWidth: B.hair, paddingTop: 5 },
  wordKey: { fontFamily: F.sansBold, fontSize: 13, lineHeight: 19 },
});
