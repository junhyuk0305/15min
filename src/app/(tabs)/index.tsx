import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Banner } from '@/components/Banner';
import { ErrorLine } from '@/components/ErrorLine';
import { StatusBanner } from '@/components/StatusBanner';
import { TextButton } from '@/components/TextButton';
import { Big, Body, Button, Gauge, Label, Screen, useNow } from '@/components/ui';
import { copy } from '@/lib/copy';
import type { AppGoal } from '@/lib/model';
import { getExactAlarm, openExactAlarmSettings, openSystemSettings } from '@/lib/notify';
import {
  achieveDay,
  addDays,
  canAchieve,
  cycleOf,
  daysBetween,
  daysToNextCoupon,
  fmtClock,
  fmtDuration,
  giveupEndsAt,
  homeState,
  RETRO_SECONDS,
  settingsFor,
  streakOf,
  totalMinutes,
} from '@/lib/rules';
import { LEARN_PATH, RETRO_PATH } from '@/lib/route';
import { useRuntime } from '@/lib/runtime';
import { homeBanners, homeNoteOf, longWaitOf, nextStudyDay, retroFirstLine, type HomeBanner } from '@/lib/selectors';
import { deviceTz, goalDaysOf, messagesOf, nowMs, todayKeyOf, todayRowOf, tzOf, useApp } from '@/lib/store';
import { useAction } from '@/lib/useAction';
import { C, PALETTES, S, T } from '@/lib/theme';

const h = copy.home;

function nextMilestone(total: number) {
  const steps = [100, 300, 1000, 3000, 5000, 10000];
  const next = steps.find((s) => s > total) ?? Math.ceil((total + 1) / 10000) * 10000;
  const prev = [0, ...steps].filter((s) => s <= total).pop() ?? 0;
  return { next, ratio: (total - prev) / (next - prev) };
}

/** 남은 시간. 24시간이 넘으면 "1일 9시간", 아니면 시:분:초 */
function countdown(ms: number): string {
  const long = longWaitOf(ms);
  return long ? h.longWait(long.days, long.hours) : fmtDuration(ms);
}

/** 그날 시작 시각을 "내일 22:00" 또는 "10월 20일 22:00"으로 */
function whenOf(goal: AppGoal, day: string, today: string): string {
  const clock = fmtClock(settingsFor(goal, day).startMinutes);
  if (day === addDays(today, 1)) return h.tomorrowAt(clock);
  return h.dateAt(Number(day.slice(5, 7)), Number(day.slice(8, 10)), clock);
}

function Banners({ list }: { list: HomeBanner[] }) {
  const setExactAlarm = useRuntime((s) => s.setExactAlarm);
  return (
    <>
      {list.map((b) =>
        b === 'offline' || b === 'load_failed' ? (
          <StatusBanner key={b} />
        ) : b === 'notif_off' ? (
          <Banner key={b} message={h.notifOff} actionTitle={h.openSettings} onAction={openSystemSettings} />
        ) : (
          <Banner
            key={b}
            message={h.exactAlarm}
            actionTitle={h.openSettings}
            onAction={() => void openExactAlarmSettings().then(() => setExactAlarm(getExactAlarm()))}
          />
        ),
      )}
    </>
  );
}

/** 독촉 상태에 처음 들어올 때 한 번 깜빡인다 (화면구성 4절) */
function useFlash(on: boolean, key: string) {
  const [opacity] = useState(() => new Animated.Value(0));
  const flashed = useRef<string | null>(null);
  useEffect(() => {
    if (!on || flashed.current === key) return;
    flashed.current = key;
    const native = Platform.OS !== 'web';
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.85, duration: 120, useNativeDriver: native }),
      Animated.timing(opacity, { toValue: 0, duration: 480, useNativeDriver: native }),
    ]).start();
  }, [on, key, opacity]);
  return opacity;
}

export default function Home() {
  const now = useNow();
  const state = useApp();
  const permission = useRuntime((s) => s.permission);
  const exactAlarm = useRuntime((s) => s.exactAlarm);
  const withdraw = useAction();
  const goal = state.goal;
  const tz = tzOf(state);
  const today = todayKeyOf(state, now, deviceTz);
  const rec = todayRowOf(state, now, deviceTz);
  const st = homeState(goal, rec, now, tz);
  const flash = useFlash(st === 'nag', today);
  const giveupEnd = goal ? giveupEndsAt(goal) : null;
  useEffect(() => {
    if (giveupEnd === null) return;
    // 포기 마감 순간에 다시 읽는다. 서버가 확정하면 route.ts가 이용 정지 화면으로 보낸다
    const id = setTimeout(() => void useApp.getState().refresh(), Math.max(0, giveupEnd - nowMs()) + 1000);
    return () => clearTimeout(id);
  }, [giveupEnd]);
  const banners = homeBanners({ permission, exactAlarm, loadFailed: state.loadFailed, offline: state.offline });

  if (!goal) {
    // 목표 없음: 목표 정하기 하나 (route.ts가 정지, 영구 정지는 먼저 다른 화면으로 보낸다)
    return (
      <Screen footer={<Button title={h.newGoal} onPress={() => router.push('/goal/new')} />}>
        <Banners list={banners} />
        <View style={{ flex: 1, justifyContent: 'center', gap: S.md, minHeight: 360 }}>
          <Text accessibilityRole="header" style={T.h1}>
            {h.noGoalTitle}
          </Text>
          <Body muted>{h.noGoalBody}</Body>
        </View>
      </Screen>
    );
  }

  const mine = goalDaysOf(state);
  const total = totalMinutes(mine);
  const s = settingsFor(goal, today);
  const streak = streakOf(mine, goal.firstDay, today, s.weekdays);
  const c = cycleOf(today, s.startMinutes, s.targetMinutes, tz);
  const red = st === 'nag' || st === 'resume' || st === 'giveup';
  const ms = nextMilestone(total);
  const note = st === 'before_first' || st === 'giveup' ? null : homeNoteOf(goal, mine, today);
  // 서버에 닿지 않으면 학습 시작 버튼 자리에 안내를 둔다 (MP 7.3 서버 점검이나 5xx)
  const startBlocked = state.loadFailed;

  const start = () => router.push('/session/reason');
  const startButton = (inverse: boolean) =>
    startBlocked ? <Body inverse={inverse}>{h.offlineStart}</Body> : <Button title={h.start} kind={inverse ? 'inverse' : 'primary'} onPress={start} />;

  let middle: React.ReactNode = null;
  let primary: React.ReactNode = null;
  switch (st) {
    case 'before_first': {
      const first = nextStudyDay(goal, goal.firstDay) ?? goal.firstDay;
      const fs = settingsFor(goal, first);
      const fc = cycleOf(first, fs.startMinutes, fs.targetMinutes, tz);
      middle = (
        <>
          <Label>{h.beforeFirstLabel}</Label>
          <Big>{countdown(fc.start - now)}</Big>
          <Body serif>{h.beforeFirstBody(whenOf(goal, first, today), fs.targetMinutes)}</Body>
        </>
      );
      break;
    }
    case 'rest': {
      const next = nextStudyDay(goal, addDays(today, 1));
      middle = (
        <>
          <Label>{h.restLabel}</Label>
          {next ? <Body serif>{h.restBody(whenOf(goal, next, today))}</Body> : null}
        </>
      );
      break;
    }
    case 'waiting':
      middle = (
        <>
          <Label>{h.waitLabel}</Label>
          <Big>{countdown(c.start - now)}</Big>
          <Body serif>{h.waitBody(fmtClock(s.startMinutes), s.targetMinutes)}</Body>
        </>
      );
      break;
    case 'soon':
      middle = (
        <>
          <Label>{h.waitLabel}</Label>
          <Big>{countdown(c.start - now)}</Big>
          <Body serif>{h.soonBody(s.targetMinutes)}</Body>
        </>
      );
      primary = startButton(false);
      break;
    case 'grace':
      middle = (
        <>
          <Label>{h.graceLabel}</Label>
          <Big>{h.graceBig(Math.floor((now - c.start) / 60_000))}</Big>
          <Body serif>{h.graceBody(fmtClock((s.startMinutes + s.targetMinutes) % 1440))}</Body>
        </>
      );
      primary = startButton(false);
      break;
    case 'nag':
      middle = (
        <>
          <Label inverse>{h.nagLabel}</Label>
          <Big inverse>{h.nagBig(Math.floor((now - c.start) / 60_000))}</Big>
          <Text style={[T.h2, { color: C.redInk }]}>{h.nagScratch(s.targetMinutes)}</Text>
          <View style={{ gap: S.xs, marginTop: S.sm }}>
            <Label inverse>{h.reason}</Label>
            <Body inverse serif>
              {goal.reason}
            </Body>
          </View>
        </>
      );
      primary = startButton(true);
      break;
    case 'resume': {
      const r = rec!;
      const inRetro = r.phase === 'retro' || r.activeSeconds >= r.targetMinutes * 60;
      const left = inRetro ? Math.ceil((RETRO_SECONDS - r.retroSeconds) / 60) : Math.ceil((r.targetMinutes * 60 - r.activeSeconds) / 60);
      middle = (
        <>
          <Label inverse>{h.resumeLabel}</Label>
          <Big inverse>{h.resumeBig(Math.max(1, left))}</Big>
          <Body inverse serif>
            {inRetro ? h.resumeRetro : h.resumeBody}
          </Body>
        </>
      );
      primary = startBlocked ? (
        <Body inverse>{h.offlineStart}</Body>
      ) : (
        <Button title={h.resume} kind="inverse" onPress={() => router.push(inRetro ? RETRO_PATH : LEARN_PATH)} />
      );
      break;
    }
    case 'done': {
      const line = retroFirstLine(messagesOf(state, goal.id, today));
      const next = nextStudyDay(goal, addDays(today, 1));
      middle = (
        <>
          <Label>{h.doneLabel}</Label>
          <Big>{h.doneBig(Math.floor(rec!.activeSeconds / 60))}</Big>
          <Body serif>{line ? `“${line}”` : h.doneShake}</Body>
          {next ? <Body muted>{copy.learn.nextStudy(whenOf(goal, next, today))}</Body> : null}
        </>
      );
      break;
    }
    case 'coupon':
      middle = (
        <>
          <Label>{h.couponLabel}</Label>
          <Big>{h.couponBig(goal.coupons)}</Big>
          <Body serif>{h.couponBody(daysToNextCoupon(goal))}</Body>
        </>
      );
      break;
    case 'giveup':
      middle = (
        <>
          <Label inverse>{h.giveupLabel}</Label>
          <Big inverse>{countdown((giveupEnd ?? now) - now)}</Big>
          <Body inverse serif>
            {h.giveupBody}
          </Body>
          <View style={{ gap: S.xs, marginTop: S.sm }}>
            <Label inverse>{h.reason}</Label>
            <Body inverse serif>
              {goal.reason}
            </Body>
          </View>
        </>
      );
      primary = (
        <>
          <ErrorLine message={withdraw.error?.code === 'not_active' ? h.giveupDone : withdraw.message} />
          <Button title={h.withdraw} kind="inverse" busy={withdraw.busy} onPress={() => void withdraw.run(state.withdrawGiveup)} />
        </>
      );
      break;
  }

  const ink = red ? C.redInk : C.ink;
  const sub = red ? C.redInk : C.sub;

  return (
    <View style={{ flex: 1 }}>
      <Screen danger={red} footer={primary}>
        <Banners list={banners} />

        <View style={{ gap: S.xs }}>
          <Text style={[T.label, { color: sub }]}>{h.total}</Text>
          <Text style={[T.hero, { color: ink }]}>{copy.unit.minutes(total)}</Text>
          <Gauge ratio={ms.ratio} inverse={red} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
            <Text style={[T.small, { color: sub, flexShrink: 1 }]}>{h.milestone(ms.next - total, ms.next)}</Text>
            <Text style={[T.small, { color: ink }]}>{h.streak(streak)}</Text>
          </View>
        </View>

        {note ? <Text style={[T.small, { color: ink }]}>{note === 'failed' ? h.failedNote : h.backNote}</Text> : null}

        <View style={{ gap: S.sm, paddingVertical: S.md, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: ink }}>
          <Text style={[T.small, { color: sub }]}>{goal.name}</Text>
          {middle}
        </View>

        {st === 'giveup' ? null : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
              <TextButton title={h.couponOpen} onPress={() => router.push('/coupon')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
              <Text style={[T.small, { color: sub }]}>{h.couponsLeft(goal.coupons)}</Text>
            </View>
            {canAchieve(goal, today) ? (
              <TextButton title={h.achieve} onPress={() => router.push('/goal/achieve')} style={{ alignSelf: 'flex-end', paddingHorizontal: 0 }} />
            ) : (
              <Text style={[T.small, { color: sub, flexShrink: 1, textAlign: 'right' }]}>
                {st === 'before_first' ? h.achieveAfter(goal.periodDays) : h.achieveIn(daysBetween(today, achieveDay(goal)))}
              </Text>
            )}
          </View>
        )}
      </Screen>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: PALETTES.ivory.onRed, opacity: flash }]} />
    </View>
  );
}
