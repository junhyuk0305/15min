import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '@/components/Banner';
import { ErrorLine } from '@/components/ErrorLine';
import { TextButton } from '@/components/TextButton';
import { Body, Button, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import { daysToNextCoupon, isStudyDay, settingsFor, streakOf } from '@/lib/rules';
import { goalDaysOf, todayKey, todayRow, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { C, R, S, T } from '@/lib/theme';

const t = copy.coupon;

const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** C 쿠폰 시트. 홈 위에 아래에서 올라온다. 독촉 중에도 열린다 (화면구성 5절) */
export default function Coupon() {
  const insets = useSafeAreaInsets();
  const state = useApp();
  const goal = state.goal;
  const [used, setUsed] = useState(false);
  const spend = useAction();

  let content: React.ReactNode = null;
  let footer: React.ReactNode = null;
  if (goal && used) {
    content = (
      <>
        <Text style={T.h1}>{t.used}</Text>
        <Body serif>{t.usedShake(goal.coupons)}</Body>
      </>
    );
    footer = <Button title={t.home} onPress={() => router.replace('/')} />;
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
      </>
    );
    footer = (
      <>
        <ErrorLine message={spend.message} />
        <Button title={t.use} busy={spend.busy} disabled={!!closed} disabledReason={closed} onPress={() => void use()} />
        <TextButton title={t.close} onPress={close} />
      </>
    );
  } else {
    // 목표가 없으면 route.ts가 홈으로 보낸다. 그 사이에도 나가는 길을 둔다
    footer = <TextButton title={t.close} onPress={close} />;
  }

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <Stack.Screen options={{ presentation: 'transparentModal', animation: 'fade' }} />
      <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={used ? undefined : close} style={{ flex: 1 }} />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: C.bg,
          borderTopLeftRadius: R.sheet,
          borderTopRightRadius: R.sheet,
          paddingHorizontal: S.lg,
          paddingTop: S.lg,
          paddingBottom: insets.bottom + S.md,
          gap: S.sm,
        }}
      >
        {content}
        <View style={{ gap: S.sm, marginTop: S.sm }}>{footer}</View>
      </View>
    </View>
  );
}
