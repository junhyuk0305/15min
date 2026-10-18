import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { Body, Button, H1, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import type { AppGoal } from '@/lib/model';
import { canAchieve, daysBetween, totalMinutes } from '@/lib/rules';
import { goalDaysOf, todayKey, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { S, T } from '@/lib/theme';

const t = copy.achieve;

export default function Achieve() {
  const state = useApp();
  const goal = state.goal;
  const declareAction = useAction();
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

  const today = todayKey(state);
  if (!goal || !canAchieve(goal, today)) {
    return (
      <Screen footer={<Button title={t.cancel} kind="secondary" onPress={() => router.back()} />}>
        {null}
      </Screen>
    );
  }

  const days = daysBetween(goal.firstDay, today);
  const total = totalMinutes(goalDaysOf(state));

  const declare = async () => {
    const achieved = await declareAction.run(state.declareAchievement);
    if (achieved) setDone({ goal: achieved, days: goal.periodDays, total });
  };

  return (
    <Screen
      footer={
        <>
          <ErrorLine message={declareAction.message} />
          <Button title={t.declare} busy={declareAction.busy} onPress={() => void declare()} />
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
