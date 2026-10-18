import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { H1, Label, Row, Screen, useNow } from '@/components/ui';
import { copy } from '@/lib/copy';
import { openSystemSettings } from '@/lib/notify';
import { buildPlan } from '@/lib/plan';
import { fmtClock } from '@/lib/rules';
import { useRuntime } from '@/lib/runtime';
import { activeGoalOf, lastEndedGoal, useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

const t = copy.settings;

/** 개발 빌드에서만 보인다. 웹에서 하루 사이클과 30일 달성을 확인하는 용도다. */
function DevTools() {
  const now = useNow();
  const state = useApp();
  const goal = activeGoalOf(state);
  const plan = buildPlan({ goal, lastGoal: goal ? null : lastEndedGoal(state), records: Object.values(state.records), now });
  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${fmtClock(d.getHours() * 60 + d.getMinutes())}`;
  };
  return (
    <View style={{ gap: S.xs, marginTop: S.lg }}>
      <Label>{t.dev}</Label>
      <Text style={[T.small, { color: C.sub }]}>{t.devStatus(fmt(now), plan.length, plan[0] ? fmt(plan[0].at) : null)}</Text>
      {plan[0] ? <Text style={[T.small, { color: C.sub }]}>{plan[0].body}</Text> : null}
      <Row left={t.devPlus10Min} onPress={() => state.shiftTime(10 * 60_000)} />
      <Row left={t.devPlus1Hour} onPress={() => state.shiftTime(3600_000)} />
      <Row left={t.devPlus1Day} onPress={() => state.shiftTime(86400_000)} />
      <Row left={t.devPlus30Days} onPress={() => state.shiftTime(30 * 86400_000)} />
      <Row left={t.devReset} onPress={() => state.resetTime()} />
    </View>
  );
}

export default function Settings() {
  const state = useApp();
  const permission = useRuntime((s) => s.permission);
  const goal = activeGoalOf(state);

  return (
    <Screen>
      <H1>{t.title}</H1>
      {goal ? (
        <>
          <Row left={t.goal} right={goal.name} onPress={() => router.push('/settings/goal')} />
          <Row left={t.coupons} right={copy.unit.sheets(goal.coupons)} onPress={() => router.push('/coupon')} />
        </>
      ) : null}
      <Row left={t.notif} right={permission === 'granted' ? t.notifOn : t.notifOff} onPress={permission === 'granted' ? undefined : openSystemSettings} />
      {__DEV__ ? <DevTools /> : null}
    </Screen>
  );
}
