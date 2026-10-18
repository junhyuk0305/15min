import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Appear } from '@/components/Appear';
import { CountUp } from '@/components/CountUp';
import { ErrorLine } from '@/components/ErrorLine';
import { Header } from '@/components/Header';
import { Body, Button, H1, Label, Row, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { heavy } from '@/lib/haptics';
import { DUR } from '@/lib/motion';
import { achieveDay, canAchieve, daysBetween, totalMinutes } from '@/lib/rules';
import { goalDaysOf, todayKey, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { useBlockBack } from '@/lib/useBlockBack';
import { B, C, S, T } from '@/lib/theme';

const t = copy.achieve;

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const dateOf = (day: string) => t.date(Number(day.slice(5, 7)), Number(day.slice(8, 10)));

/** 숫자 둘을 150ms 간격으로 세고, 다 센 뒤 500ms 지나 흔드는 한 줄이 나타난다(갭분석 F10) */
const STAGGER = 150;
const SHAKE_AT = DUR.count + STAGGER + 500;

/** A2 달성. 선언한 뒤에는 뒤로 갈 수 없고 새 목표 만들기로만 간다 (기획서 5.4, MP S15) */
function Celebration({ days, total }: { days: number; total: number }) {
  useBlockBack();
  useEffect(() => {
    heavy();
  }, []);
  return (
    <Screen header={<Header title={t.doneHeader} left="none" reason={t.locked} />} footer={<Button title={t.next} onPress={() => router.replace('/goal/new')} />}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={{ flex: 1, justifyContent: 'center', gap: S.md, minHeight: 420 }}>
        <CountUp value={days} format={copy.unit.days} style={[T.hero, { fontSize: 64, lineHeight: 72 }]} />
        <CountUp value={total} format={copy.unit.minutes} style={T.big} delay={STAGGER} />
        <View style={{ borderTopWidth: B.hair, borderTopColor: C.line }} />
        <Body serif>{t.doneTitle(days)}</Body>
        <Appear delay={SHAKE_AT}>
          <Body serif muted>
            {t.doneShake}
          </Body>
        </Appear>
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
  // 선언 요청이 끝나기 직전에 활성 목표가 먼저 사라진다(store가 lastGoal로 옮김). 빈 화면 대신 바로 축하 화면을 그린다.
  // 이어서 done이 채워져도 같은 자리의 같은 부품이라 다시 그리지 않고 카운트업이 이어진다(U9 M2)
  if (!goal && declareAction.busy && state.lastGoal) {
    const last = state.lastGoal;
    return <Celebration days={last.periodDays} total={totalMinutes(state.days.filter((d) => d.goalId === last.id))} />;
  }
  if (!goal) {
    return (
      <Screen header={<Header title={t.header} onLeft={back} />} footer={<Button title={t.home} onPress={() => router.replace('/')} />}>
        <View style={{ flex: 1, justifyContent: 'center', minHeight: 360 }}>
          <H1>{t.noGoal}</H1>
        </View>
      </Screen>
    );
  }
  if (!canAchieve(goal, today)) {
    return (
      <Screen header={<Header title={t.header} onLeft={back} />}>
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
      header={<Header title={t.header} onLeft={back} />}
      footer={
        <>
          <ErrorLine message={declareAction.message} />
          <Button title={t.declare} busy={declareAction.busy} onPress={() => void declare()} />
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
