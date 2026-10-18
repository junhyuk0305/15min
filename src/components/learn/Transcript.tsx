import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChatLine, chatGap, LineEnter, TypingLine, type ChatSpeaker } from '@/components/ChatLine';
import { CoachNote } from '@/components/CoachNote';
import { LongPressTip } from '@/components/LineMenu';
import { copy } from '@/lib/copy';
import type { Line } from '@/lib/learn';
import { CHAT_GAP } from '@/lib/theme';

const t = copy.learn;

/** 길게 눌렀을 때 복사할 글. 코치 줄은 표현과 뜻까지 */
export const lineText = (l: Line) => (l.kind === 'coach' && l.modal?.expression ? [l.text, l.modal.expression.en, l.modal.expression.ko].filter(Boolean).join('\n') : l.text);

/**
 * 웹소설식 대화(docs/ia-screens.html 세션). 말풍선 없이 상대는 왼쪽, 나는 오른쪽, 코치는 가운데 괘선 주석.
 * 회고, 목표 정하기, 반성문(coachSpeaks)에서는 코치가 대화 상대라 왼쪽 대사로 그린다.
 * 상대와 코치 줄을 길게 누르면 onLine(신고, 복사 시트). 신고할 수 있는 첫 줄 아래에 한 번 안내 말풍선을 띄운다.
 * target 줄은 글자 단위로 보인다. 처음 그릴 때 없던 상대, 코치 줄(isNew)은 페이드와 8px 올라옴으로 들어온다. 내 줄은 바로 보인다.
 * waiting이면 화자 이름 아래 점 3개. note는 그 옆 작은 글자(학습 시계 고지).
 * 학습과 회고는 1초마다 다시 그려진다. 줄이 200개여도 시계 때문에 목록을 다시 그리지 않게 memo로 감싼다(UXP 6.3). 넘기는 함수는 고정한다.
 */
export const Transcript = memo(function Transcript({
  lines,
  partnerName,
  coachSpeaks,
  waiting,
  note,
  target,
  isNew,
  onLine,
}: {
  lines: Line[];
  partnerName: string;
  coachSpeaks?: boolean;
  waiting?: boolean;
  note?: string;
  target?: string | null;
  isNew?: (id: string) => boolean;
  onLine?: (line: Line) => void;
}) {
  const speakers: ChatSpeaker[] = lines.map((l) => (l.kind === 'me' ? 'me' : l.kind === 'partner' || coachSpeaks ? 'partner' : 'coach'));
  const prev = speakers.at(-1) ?? null;
  const tipAt = onLine ? lines.findIndex((l) => l.kind !== 'me' && l.reportable) : -1;
  const out = lines.map((l, i) => {
    const speaker = speakers[i];
    const before = i > 0 ? speakers[i - 1] : null;
    if (l.kind === 'me') {
      return (
        <View key={l.key} style={{ opacity: l.pending ? 0.55 : 1 }}>
          <ChatLine speaker="me" text={l.text} who={t.me} prev={before} />
        </View>
      );
    }
    const reveal = target === l.id;
    const coach = speaker === 'coach' && l.kind === 'coach';
    let body: ReactNode;
    if (coach) {
      const ex = l.modal?.expression;
      body = (
        <CoachNote
          kicker={t.coach}
          lead={ex ? l.text : undefined}
          expression={ex?.en}
          meaning={ex?.ko}
          description={ex ? ex.note : l.text}
          words={l.modal?.words.map((w) => ({ word: w.en, meaning: w.ko }))}
          reveal={reveal}
        />
      );
    } else {
      body = <ChatLine speaker="partner" text={l.text} who={l.kind === 'coach' ? t.coach : partnerName} prev={before} reveal={reveal} />;
    }
    return (
      <LineEnter key={l.key} animate={!!isNew?.(l.id)} style={coach ? { marginTop: chatGap(before, 'coach') } : undefined}>
        <Pressable onLongPress={onLine ? () => onLine(l) : undefined} delayLongPress={400} disabled={!onLine}>
          {body}
        </Pressable>
        {i === tipAt ? <LongPressTip /> : null}
      </LineEnter>
    );
  });
  return (
    <View style={{ flexGrow: 1, justifyContent: 'flex-end' }}>
      {out}
      {waiting ? <TypingLine who={coachSpeaks ? t.coach : partnerName} note={note} prev={prev} /> : null}
      <View style={{ height: CHAT_GAP.same }} />
    </View>
  );
});
