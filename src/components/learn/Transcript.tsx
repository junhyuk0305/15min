import { View } from 'react-native';
import { ChatLine, chatGap, type ChatSpeaker } from '@/components/ChatLine';
import { CoachNote } from '@/components/CoachNote';
import { ReportButton } from '@/components/learn/parts';
import { copy } from '@/lib/copy';
import type { Line } from '@/lib/learn';
import { CHAT_GAP } from '@/lib/theme';

const t = copy.learn;

/**
 * 웹소설식 대화(docs/ia-screens.html 세션). 말풍선 없이 상대는 왼쪽, 나는 오른쪽, 코치는 가운데 괘선 주석.
 * 회고(coachSpeaks)에서는 코치가 대화 상대라 왼쪽 대사로 그린다. 상대와 코치 줄 옆에 신고 아이콘.
 */
export function Transcript({
  lines,
  partnerName,
  coachSpeaks,
  waiting,
  onReport,
}: {
  lines: Line[];
  partnerName: string;
  coachSpeaks?: boolean;
  waiting?: boolean;
  onReport: (id: string) => void;
}) {
  const speakers: ChatSpeaker[] = lines.map((l) => (l.kind === 'me' ? 'me' : l.kind === 'partner' || coachSpeaks ? 'partner' : 'coach'));
  const prev = speakers.at(-1) ?? null;
  const out = lines.map((l, i) => {
    const speaker = speakers[i];
    const before = i > 0 ? speakers[i - 1] : null;
    if (speaker === 'coach' && l.kind === 'coach') {
      const ex = l.modal?.expression;
      return (
        <View key={l.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: chatGap(before, 'coach') }}>
          <View style={{ flex: 1 }}>
            <CoachNote
              kicker={t.coach}
              lead={ex ? l.text : undefined}
              expression={ex?.en}
              meaning={ex?.ko}
              description={ex ? ex.note : l.text}
              words={l.modal?.words.map((w) => ({ word: w.en, meaning: w.ko }))}
            />
          </View>
          <View style={{ paddingTop: 8 }}>
            <ReportButton onPress={() => onReport(l.id)} />
          </View>
        </View>
      );
    }
    const me = speaker === 'me';
    const who = me ? t.me : l.kind === 'coach' ? t.coach : partnerName;
    const line = <ChatLine speaker={me ? 'me' : 'partner'} text={l.text} who={who} prev={before} />;
    if (me) {
      const pending = l.kind === 'me' && l.pending;
      return (
        <View key={l.key} style={{ opacity: pending ? 0.55 : 1 }}>
          {line}
        </View>
      );
    }
    return (
      <View key={l.key} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        <View style={{ flex: 1 }}>{line}</View>
        {l.reportable ? <ReportButton onPress={() => onReport(l.id)} /> : null}
      </View>
    );
  });
  return (
    <View style={{ flexGrow: 1, justifyContent: 'flex-end' }}>
      {out}
      {waiting ? <ChatLine speaker="narration" text={t.waiting} prev={prev} /> : null}
      <View style={{ height: CHAT_GAP.same }} />
    </View>
  );
}
