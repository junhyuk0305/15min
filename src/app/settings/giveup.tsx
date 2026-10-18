import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { Header } from '@/components/Header';
import { TextButton } from '@/components/TextButton';
import { Big, Body, Button, Label, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { daysBetween, GIVEUP_MAX_CONFIRMED, suspensionFor, totalMinutes } from '@/lib/rules';
import { goalDaysOf, todayKey, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { C, S, T } from '@/lib/theme';

const t = copy.giveup;

const keep = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * G1 포기 확인. 계속하기가 주 버튼 모양이고 더 크다. 포기 신청은 글자 버튼이고 한 번 더 확인한다 (MP 7.5-4, 화면구성 5절).
 */
export default function Giveup() {
  const state = useApp();
  const goal = state.goal;
  const request = useAction();
  const [confirming, setConfirming] = useState(false);
  // 2단계에서 Android 뒤로는 헤더 chevron과 같이 1단계로 돌아간다(MP 7.7-2 "앞 화면으로")
  useEffect(() => {
    if (!confirming) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setConfirming(false);
      return true;
    });
    return () => sub.remove();
  }, [confirming]);
  if (!goal) return null; // route.ts가 홈으로 보낸다

  if (goal.giveupRequestedAt !== null) {
    return (
      <Screen
        danger
        header={<Header title={t.header} onLeft={keep} />}
        footer={<Button title={t.home} kind="inverse" onPress={() => router.replace('/')} />}
      >
        <View style={{ flex: 1, justifyContent: 'center', gap: S.md, minHeight: 360 }}>
          <Text style={[T.h1Serif, { color: C.redInk }]}>{t.pendingTitle}</Text>
          <Body inverse>{t.pendingBody}</Body>
        </View>
      </Screen>
    );
  }

  const days = Math.max(0, daysBetween(goal.firstDay, todayKey(state)) + 1);
  const total = totalMinutes(goalDaysOf(state));
  // 이번 포기가 확정되면 몇 번째인지
  const nth = (state.profile?.giveupConfirmedCount ?? 0) + 1;
  const next = suspensionFor(nth);
  const left = Math.max(0, GIVEUP_MAX_CONFIRMED - nth);

  const apply = async () => {
    const ok = await request.run(async () => {
      await state.requestGiveup();
      return true;
    });
    if (ok) router.replace('/');
  };

  const footer = (
    <>
      <Button title={t.keep} kind="inverse" onPress={keep} style={{ minHeight: 64 }} />
      <ErrorLine message={request.message} />
      {confirming ? (
        <TextButton title={t.confirmApply} tone="danger" busy={request.busy} onPress={() => void apply()} />
      ) : (
        <TextButton title={t.apply} tone="danger" onPress={() => setConfirming(true)} />
      )}
    </>
  );

  if (confirming) {
    return (
      <Screen danger header={<Header title={t.header} onLeft={() => setConfirming(false)} />} footer={footer}>
        <View style={{ flex: 1, justifyContent: 'center', gap: S.md, minHeight: 360 }}>
          <Label inverse>{left > 0 ? t.count(nth, left) : t.countLast(nth)}</Label>
          <Text style={[T.h1Serif, { color: C.redInk }]}>{t.confirmTitle}</Text>
          <Body inverse serif>
            {t.confirmBody}
          </Body>
          <Text style={[T.h2, { color: C.redInk }]}>{t.suspension(next.banned ? null : next.days)}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen danger header={<Header title={t.header} onLeft={keep} />} footer={footer}>
      <Label inverse>{left > 0 ? t.count(nth, left) : t.countLast(nth)}</Label>
      <Text style={[T.h1Serif, { color: C.redInk }]}>{t.title}</Text>
      <View style={{ flexDirection: 'row', gap: S.lg }}>
        <View style={{ flex: 1 }}>
          <Label inverse>{t.elapsed}</Label>
          <Big inverse>{copy.unit.days(days)}</Big>
        </View>
        <View style={{ flex: 1 }}>
          <Label inverse>{t.total}</Label>
          <Big inverse>{copy.unit.minutes(total)}</Big>
        </View>
      </View>
      <View style={{ gap: S.xs }}>
        <Label inverse>{t.reason}</Label>
        <Body inverse serif>
          {goal.reason}
        </Body>
      </View>
      <Text style={[T.h2, { color: C.redInk }]}>{t.scratch(goal.targetMinutes)}</Text>
      <Body inverse serif>
        {t.scratchPast}
      </Body>
      <Body inverse>{t.waitInfo}</Body>
      <Text style={[T.h2, { color: C.redInk }]}>{t.suspension(next.banned ? null : next.days)}</Text>
    </Screen>
  );
}
