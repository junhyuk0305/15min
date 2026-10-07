import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, H1, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { canAchieve, daysSinceStart, totalMinutes, type Goal } from '@/lib/rules';
import { activeGoalOf, nowMs, recordsOf, useApp } from '@/lib/store';
import { S, T } from '@/lib/theme';

const t = copy.achieve;

export default function Achieve() {
  const state = useApp();
  const goal = activeGoalOf(state);
  // 선언 뒤에는 활성 목표가 사라지므로 달성 화면에 보일 값을 붙잡아 둔다
  const [done, setDone] = useState<{ goal: Goal; days: number; total: number } | null>(null);

  if (done) {
    return (
      <Screen footer={<Button title={t.next} onPress={() => router.replace('/goal/new')} />}>
        <View style={{ flex: 1, justifyContent: 'center', gap: S.lg, minHeight: 420 }}>
          <Text style={T.hero}>{`${done.days}일`}</Text>
          <Text style={T.big}>{`${done.total.toLocaleString()}분`}</Text>
          <H1>{t.doneTitle(done.days)}</H1>
          <Text style={T.h2}>{t.doneShake}</Text>
        </View>
      </Screen>
    );
  }

  if (!goal || !canAchieve(goal, nowMs())) {
    return (
      <Screen footer={<Button title={t.cancel} kind="secondary" onPress={() => router.back()} />}>
        {null}
      </Screen>
    );
  }

  const days = daysSinceStart(goal, nowMs());
  const total = totalMinutes(recordsOf(state, goal.id));
  const start = new Date(goal.createdAt);

  const declare = () => {
    setDone({ goal, days, total });
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
          <Text style={T.h2}>{`${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()}`}</Text>
        </View>
        <View>
          <Label>{t.elapsed}</Label>
          <Text style={T.big}>{`${days}일`}</Text>
        </View>
        <View>
          <Label>{t.total}</Label>
          <Text style={T.big}>{`${total.toLocaleString()}분`}</Text>
        </View>
        <View>
          <Label>{t.reason}</Label>
          <Body>{goal.reason}</Body>
        </View>
      </View>
    </Screen>
  );
}
