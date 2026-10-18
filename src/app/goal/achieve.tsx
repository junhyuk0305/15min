import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { TextButton } from '@/components/TextButton';
import { Body, Button, H1, Label, Row, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { achieveDay, canAchieve, daysBetween, totalMinutes } from '@/lib/rules';
import { goalDaysOf, todayKey, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { useBlockBack } from '@/lib/useBlockBack';
import { B, C, S, T } from '@/lib/theme';

const t = copy.achieve;

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const dateOf = (day: string) => t.date(Number(day.slice(5, 7)), Number(day.slice(8, 10)));

/** A2 달성. 선언한 뒤에는 뒤로 갈 수 없고 새 목표 만들기로만 간다 (기획서 5.4, MP S15) */
function Celebration({ days, total }: { days: number; total: number }) {
  useBlockBack();
  return (
    <Screen footer={<Button title={t.next} onPress={() => router.replace('/goal/new')} />}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={{ flex: 1, justifyContent: 'center', gap: S.md, minHeight: 420 }}>
        <Text style={[T.hero, { fontSize: 64, lineHeight: 72 }]}>{copy.unit.days(days)}</Text>
        <Text style={T.big}>{copy.unit.minutes(total)}</Text>
        <View style={{ borderTopWidth: B.hair, borderTopColor: C.line }} />
        <Body serif>{t.doneTitle(days)}</Body>
        <Body serif muted>
          {t.doneShake}
        </Body>
      </View>
    </Screen>
  );
}

export default function Achieve() {
  const state = useApp();
  const goal = state.goal;
  const declareAction = useAction();
  // 선언 뒤에는 활성 목표가 사라지므로 달성 화면에 보일 값을 붙잡아 둔다
  const [done, setDone] = useState<{ days: number; total: number } | null>(null);

  if (done) return <Celebration days={done.days} total={done.total} />;

  const today = todayKey(state);
  if (!goal) {
    return (
      <Screen footer={<Button title={t.home} onPress={() => router.replace('/')} />}>
        <View style={{ flex: 1, justifyContent: 'center', minHeight: 360 }}>
          <H1>{t.noGoal}</H1>
        </View>
      </Screen>
    );
  }
  if (!canAchieve(goal, today)) {
    return (
      <Screen footer={<Button title={t.cancel} onPress={back} />}>
        <View style={{ flex: 1, justifyContent: 'center', gap: S.md, minHeight: 360 }}>
          <H1>{t.notYet(daysBetween(today, achieveDay(goal)))}</H1>
          <Body muted>{t.notYetBody}</Body>
        </View>
      </Screen>
    );
  }

  const elapsed = daysBetween(goal.firstDay, today);
  const total = totalMinutes(goalDaysOf(state));

  const declare = async () => {
    const achieved = await declareAction.run(state.declareAchievement);
    if (achieved) setDone({ days: achieved.periodDays, total });
  };

  return (
    <Screen
      footer={
        <>
          <ErrorLine message={declareAction.message} />
          <Button title={t.declare} busy={declareAction.busy} onPress={() => void declare()} />
          <TextButton title={t.cancel} onPress={back} />
        </>
      }
    >
      <Text style={[T.small, { color: C.sub }]}>{goal.name}</Text>
      <H1>{t.confirmTitle}</H1>
      <View>
        <Row left={t.startDate} right={dateOf(goal.firstDay)} />
        <Row left={t.elapsed} right={copy.unit.days(elapsed)} />
        <Row left={t.total} right={copy.unit.minutes(total)} />
      </View>
      <View style={{ gap: S.xs }}>
        <Label>{t.reason}</Label>
        <Body serif>{goal.reason}</Body>
      </View>
    </Screen>
  );
}
