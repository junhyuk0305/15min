import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { dayKeyOf, daysBetween, suspensionFor, totalMinutes } from '@/lib/rules';
import { activeGoalOf, deviceTz, nowMs, recordsOf, useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

const t = copy.giveup;

export default function Giveup() {
  const state = useApp();
  const goal = activeGoalOf(state);
  if (!goal) return null;
  const days = Math.max(0, daysBetween(goal.firstDay, dayKeyOf(nowMs(), deviceTz)) + 1);
  const total = totalMinutes(recordsOf(state, goal.id));
  // 이번 포기가 확정되면 몇 번째인지
  const next = suspensionFor(state.giveupConfirmedCount + 1);

  const apply = () => {
    state.requestGiveup();
    router.replace('/');
  };

  // 계속하기를 더 크게, 위에 둔다
  const footer = (
    <>
      <Button title={t.keep} kind="inverse" onPress={() => router.back()} style={{ minHeight: 64 }} />
      <Text accessibilityRole="button" onPress={apply} style={[T.small, { color: C.redInk, textAlign: 'center', textDecorationLine: 'underline', paddingVertical: S.md }]}>
        {t.apply}
      </Text>
    </>
  );

  return (
    <Screen danger footer={footer}>
      <Text style={[T.h1, { color: C.redInk }]}>{t.title}</Text>
      <Text style={[T.h2, { color: C.redInk }]}>{t.scratch(goal.targetMinutes)}</Text>
      <View style={{ gap: S.xs }}>
        <Label inverse>{t.reason}</Label>
        <Body inverse>{goal.reason}</Body>
      </View>
      <Text style={[T.big, { color: C.redInk }]}>{t.stats(days, total)}</Text>
      <Body inverse>{t.waitInfo}</Body>
      <Label inverse>{t.suspension(next.banned ? null : next.days)}</Label>
    </Screen>
  );
}
