import { StyleSheet, Text, View } from 'react-native';
import { useInk } from '@/components/surface';
import { CHAT_GAP, F } from '@/lib/theme';

/**
 * 웹소설식 채팅 한 줄 (D안). 말풍선 없음.
 * 상대는 왼쪽, 나는 오른쪽, 지문은 전체 폭. 코치는 CoachNote가 가운데 괘선 주석으로 그린다.
 * 대사는 따옴표 안 명조. 상대는 400, 나는 900. 속마음은 회색 명조. 긁는 한 줄은 빨강.
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
}: {
  speaker: Exclude<ChatSpeaker, 'coach'>;
  kind?: ChatLineKind;
  text: string;
  /** 화자 이름(역할 이름, "나"). 화자가 바뀐 첫 줄에만 보인다 */
  who?: string;
  /** 앞 줄의 화자. 간격과 이름 표시를 정한다 */
  prev?: ChatSpeaker | null;
}) {
  const { ink, sub, alert } = useInk();
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
      <Text style={[line, { textAlign: me ? 'right' : 'left' }]}>{kind === 'say' ? `“${text}”` : text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  who: { fontFamily: F.serifBlack, fontSize: 11, lineHeight: 16, letterSpacing: 2 },
  say: { fontSize: 15, lineHeight: 26, maxWidth: '92%' },
  thought: { fontFamily: F.serif, fontSize: 14, lineHeight: 24, maxWidth: '92%' },
  narration: { fontFamily: F.serif, fontSize: 14, lineHeight: 24 },
});
