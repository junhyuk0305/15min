import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { dayKeyOf, settingsFor, streakOf, totalMinutes } from '@/lib/rules';
import { activeGoalOf, deviceTz, keyOf, nowMs, recordsOf, useApp } from '@/lib/store';
import { S, T } from '@/lib/theme';

const t = copy.session;

export default function Done() {
  const { earned } = useLocalSearchParams<{ earned?: string }>();
  const state = useApp();
  const goal = activeGoalOf(state);
  if (!goal) return null;
  const today = dayKeyOf(nowMs(), deviceTz);
  const rec = state.records[keyOf(goal.id, today)];
  const minutes = Math.floor((rec?.activeSeconds ?? 0) / 60);
  const mine = recordsOf(state, goal.id);
  const total = totalMinutes(mine);
  const streak = streakOf(mine, goal.firstDay, today, settingsFor(goal, today).weekdays);

  return (
    <Screen footer={<Button title={t.ok} onPress={() => router.replace('/')} />}>
      <View style={{ flex: 1, justifyContent: 'center', gap: S.lg, minHeight: 420 }}>
        <Text style={T.h1}>{t.doneTitle(minutes)}</Text>
        <View style={{ flexDirection: 'row', gap: S.lg }}>
          <View>
            <Label>{copy.home.total}</Label>
            <Text style={T.big}>{copy.unit.minutes(total)}</Text>
          </View>
          <View>
            <Label>{copy.home.streakLabel}</Label>
            <Text style={T.big}>{copy.unit.days(streak)}</Text>
          </View>
        </View>
        {earned === '1' ? <Body>{t.couponEarned}</Body> : null}
        <Text style={T.h2}>{t.doneShake}</Text>
      </View>
    </Screen>
  );
}
