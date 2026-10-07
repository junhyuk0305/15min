import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { daysSinceStart, giveupAction, GIVEUP_MAX_WAITS, totalMinutes } from '@/lib/rules';
import { activeGoalOf, nowMs, recordsOf, useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

const t = copy.giveup;

export default function Giveup() {
  const state = useApp();
  const goal = activeGoalOf(state);
  if (!goal) return null;
  const willDelete = giveupAction(goal) === 'delete';
  const days = daysSinceStart(goal, nowMs()) + 1;
  const total = totalMinutes(recordsOf(state, goal.id));

  const apply = () => {
    const r = state.requestGiveup();
    if (r === 'deleted') router.replace({ pathname: '/goal/new', params: { deleted: '1' } });
    else router.replace('/');
  };

  // 계속하기를 더 크게, 위에 둔다
  const footer = (
    <>
      <Button title={t.keep} kind="inverse" onPress={() => router.back()} style={{ minHeight: 64 }} />
      <Text accessibilityRole="button" onPress={apply} style={[T.small, { color: C.redInk, textAlign: 'center', textDecorationLine: 'underline', paddingVertical: S.md }]}>
        {willDelete ? t.deleteConfirm : t.apply}
      </Text>
    </>
  );

  if (willDelete) {
    return (
      <Screen danger footer={footer}>
        <Text style={[T.h1, { color: C.redInk, fontSize: 36, lineHeight: 46 }]}>{t.deleteTitle}</Text>
        <Text style={[T.h2, { color: C.redInk }]}>{t.deleteBody}</Text>
      </Screen>
    );
  }

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
      <Label inverse>{t.waitsLeft(GIVEUP_MAX_WAITS - goal.giveupCount)}</Label>
    </Screen>
  );
}
