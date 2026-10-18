import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { StatusBanner } from '@/components/StatusBanner';
import { Big, Body, Button, Gauge, H1, Label, Screen, useNow } from '@/components/ui';
import { copy } from '@/lib/copy';
import { openSystemSettings } from '@/lib/notify';
import {
  achieveDay,
  canAchieve,
  cycleOf,
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
import { LEARN_PATH } from '@/lib/route';
import { useRuntime } from '@/lib/runtime';
import { deviceTz, goalDaysOf, todayKeyOf, todayRowOf, tzOf, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
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
  const withdraw = useAction();
  const goal = state.goal;
  if (!goal) {
    // 목표 없음: 목표 정하기 하나 (route.ts가 정지, 영구 정지는 먼저 다른 화면으로 보낸다)
    return (
      <Screen footer={<Button title={copy.status.newGoal} onPress={() => router.push('/goal/new')} />}>
        <StatusBanner />
        <H1>{copy.status.noGoalTitle}</H1>
        <Body muted>{copy.status.noGoalBody}</Body>
      </Screen>
    );
  }

  const tz = tzOf(state);
  const today = todayKeyOf(state, now, deviceTz);
  const rec = todayRowOf(state, now, deviceTz);
  const mine = goalDaysOf(state);
  const total = totalMinutes(mine);
  const s = settingsFor(goal, today);
  const streak = streakOf(mine, goal.firstDay, today, s.weekdays);
  const st = homeState(goal, rec, now, tz);
  const c = cycleOf(today, s.startMinutes, s.targetMinutes, tz);
  const red = st === 'nag' || st === 'resume' || st === 'giveup';
  const ms = nextMilestone(total);

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
      primary = <Button title={h.resume} kind="inverse" onPress={() => router.push(LEARN_PATH)} />;
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
      primary = (
        <>
          <ErrorLine message={withdraw.message} />
          <Button title={h.withdraw} kind="inverse" busy={withdraw.busy} onPress={() => void withdraw.run(state.withdrawGiveup)} />
        </>
      );
      break;
  }

  const ink = red ? C.redInk : C.ink;
  const sub = red ? C.redInk : C.sub;

  return (
    <Screen danger={red} footer={primary}>
      <StatusBanner />
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

    </Screen>
  );
}
