import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, H1, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { dayKeyOf, daysToNextCoupon } from '@/lib/rules';
import { activeGoalOf, keyOf, nowMs, useApp } from '@/lib/store';
import { S, T } from '@/lib/theme';

const t = copy.coupon;

export default function Coupon() {
  const state = useApp();
  const goal = activeGoalOf(state);
  const [used, setUsed] = useState(false);
  if (!goal) return null;
  const rec = state.records[keyOf(goal.id, dayKeyOf(nowMs()))];
  const closed = rec?.status === 'done' || rec?.status === 'coupon' || goal.giveupSince !== null;

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

  const use = () => {
    if (state.takeCoupon()) setUsed(true);
  };

  return (
    <Screen
      footer={
        <>
          {!closed && goal.coupons > 0 ? <Button title={t.use} kind="danger" onPress={use} /> : null}
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
