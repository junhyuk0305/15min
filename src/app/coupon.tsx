import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Banner } from '@/components/Banner';
import { BottomSheet } from '@/components/BottomSheet';
import { ErrorLine } from '@/components/ErrorLine';
import { TextButton } from '@/components/TextButton';
import { Body, Button, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import { DUR } from '@/lib/motion';
import { daysToNextCoupon, isStudyDay, settingsFor, streakOf } from '@/lib/rules';
import { goalDaysOf, todayKey, todayRow, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { C, S, T } from '@/lib/theme';

const t = copy.coupon;

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * C 쿠폰 시트. 홈 위에 아래에서 올라온다. 독촉 중에도 열린다 (화면구성 5절, 갭분석 N9).
 * 라우트는 투명 화면(_layout.tsx)이고 그 안에서 BottomSheet를 그린다. 웹에서도 같은 코드로 아래에서 올라온다.
 * 닫을 때는 시트가 내려간 뒤 라우트를 닫는다.
 */
export default function Coupon() {
  const state = useApp();
  const goal = state.goal;
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(true);
  const [used, setUsed] = useState(false);
  const spend = useAction();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // BottomSheet의 닫힘 움직임(줄인 움직임이면 페이드) 시간과 같다
  const leave = (then: () => void) => {
    if (timer.current) return;
    setOpen(false);
    timer.current = setTimeout(then, reduced ? DUR.reduced : DUR.base);
  };
  const close = () => leave(back);

  let content: React.ReactNode = null;
  if (goal && used) {
    content = (
      <>
        <Text style={T.h1}>{t.used}</Text>
        <Body serif>{t.usedShake(goal.coupons)}</Body>
        <Button title={t.home} onPress={() => leave(() => router.replace('/'))} style={{ marginTop: S.sm }} />
      </>
    );
  } else if (goal) {
    const today = todayKey(state);
    const rec = todayRow(state);
    const days = goalDaysOf(state);
    const weekdays = settingsFor(goal, today).weekdays;
    const closed =
      goal.giveupRequestedAt !== null
        ? t.closedGiveup
        : today < goal.firstDay
          ? t.closedBefore
          : rec?.status === 'done'
            ? t.closedDone
            : rec?.status === 'coupon'
              ? t.closedCoupon
              : !isStudyDay(today, weekdays)
                ? t.closedRest
                : goal.coupons <= 0
                  ? t.none
                  : null;
    const use = async () => {
      const ok = await spend.run(async () => {
        await state.spendCoupon();
        return true;
      });
      if (ok) setUsed(true);
    };
    content = (
      <>
        <Label>{t.title}</Label>
        <Text style={T.big}>{t.left(goal.coupons)}</Text>
        <Text style={[T.small, { color: C.sub }]}>
          {`${t.next(daysToNextCoupon(goal))} ${t.streakNow(streakOf(days, goal.firstDay, today, weekdays))}`}
        </Text>
        {closed ? null : <Banner message={t.warn} />}
        <View style={{ gap: S.sm, marginTop: S.sm }}>
          <ErrorLine message={spend.message} />
          <Button title={t.use} busy={spend.busy} disabled={!!closed} disabledReason={closed} onPress={() => void use()} />
          <TextButton title={t.close} tone="sub" onPress={close} disabled={spend.busy} />
        </View>
      </>
    );
  } else {
    // 목표가 없으면 route.ts가 홈으로 보낸다. 그 사이에도 나가는 길을 둔다
    content = <TextButton title={t.close} tone="sub" onPress={close} />;
  }

  // 쓰는 중에는 바탕 누르기, 끌기, 뒤로로 닫지 않는다
  return (
    <BottomSheet visible={open} onClose={close} dismissible={!spend.busy}>
      {content}
    </BottomSheet>
  );
}
