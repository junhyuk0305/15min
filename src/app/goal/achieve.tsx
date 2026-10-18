import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, H1, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { canAchieve, dayKeyOf, daysBetween, totalMinutes } from '@/lib/rules';
import { activeGoalOf, deviceTz, nowMs, recordsOf, useApp, type AppGoal } from '@/lib/store';
import { S, T } from '@/lib/theme';

const t = copy.achieve;

export default function Achieve() {
  const state = useApp();
  const goal = activeGoalOf(state);
  // 선언 뒤에는 활성 목표가 사라지므로 달성 화면에 보일 값을 붙잡아 둔다
  const [done, setDone] = useState<{ goal: AppGoal; days: number; total: number } | null>(null);

  if (done) {
    return (
      <Screen footer={<Button title={t.next} onPress={() => router.replace('/goal/new')} />}>
        <View style={{ flex: 1, justifyContent: 'center', gap: S.lg, minHeight: 420 }}>
          <Text style={T.hero}>{copy.unit.days(done.days)}</Text>
          <Text style={T.big}>{copy.unit.minutes(done.total)}</Text>
          <H1>{t.doneTitle(done.days)}</H1>
          <Text style={T.h2}>{t.doneShake}</Text>
        </View>
      </Screen>
    );
  }

  const today = dayKeyOf(nowMs(), deviceTz);
  if (!goal || !canAchieve(goal, today)) {
    return (
      <Screen footer={<Button title={t.cancel} kind="secondary" onPress={() => router.back()} />}>
        {null}
      </Screen>
    );
  }

  const days = daysBetween(goal.firstDay, today);
  const total = totalMinutes(recordsOf(state, goal.id));

  const declare = () => {
    setDone({ goal, days: goal.periodDays, total });
    state.achieve();
  };

  return (
    <Screen
      footer={
        <>
          <Button title={t.declare} onPress={declare} />
          <Button title={t.cancel} kind="secondary" onPress={() => router.back()} />
        </>
      }
    >
      <H1>{t.confirmTitle}</H1>
      <Body>{goal.name}</Body>
      <View style={{ gap: S.md }}>
        <View>
          <Label>{t.startDate}</Label>
          <Text style={T.h2}>{goal.firstDay.replace(/-/g, '.')}</Text>
        </View>
        <View>
          <Label>{t.elapsed}</Label>
          <Text style={T.big}>{copy.unit.days(days)}</Text>
        </View>
        <View>
          <Label>{t.total}</Label>
          <Text style={T.big}>{copy.unit.minutes(total)}</Text>
        </View>
        <View>
          <Label>{t.reason}</Label>
          <Body>{goal.reason}</Body>
        </View>
      </View>
    </Screen>
  );
}
