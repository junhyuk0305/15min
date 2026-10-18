import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Big, Body, Button, Gauge, Label, Screen, useNow } from '@/components/ui';
import { copy } from '@/lib/copy';
import { openSystemSettings } from '@/lib/notify';
import {
  achieveDay,
  canAchieve,
  cycleOf,
  dayKeyOf,
  daysBetween,
  daysToNextCoupon,
  fmtClock,
  fmtDuration,
  GIVEUP_WAIT_MS,
  homeState,
  settingsFor,
  streakOf,
  totalMinutes,
} from '@/lib/rules';
import { useRuntime } from '@/lib/runtime';
import { activeGoalOf, allBots, deviceTz, keyOf, recordsOf, useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

const h = copy.home;

function nextMilestone(total: number) {
  const steps = [100, 300, 1000, 3000, 5000, 10000];
  const next = steps.find((s) => s > total) ?? Math.ceil((total + 1) / 10000) * 10000;
  const prev = [0, ...steps].filter((s) => s <= total).pop() ?? 0;
  return { next, ratio: (total - prev) / (next - prev) };
}

export default function Home() {
  const now = useNow();
  const state = useApp();
  const permission = useRuntime((s) => s.permission);
  const goal = activeGoalOf(state);
  if (!goal) return <Screen>{null}</Screen>;

  const today = dayKeyOf(now, deviceTz);
  const rec = state.records[keyOf(goal.id, today)];
  const mine = recordsOf(state, goal.id);
  const total = totalMinutes(mine);
  const s = settingsFor(goal, today);
  const streak = streakOf(mine, goal.firstDay, today, s.weekdays);
  const st = homeState(goal, rec, now, deviceTz);
  const c = cycleOf(today, s.startMinutes, s.targetMinutes, deviceTz);
  const red = st === 'nag' || st === 'resume' || st === 'giveup';
  const ms = nextMilestone(total);
  const bots = allBots(state.customBots);

  const start = () => router.push('/session/reason');

  let middle: React.ReactNode;
  let primary: React.ReactNode = null;
  switch (st) {
    case 'none':
      break;
    case 'before_first':
      middle = (
        <>
          <Label>{h.beforeFirstTitle}</Label>
          <Body>{h.beforeFirstBody(fmtClock(settingsFor(goal, goal.firstDay).startMinutes))}</Body>
        </>
      );
      break;
    case 'rest':
      middle = (
        <>
          <Label>{h.restTitle}</Label>
          <Body>{h.restBody}</Body>
        </>
      );
      break;
    case 'waiting':
    case 'soon':
      middle = (
        <>
          <Label>{h.startIn(s.targetMinutes)}</Label>
          <Big hero>{fmtDuration(c.start - now)}</Big>
          {st === 'soon' ? <Body>{h.soonBody(s.targetMinutes)}</Body> : null}
        </>
      );
      if (st === 'soon') primary = <Button title={h.start} onPress={start} />;
      break;
    case 'grace':
      middle = (
        <>
          <Label>{h.graceTitle}</Label>
          <Big hero>{fmtDuration(c.graceEnd - now)}</Big>
          <Body>{h.graceBody}</Body>
        </>
      );
      primary = <Button title={h.start} onPress={start} />;
      break;
    case 'nag':
      middle = (
        <>
          <Label inverse>{h.nagTitle}</Label>
          <Big hero inverse>{fmtDuration(now - c.start)}</Big>
          <Text style={[T.h2, { color: C.redInk }]}>{h.nagLate(Math.floor((now - c.start) / 60000))}</Text>
          <View style={{ gap: S.xs, marginTop: S.sm }}>
            <Label inverse>{h.yourReason}</Label>
            <Body inverse>{goal.reason}</Body>
          </View>
        </>
      );
      primary = <Button title={h.start} kind="inverse" onPress={start} />;
      break;
    case 'resume': {
      const left = Math.ceil((rec!.targetMinutes * 60 - rec!.activeSeconds) / 60);
      middle = (
        <>
          <Big hero inverse>{h.resumeTitle(left)}</Big>
          <Body inverse>{h.resumeBody}</Body>
        </>
      );
      primary = <Button title={h.resume} kind="inverse" onPress={() => router.push('/session/chat')} />;
      break;
    }
    case 'done':
      middle = (
        <>
          <Label>{h.doneTitle}</Label>
          <Big hero>{copy.unit.minutes(Math.floor(rec!.activeSeconds / 60))}</Big>
          <Body>{h.doneBody}</Body>
        </>
      );
      break;
    case 'coupon':
      middle = (
        <>
          <Label>{h.couponTitle}</Label>
          <Body>{h.couponBody(goal.coupons, daysToNextCoupon(goal))}</Body>
        </>
      );
      break;
    case 'giveup':
      middle = (
        <>
          <Label inverse>{h.giveupTitle}</Label>
          <Big hero inverse>{fmtDuration(goal.giveupRequestedAt! + GIVEUP_WAIT_MS - now)}</Big>
          <Body inverse>{h.giveupBody}</Body>
          <View style={{ gap: S.xs, marginTop: S.sm }}>
            <Label inverse>{h.giveupReason}</Label>
            <Body inverse>{goal.reason}</Body>
          </View>
        </>
      );
      primary = <Button title={h.withdraw} kind="inverse" onPress={() => state.withdrawGiveup()} />;
      break;
  }

  const ink = red ? C.redInk : C.ink;
  const sub = red ? C.redInk : C.sub;

  return (
    <Screen danger={red} footer={primary}>
      {permission === 'denied' ? (
        <Pressable onPress={openSystemSettings} style={{ backgroundColor: C.red, borderRadius: 12, padding: S.md }}>
          <Text style={[T.small, { color: C.redInk }]}>{h.notifOff}</Text>
        </Pressable>
      ) : null}

      <View style={{ gap: S.xs }}>
        <Text style={[T.label, { color: sub }]}>{h.total}</Text>
        <Text style={[T.hero, { color: ink }]}>{copy.unit.minutes(total)}</Text>
        <Gauge ratio={ms.ratio} inverse={red} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[T.small, { color: sub }]}>{h.milestone(ms.next - total, ms.next)}</Text>
          <Text style={[T.small, { color: ink }]}>{h.streak(streak)}</Text>
        </View>
      </View>

      <View style={{ gap: S.sm, paddingVertical: S.lg, borderTopWidth: 2, borderBottomWidth: 2, borderColor: ink }}>
        <Text style={[T.small, { color: sub }]}>{goal.name}</Text>
        {middle}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/coupon')} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text style={[T.h2, { color: ink, textDecorationLine: 'underline' }]}>{h.coupons(goal.coupons)}</Text>
        </Pressable>
        {canAchieve(goal, today) ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/goal/achieve')} style={{ minHeight: 48, justifyContent: 'center' }}>
            <Text style={[T.h2, { color: ink, textDecorationLine: 'underline' }]}>{h.achieve}</Text>
          </Pressable>
        ) : (
          <Text style={[T.small, { color: sub }]}>{h.achieveIn(daysBetween(today, achieveDay(goal)))}</Text>
        )}
      </View>

      {st !== 'giveup' ? (
        <View style={{ gap: S.xs }}>
          <Text style={[T.label, { color: sub }]}>{h.botTitle}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
            {bots.map((b) => {
              const on = b.id === goal.botId;
              return (
                <Pressable
                  key={b.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => state.setTodayBot(b.id)}
                  style={{
                    width: 150,
                    minHeight: 72,
                    padding: S.md,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderColor: ink,
                    backgroundColor: on ? ink : 'transparent',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={[T.small, { color: on ? (red ? C.red : C.card) : ink }]}>{b.name}</Text>
                  <Text style={[T.label, { color: on ? (red ? C.red : C.card) : sub }]}>{copy.bots.minChars(b.minChars)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </Screen>
  );
}
