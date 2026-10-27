import { router, useNavigation } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Appear } from '@/components/Appear';
import { Banner } from '@/components/Banner';
import { Coachmark, type CoachStep } from '@/components/Coachmark';
import { ErrorLine } from '@/components/ErrorLine';
import { StatusBanner } from '@/components/StatusBanner';
import { archiveTabTarget, homeRed } from '@/components/TabIcon';
import { TextButton } from '@/components/TextButton';
import { Big, Body, Button, Gauge, Label, Screen, useNow } from '@/components/ui';
import { WeekStrip } from '@/components/WeekStrip';
import { copy } from '@/lib/copy';
import { phaseName, phasePlan } from '@/lib/learn';
import type { AppGoal } from '@/lib/model';
import { getExactAlarm, openExactAlarmSettings } from '@/lib/notify';
import { reportError } from '@/lib/report';
import {
  achieveDay,
  addDays,
  APP_TIME_ZONE,
  canAchieve,
  cycleOf,
  daysBetween,
  daysToNextCoupon,
  fmtClock,
  giveupEndsAt,
  homeState,
  RETRO_SECONDS,
  settingsFor,
  streakOf,
  totalMinutes,
  type HomeState,
} from '@/lib/rules';
import { LEARN_PATH, RETRO_PATH } from '@/lib/route';
import { turnOnNotifications, useRuntime } from '@/lib/runtime';
import { homeBanners, homeNoteOf, longWaitOf, nextStudyDay, retroFirstLine, shortWaitOf, showsKstLabel, type HomeBanner } from '@/lib/selectors';
import { goalDaysOf, messagesOf, nowMs, todayKeyOf, todayRowOf, useApp } from '@/lib/store';
import { warning } from '@/lib/haptics';
import { DUR, EASE } from '@/lib/motion';
import { markSeen, useTipSeen } from '@/lib/tips';
import { useAction } from '@/lib/useAction';
import { C, PALETTES, S, T } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

const h = copy.home;

function nextMilestone(total: number) {
  const steps = [100, 300, 1000, 3000, 5000, 10000];
  const next = steps.find((s) => s > total) ?? Math.ceil((total + 1) / 10000) * 10000;
  const prev = [0, ...steps].filter((s) => s <= total).pop() ?? 0;
  return { next, ratio: (total - prev) / (next - prev) };
}

/** 남은 시간. 24시간이 넘으면 "1일 9시간", 1시간이 넘으면 "3시간 24분", 그보다 짧으면 "24분 13초"(시각과 헷갈리지 않게, U9 D10) */
function countdown(ms: number): string {
  const long = longWaitOf(ms);
  if (long) return h.longWait(long.days, long.hours);
  const w = shortWaitOf(ms);
  return 'hours' in w ? h.hoursWait(w.hours, w.minutes, w.seconds) : h.minutesWait(w.minutes, w.seconds);
}

/** 그날 시작 시각을 "내일 22:00" 또는 "10월 20일 22:00"으로 */
function whenOf(goal: AppGoal, day: string, today: string): string {
  const clock = fmtClock(settingsFor(goal, day).startMinutes);
  if (day === addDays(today, 1)) return h.tomorrowAt(clock);
  return h.dateAt(Number(day.slice(5, 7)), Number(day.slice(8, 10)), clock);
}

function Banners({ list }: { list: HomeBanner[] }) {
  const setExactAlarm = useRuntime((s) => s.setExactAlarm);
  // 아직 묻지 않았으면 누르면 권한 창이 뜬다. 온보딩 "알림 켜기"와 같은 행동이라 같은 이름이다(MVP 7.5-8)
  const ask = useRuntime((s) => s.permission === 'undetermined');
  return (
    <>
      {list.map((b) =>
        b === 'offline' || b === 'load_failed' ? (
          <StatusBanner key={b} />
        ) : b === 'notif_off' ? (
          <Banner
            key={b}
            message={h.notifOff}
            actionTitle={ask ? copy.onboarding.warnAgree : h.openSettings}
            onAction={() => void turnOnNotifications().catch((e: unknown) => reportError(e, 'notify'))}
          />
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

const BLEND_MS = 400;

/**
 * 빨강 진입(갭분석 M12). 앱을 보는 중에 아이보리에서 빨강으로 바뀌면 아이보리 덮개가 400ms에 걷히며 섞이고, 탭 바도 같이 빨강이 된다.
 * 독촉은 그날 처음 들어올 때 흰 깜빡임 1회(화면구성 4절). 보는 중에 독촉이 되면 warning 햅틱.
 * 줄인 움직임이면 섞임과 깜빡임 없이 바로 빨강이다.
 * 홈을 보고 있지 않으면(다른 탭, 학습 화면 아래) 섞임과 햅틱 없이 바로 빨강이고, 깜빡임은 홈을 다시 볼 때 한다.
 */
function useRedEntry(red: boolean, nag: boolean, key: string, focused: boolean) {
  const reduced = useReducedMotion();
  const flash = useSharedValue(0);
  // 아이보리 덮개는 빨강이 처음 그려지는 프레임부터 있어야 한다. 그래서 바뀐 순간을 렌더 중에 알아내고 새 덮개를 붙인다
  const [shownRed, setShownRed] = useState<boolean | null>(null);
  const [blend, setBlend] = useState(0);
  if (shownRed !== red) {
    setShownRed(red);
    if (shownRed === false && red && !reduced && focused) setBlend(blend + 1);
  }
  const wasRed = useRef<boolean | null>(null);
  const flashed = useRef<string | null>(null);
  useEffect(() => {
    const was = wasRed.current;
    wasRed.current = red;
    if (!red) {
      cancelAnimation(homeRed);
      homeRed.value = 0;
      return;
    }
    // 처음 그릴 때부터 빨강이면 섞을 아이보리가 없었다. 보지 않는 동안 바뀌었으면 보여 줄 섞임이 없다
    const live = was === false && focused;
    if (live && !reduced) {
      homeRed.value = 0;
      homeRed.value = withTiming(1, { duration: BLEND_MS, easing: EASE });
    } else {
      homeRed.value = 1;
    }
    if (nag && live) warning();
    if (nag && focused && flashed.current !== key) {
      flashed.current = key;
      if (!reduced) {
        flash.value = withDelay(
          live ? BLEND_MS : 0,
          withSequence(withTiming(0.85, { duration: DUR.fast }), withTiming(0, { duration: 480, easing: EASE })),
        );
      }
    }
  }, [red, nag, key, reduced, flash, focused]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  return { blend, flashStyle };
}

/** 아이보리 덮개. 0.75에서 시작해 400ms에 걷힌다. 1에서 시작하면 첫 프레임이 내용 없는 아이보리 한 장이라 깜빡임으로 보였다(U9 M3) */
function Veil() {
  const o = useSharedValue(0.75);
  useEffect(() => {
    o.value = withTiming(0, { duration: BLEND_MS, easing: EASE });
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: PALETTES.ivory.bg }, anim]} />;
}

/** 빨강이면 탭 바 글자와 아이콘을 흰색으로(갭분석 N12). 흰색과 빨강 대비 5.6:1. 선택된 탭(홈)은 바탕이 빨강인 것으로 구분한다 */
function useTabBarRed(red: boolean) {
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      tabBarActiveTintColor: red ? C.onRed : C.ink,
      tabBarInactiveTintColor: red ? C.onRed : C.sub,
      tabBarStyle: { backgroundColor: C.bg, borderTopColor: red ? C.red : C.line, height: 60 },
    });
  }, [red, navigation]);
}

/** 앞 블록. 새 블록 위에서 바탕색과 함께 페이드아웃한다 */
function FadeOut({ bg, onDone, children }: { bg: string; onDone: () => void; children: ReactNode }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withTiming(0, { duration: reduced ? DUR.reduced : DUR.base, easing: EASE }, (fin) => {
      if (fin) scheduleOnRN(onDone);
    });
  }, [o, reduced, onDone]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: bg, gap: S.sm }, anim]}>
      {children}
    </Animated.View>
  );
}

/**
 * 가운데 상태 블록(갭분석 M15). 상태(k)가 바뀌면 새 블록은 바로 보이고 앞 블록이 그 위에서 200ms 페이드아웃한다.
 * 새 블록이 0에서 나타나면 그 사이 빈 프레임이 보였다(U9 M3). 앞 블록은 바뀌기 직전 그림을 렌더 중 상태 맞추기로 붙잡아 둔다.
 */
function StateBlock({ k, bg, children }: { k: string; bg: string; children: ReactNode }) {
  const [shown, setShown] = useState({ k, node: children });
  const [old, setOld] = useState<{ k: string; node: ReactNode } | null>(null);
  if (shown.k !== k) {
    setOld(shown);
    setShown({ k, node: children });
  } else if (shown.node !== children) setShown({ k, node: children });
  const clear = useCallback(() => setOld(null), []);
  return (
    <View style={{ gap: S.sm, overflow: 'hidden' }}>
      {children}
      {old ? (
        <FadeOut key={old.k} bg={bg} onDone={clear}>
          {old.node}
        </FadeOut>
      ) : null}
    </View>
  );
}

const TOUR = 'home-tour';

const COUPON_USABLE = new Set<HomeState>(['waiting', 'soon', 'grace', 'nag', 'resume']);

export default function Home() {
  const now = useNow();
  const state = useApp();
  const permission = useRuntime((s) => s.permission);
  const exactAlarm = useRuntime((s) => s.exactAlarm);
  const withdraw = useAction();
  const goal = state.goal;
  const tz = APP_TIME_ZONE;
  const today = todayKeyOf(now);
  const rec = todayRowOf(state, now);
  // 기기가 한국 시간이 아니면 화면 시각이 한국 시간이라고 알린다(알림도 한국 시각에 울린다)
  const kst = showsKstLabel(new Date().getTimezoneOffset()) ? <Text style={[T.small, { color: C.sub }]}>{copy.unit.kst}</Text> : null;
  const st = homeState(goal, rec, now, tz);
  const red = st === 'nag' || st === 'resume' || st === 'giveup';
  const focused = useIsFocused();
  const { blend, flashStyle } = useRedEntry(red, st === 'nag', today, focused);
  useTabBarRed(red);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await useApp.getState().refresh();
    setRefreshing(false);
  };
  // 첫 홈 안내(갭분석 3.1-3): 첫 학습일 전, 이 탭을 보고 있을 때 한 번
  const tourSeen = useTipSeen(TOUR);
  const countdownRef = useRef<View>(null);
  const couponRef = useRef<View>(null);
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
      <Screen footer={<Button title={h.newGoal} onPress={() => router.push('/goal/new')} />} refreshing={refreshing} onRefresh={() => void onRefresh()}>
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
  const ms = nextMilestone(total);
  const note = st === 'before_first' || st === 'giveup' ? null : homeNoteOf(goal, mine, today);
  // 서버에 닿지 않으면 학습 시작 버튼 자리에 안내를 둔다 (MP 7.3 서버 점검이나 5xx)
  const startBlocked = state.loadFailed;
  // 끊김과 서버 오류(5xx)는 다른 문장이다(U9 Q7)
  const blockedText = state.offline ? h.offlineStart : h.loadFailedStart;

  const start = () => router.push('/session/reason');
  const startButton = (inverse: boolean) =>
    startBlocked ? <Body inverse={inverse}>{blockedText}</Body> : <Button title={h.start} kind={inverse ? 'inverse' : 'primary'} onPress={start} />;

  let middle: React.ReactNode = null;
  let primary: React.ReactNode = null;
  let tourMinutes = 0;
  let firstPlan: React.ReactNode = null;
  switch (st) {
    case 'before_first': {
      const first = nextStudyDay(goal, goal.firstDay) ?? goal.firstDay;
      const fs = settingsFor(goal, first);
      const fc = cycleOf(first, fs.startMinutes, fs.targetMinutes, tz);
      middle = (
        <>
          {/* 코치마크 ①은 시각 줄까지 감싼다. 말풍선이 "내일 22:00부터" 줄을 가리지 않게(U9 D2) */}
          <View ref={countdownRef} collapsable={false} style={{ gap: S.sm }}>
            <Label>{h.beforeFirstLabel}</Label>
            <Big>{countdown(fc.start - now)}</Big>
            <Body serif>{h.beforeFirstBody(whenOf(goal, first, today), fs.targetMinutes)}</Body>
            {kst}
          </View>
        </>
      );
      tourMinutes = fs.targetMinutes;
      // 첫 학습 순서 미리보기. 첫날 A는 수준 확인이다
      firstPlan = (
        <View style={{ gap: S.xs }}>
          <Label>{h.firstPlan}</Label>
          <Body>{h.firstPlanReason}</Body>
          {phasePlan(fs.targetMinutes).map((p) => (
            <View key={p.phase} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
              <Body>{phaseName(p.phase, true)}</Body>
              <Body>{copy.session.planTime(p.seconds)}</Body>
            </View>
          ))}
        </View>
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
          <Body muted>{h.waitOpen}</Body>
          {kst}
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
          <Body inverse>{h.nagDeadline}</Body>
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
        <Body inverse>{blockedText}</Body>
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
    case 'coupon': {
      const next = nextStudyDay(goal, addDays(today, 1));
      middle = (
        <>
          <Label>{h.couponLabel}</Label>
          <Big>{h.couponBig(goal.coupons)}</Big>
          <Body serif>{h.couponBody(daysToNextCoupon(goal))}</Body>
          {next ? <Body muted>{copy.learn.nextStudy(whenOf(goal, next, today))}</Body> : null}
        </>
      );
      break;
    }
    case 'giveup':
      middle = (
        <>
          <Label inverse>{h.giveupLabel}</Label>
          {/* 숫자만 위에서 내려오며 나타난다(갭분석 M14) */}
          <Appear from={-8}>
            <Big inverse>{countdown((giveupEnd ?? now) - now)}</Big>
          </Appear>
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

  const tour: CoachStep[] = [
    { target: countdownRef, text: h.tourStart(tourMinutes) },
    { target: couponRef, text: h.tourCoupon },
    { target: archiveTabTarget, text: h.tourArchive },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Screen danger={red} footer={primary} refreshing={refreshing} onRefresh={() => void onRefresh()}>
        <Banners list={banners} />

        {/* 탭 제목 자리에 목표 이름(갭분석 V2) */}
        <Text accessibilityRole="header" numberOfLines={2} style={[T.h1, { color: ink }]}>
          {goal.name}
        </Text>

        {note ? <Text style={[T.small, { color: ink }]}>{note === 'failed' ? h.failedNote : h.backNote}</Text> : null}

        {/* 상태 블록이 홈에서 가장 크다. 누적은 그 아래 한 줄로 둔다(디자인 고도화 D1) */}
        <View style={{ paddingVertical: S.md, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: ink }}>
          {/* 상태가 바뀌면 가운데 블록이 200ms에 바뀐다(갭분석 M15) */}
          <StateBlock k={st} bg={red ? C.red : C.bg}>
            {middle}
          </StateBlock>
        </View>

        {firstPlan}

        {/* 첫 학습 전에는 누적과 연속이 0이라 보이지 않는다 */}
        {st === 'before_first' ? null : (
          <View style={{ gap: S.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
              <Text style={[T.h2, { color: ink }]}>{h.totalLine(copy.unit.minutes(total))}</Text>
              <Text style={[T.h2, { color: ink }]}>{h.streak(streak)}</Text>
            </View>
            <Gauge ratio={ms.ratio} inverse={red} />
            <Text style={[T.small, { color: sub }]}>{h.milestone(ms.next - total, ms.next)}</Text>
          </View>
        )}

        {st === 'giveup' ? null : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: S.sm }}>
            <View ref={couponRef} collapsable={false} style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
              {/* 쿠폰은 오늘 학습할 날이고 아직 끝나지 않았을 때만 쓸 수 있다. 쿠폰 쓴 날은 가운데에 이미 남은 수가 보인다 */}
              {COUPON_USABLE.has(st) ? (
                <TextButton title={h.couponOpen} onPress={() => router.push('/coupon')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
              ) : null}
              {st === 'coupon' ? null : <Text style={[T.small, { color: sub }]}>{h.couponsLeft(goal.coupons)}</Text>}
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

        {/* 빨강 화면은 할 일 하나만 보인다. 빨강 위에서는 실패 칸 빨강이 안 보인다 */}
        {red ? null : <WeekStrip days={state.days} goal={goal} today={today} />}
        {st === 'before_first' ? <Text style={[T.small, { color: sub }]}>{h.weekHint}</Text> : null}
      </Screen>
      {blend > 0 ? <Veil key={blend} /> : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: PALETTES.ivory.onRed }, flashStyle]} />
      <Coachmark steps={tour} visible={st === 'before_first' && focused && !tourSeen} onDone={() => markSeen(TOUR)} />
    </View>
  );
}
