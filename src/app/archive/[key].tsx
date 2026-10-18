import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ChatLine, type ChatSpeaker } from '@/components/ChatLine';
import { CoachNote } from '@/components/CoachNote';
import { ErrorLine } from '@/components/ErrorLine';
import { StatusBanner } from '@/components/StatusBanner';
import { TextButton } from '@/components/TextButton';
import { Body, Label, Screen } from '@/components/ui';
import { charsByDay, dayId, phaseGroups } from '@/lib/archive';
import { copy } from '@/lib/copy';
import { phaseName } from '@/lib/learn';
import type { LessonModal, Message } from '@/lib/model';
import { loadPhaseOf } from '@/lib/selectors';
import { messagesOf, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { useLoadPhase } from '@/lib/useLoadPhase';
import { B, C, S, T } from '@/lib/theme';

const t = copy.archive;

const back = () => (router.canGoBack() ? router.back() : router.replace('/archive'));

/** 대화 한 줄. 상대와 나는 웹소설 줄, 코치는 괘선 주석 (D안). 읽기 전용 */
function Line({ m, prev, partner }: { m: Message; prev: ChatSpeaker | null; partner: string }) {
  if (m.role === 'coach') {
    const modal = m.meta.modal as LessonModal | undefined;
    const quiz = m.meta.quiz as { level_check?: boolean; index?: number } | undefined;
    return (
      <CoachNote
        prev={prev}
        kicker={quiz ? (quiz.level_check ? copy.learn.levelCheck((quiz.index ?? 0) + 1) : t.quiz) : t.coach}
        lead={modal?.expression ? m.text : undefined}
        expression={modal?.expression?.en}
        meaning={modal?.expression?.ko}
        description={modal?.expression ? modal.expression.note : m.text}
        words={modal?.words.map((w) => ({ word: w.en, meaning: w.ko }))}
      />
    );
  }
  if (m.role === 'system') return <ChatLine speaker="narration" text={m.text} prev={prev} />;
  const me = m.role === 'user';
  return <ChatLine speaker={me ? 'me' : 'partner'} who={me ? t.me : partner} text={m.text} prev={prev} />;
}

const speakerOf = (m: Message): ChatSpeaker => (m.role === 'coach' ? 'coach' : m.role === 'user' ? 'me' : m.role === 'partner' ? 'partner' : 'narration');

/** R2 카드 상세: 오늘의 이유, 단계별 대화, 회고 */
export default function ArchiveDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const id = decodeURIComponent(key ?? '');
  const state = useApp();
  const rec = state.days.find((d) => dayId(d.goalId, d.day) === id);
  const goal = rec ? state.goals.find((g) => g.id === rec.goalId) : undefined;
  const load = useAction();
  const phase = useLoadPhase(load.busy);
  const loadDayMessages = state.loadDayMessages;

  const run = () => {
    if (rec) void load.run(() => loadDayMessages(rec.goalId, rec.day));
  };
  useEffect(run, [rec?.goalId, rec?.day]); // eslint-disable-line react-hooks/exhaustive-deps

  // 서버 읽기가 실패해 배너가 떠 있으면 다시 불러오기는 배너 하나만 둔다. 배너로 다시 읽기에 성공하면 대화도 다시 읽는다
  const loadFailed = state.loadFailed;
  const wasFailed = useRef(loadFailed);
  useEffect(() => {
    if (wasFailed.current && !loadFailed) run();
    wasFailed.current = loadFailed;
  }, [loadFailed]); // eslint-disable-line react-hooks/exhaustive-deps

  const footer = <TextButton title={t.back} onPress={back} />;
  if (!rec || !goal) {
    return (
      <Screen footer={footer}>
        <View style={{ flex: 1, justifyContent: 'center', minHeight: 360 }}>
          <Body muted>{t.notFound}</Body>
        </View>
      </Screen>
    );
  }

  const messages = messagesOf(state, rec.goalId, rec.day);
  const groups = phaseGroups(messages);
  const chars = charsByDay(messages.filter((m) => m.role === 'user').map((m) => ({ goalId: rec.goalId, day: rec.day, phase: m.phase, text: m.text }))).get(id) ?? 0;
  const [mm, dd] = [Number(rec.day.slice(5, 7)), Number(rec.day.slice(8, 10))];
  const status = loadPhaseOf(phase, load.error !== null);

  return (
    <Screen footer={footer}>
      <StatusBanner />
      <View style={{ gap: S.xs, paddingBottom: S.sm, borderBottomWidth: B.hair, borderBottomColor: C.ink }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: S.sm }}>
          <Text style={[T.label, { color: C.sub }]}>{t.date(mm, dd)}</Text>
          <Text style={[T.label, { color: C.sub }]}>{t.minutes(Math.floor(rec.activeSeconds / 60))}</Text>
          {goal.situation.partner ? <Text style={[T.label, { color: C.sub }]}>{goal.situation.partner}</Text> : null}
          {groups.length > 0 ? <Text style={[T.label, { color: C.sub }]}>{t.chars(chars)}</Text> : null}
        </View>
        <Text style={[T.small, { color: C.sub }]}>{goal.name}</Text>
        <Label>{t.reason}</Label>
        <Text style={[T.h2, { fontFamily: T.h1Serif.fontFamily }]}>{rec.todayReason ?? ''}</Text>
      </View>

      {status === 'loading' ? (
        <View accessibilityRole="progressbar" style={{ flexDirection: 'row', gap: S.sm, alignItems: 'center' }}>
          <ActivityIndicator color={C.ink} />
          <Text style={[T.small, { color: C.sub }]}>{t.loading}</Text>
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={{ gap: S.xs }}>
          <ErrorLine message={load.error ? load.message : t.loadError} />
          {loadFailed ? null : <TextButton title={t.retry} onPress={run} style={{ alignSelf: 'flex-start' }} />}
        </View>
      ) : null}
      {status === 'idle' && groups.length === 0 ? <Body muted>{t.noChat}</Body> : null}

      {groups.map((g) => (
        <View key={g.phase} style={{ gap: S.xs }}>
          <Label>{phaseName(g.phase, g.levelCheck)}</Label>
          <View>
            {g.messages.map((m, i) => (
              <Line key={m.id} m={m} prev={i === 0 ? null : speakerOf(g.messages[i - 1])} partner={goal.situation.partner} />
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
