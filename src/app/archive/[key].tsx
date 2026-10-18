import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, H1, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { findBot, useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

const t = copy.archive;

export default function ArchiveDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const state = useApp();
  const rec = state.records[decodeURIComponent(key ?? '')];
  const goal = rec ? state.goals.find((g) => g.id === rec.goalId) : undefined;
  if (!rec || !goal || goal.status === 'given_up') {
    return <Screen footer={<Button title={copy.coupon.back} kind="secondary" onPress={() => router.back()} />}>{null}</Screen>;
  }

  return (
    <Screen footer={<Button title={copy.coupon.back} kind="secondary" onPress={() => router.back()} />}>
      <H1>{rec.day.replace(/-/g, '.')}</H1>
      <Label>{`${t.minutes(Math.floor(rec.activeSeconds / 60))}   ${findBot(state.customBots, rec.botId).name}   ${t.chars(rec.chars)}`}</Label>
      <View style={{ gap: S.xs }}>
        <Label>{t.reason}</Label>
        <Body>{rec.reason}</Body>
      </View>
      <View style={{ gap: S.sm }}>
        <Label>{t.chat}</Label>
        {rec.messages.map((m, i) => (
          <View
            key={i}
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
      <View style={{ gap: S.xs }}>
        <Label>{t.review}</Label>
        <Body>{rec.review}</Body>
      </View>
    </Screen>
  );
}
