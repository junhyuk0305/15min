import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { Body, Button, H1, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { dayKeyId } from '@/lib/model';
import { messagesOf, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { C, S, T } from '@/lib/theme';

const t = copy.archive;

export default function ArchiveDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const id = decodeURIComponent(key ?? '');
  const state = useApp();
  const rec = state.days.find((d) => dayKeyId(d.goalId, d.day) === id);
  const goal = rec ? state.goals.find((g) => g.id === rec.goalId) : undefined;
  const load = useAction();
  const loadDayMessages = state.loadDayMessages;

  useEffect(() => {
    if (rec) void load.run(() => loadDayMessages(rec.goalId, rec.day));
    // 날이 바뀔 때만 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.goalId, rec?.day]);

  const back = <Button title={copy.coupon.back} kind="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/archive'))} />;
  if (!rec || !goal) {
    return (
      <Screen footer={back}>
        <Body muted>{t.empty}</Body>
      </Screen>
    );
  }
  const messages = messagesOf(state, rec.goalId, rec.day);
  const retro = messages.filter((m) => m.phase === 'retro' && m.role === 'user');

  return (
    <Screen footer={back}>
      <H1>{rec.day.replace(/-/g, '.')}</H1>
      <Label>{`${t.minutes(Math.floor(rec.activeSeconds / 60))}   ${goal.name}`}</Label>
      <View style={{ gap: S.xs }}>
        <Label>{t.reason}</Label>
        <Body>{rec.todayReason ?? ''}</Body>
      </View>
      <ErrorLine message={load.message} />
      <View style={{ gap: S.sm }}>
        <Label>{t.chat}</Label>
        {messages
          .filter((m) => m.phase !== 'retro')
          .map((m) => (
            <View
              key={m.id}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                backgroundColor: m.role === 'user' ? C.ink : C.card,
                borderRadius: 14,
                padding: S.md,
                borderWidth: m.role === 'user' ? 0 : 1,
                borderColor: C.line,
              }}
            >
              <Text style={[T.body, { color: m.role === 'user' ? C.card : C.ink }]}>{m.text}</Text>
            </View>
          ))}
      </View>
      {retro.length > 0 ? (
        <View style={{ gap: S.xs }}>
          <Label>{t.review}</Label>
          {retro.map((m) => (
            <Body key={m.id}>{m.text}</Body>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
