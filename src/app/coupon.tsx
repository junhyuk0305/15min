import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { Body, Button, H1, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { daysToNextCoupon } from '@/lib/rules';
import { todayRow, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { S, T } from '@/lib/theme';

const t = copy.coupon;

export default function Coupon() {
  const state = useApp();
  const goal = state.goal;
  const [used, setUsed] = useState(false);
  const spend = useAction();
  if (!goal) return null;
  const rec = todayRow(state);
  const closed = rec?.status === 'done' || rec?.status === 'coupon' || goal.giveupRequestedAt !== null;

  if (used) {
    return (
      <Screen footer={<Button title={copy.session.ok} onPress={() => router.replace('/')} />}>
        <View style={{ flex: 1, justifyContent: 'center', gap: S.md, minHeight: 420 }}>
          <H1>{t.used}</H1>
          <Text style={T.h2}>{t.usedShake(goal.coupons)}</Text>
        </View>
      </Screen>
    );
  }

  const use = async () => {
    const ok = await spend.run(async () => {
      await state.spendCoupon();
      return true;
    });
    if (ok) setUsed(true);
  };

  return (
    <Screen
      footer={
        <>
          <ErrorLine message={spend.message} />
          {!closed && goal.coupons > 0 ? <Button title={t.use} kind="danger" busy={spend.busy} onPress={() => void use()} /> : null}
          <Button title={t.back} kind="secondary" onPress={() => router.back()} />
        </>
      }
    >
      <H1>{t.title}</H1>
      <Text style={T.hero}>{t.left(goal.coupons)}</Text>
      <Body>{t.next(daysToNextCoupon(goal))}</Body>
      {goal.coupons > 0 ? <Body muted>{t.warn}</Body> : <Body>{t.none}</Body>}
    </Screen>
  );
}
