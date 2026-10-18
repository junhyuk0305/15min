import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { chatGap, type ChatSpeaker } from '@/components/ChatLine';
import { useSurface } from '@/components/surface';
import { B, F, R, S, T } from '@/lib/theme';

/**
 * 코치 주석. 채팅 안(inline)에서는 가운데에 위아래 괘선을 긋는다.
 * modal이면 코치 모달 본문으로 쓴다: 카드 바탕, 1.5 테두리. 보기와 버튼은 children으로 넣는다.
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
}) {
  const { p } = useSurface();
  const box = modal
    ? [s.modal, { backgroundColor: p.card, borderColor: p.ink }]
    : [s.inline, { borderColor: p.ink, marginTop: chatGap(prev, 'coach') }];
  return (
    <View style={box} accessibilityRole={modal ? undefined : 'summary'}>
      <Text style={[modal ? T.label : s.kicker, { color: p.sub }]}>{kicker}</Text>
      {lead ? <Text style={[modal ? T.body : s.lead, { color: p.ink }]}>{lead}</Text> : null}
      {expression ? <Text style={[modal ? s.exModal : s.ex, { color: p.ink }]}>{expression}</Text> : null}
      {meaning ? <Text style={[modal ? T.body : s.mean, { color: p.ink }]}>{meaning}</Text> : null}
      {description ? <Text style={[modal ? T.small : s.desc, { color: p.sub }]}>{description}</Text> : null}
      {words?.map((w) => (
        <View key={w.word} style={[s.word, { borderTopColor: p.line }]}>
          <Text style={[s.wordKey, { color: p.ink }]}>{w.word}</Text>
          <Text style={[T.small, { color: p.sub, flexShrink: 1, textAlign: 'right' }]}>{w.meaning}</Text>
        </View>
      ))}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  inline: { borderTopWidth: B.hair, borderBottomWidth: B.hair, paddingVertical: 10, paddingHorizontal: 2, gap: S.xs },
  modal: { borderWidth: B.base, borderRadius: R.xl, padding: S.md, gap: S.sm },
  kicker: { fontFamily: F.serifBlack, fontSize: 11, lineHeight: 16, letterSpacing: 2 },
  ex: { fontFamily: F.sansBold, fontSize: 16, lineHeight: 23 },
  exModal: { fontFamily: F.sansBold, fontSize: 17, lineHeight: 24 },
  mean: { fontFamily: F.serifBlack, fontSize: 14, lineHeight: 21 },
  desc: { fontFamily: F.serif, fontSize: 13, lineHeight: 20 },
  lead: { fontFamily: F.serif, fontSize: 14, lineHeight: 21 },
  word: { flexDirection: 'row', justifyContent: 'space-between', gap: S.sm, borderTopWidth: B.hair, paddingTop: 5 },
  wordKey: { fontFamily: F.sansBold, fontSize: 13, lineHeight: 19 },
});
