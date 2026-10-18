import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applyPlan, getPermission, onNotificationTap, setupNotifications } from '@/lib/notify';
import { buildPlan } from '@/lib/plan';
import { dayKeyOf } from '@/lib/rules';
import { useRuntime } from '@/lib/runtime';
import { activeGoalOf, deviceTz, keyOf, lastEndedGoal, lastRetroOf, nowMs, recordsOf, useApp } from '@/lib/store';
import { C, FRAME_MAX } from '@/lib/theme';

function useHydrated() {
  const [done, setDone] = useState(useApp.persist.hasHydrated());
  useEffect(() => useApp.persist.onFinishHydration(() => setDone(true)), []);
  return done;
}

/** 상태가 바뀔 때마다 오늘과 내일 알림을 다시 건다. 학습 중에는 걸지 않는다. */
function replan() {
  if (useRuntime.getState().inSession) return;
  const s = useApp.getState();
  const goal = activeGoalOf(s);
  const now = nowMs();
  const plan = buildPlan({
    goal,
    lastGoal: goal ? null : lastEndedGoal(s),
    days: goal ? recordsOf(s, goal.id) : [],
    leftAt: goal ? (s.records[keyOf(goal.id, dayKeyOf(now, deviceTz))]?.leftAt ?? null) : null,
    lastRetro: goal ? lastRetroOf(s, goal.id) : null,
    suspension: null,
    now,
    timeZone: deviceTz,
  });
  void applyPlan(plan);
}

function useBootstrap(hydrated: boolean) {
  useEffect(() => {
    if (!hydrated) return;
    void setupNotifications();
    const refresh = () => {
      useApp.getState().settleAll();
      void getPermission().then(useRuntime.getState().setPermission);
      replan();
    };
    refresh();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubStore = useApp.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(replan, 500);
    });
    const unsubRuntime = useRuntime.subscribe((s, prev) => {
      if (prev.inSession && !s.inSession) replan();
    });
    const appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refresh();
    });
    const tick = setInterval(() => useApp.getState().settleAll(), 60_000);
    const unsubTap = onNotificationTap((url) => router.push(url as never));
    return () => {
      unsubStore();
      unsubRuntime();
      appSub.remove();
      clearInterval(tick);
      unsubTap();
      if (timer) clearTimeout(timer);
    };
  }, [hydrated]);
}

function useGuard(hydrated: boolean) {
  const segments = useSegments();
  const onboarded = useApp((s) => s.onboarded);
  const hasGoal = useApp((s) => activeGoalOf(s) !== null);
  useEffect(() => {
    if (!hydrated) return;
    const first = segments[0] as string | undefined;
    if (!onboarded) {
      if (first !== 'onboarding') router.replace('/onboarding');
      return;
    }
    if (!hasGoal && first !== 'goal') router.replace('/goal/new');
  }, [hydrated, onboarded, hasGoal, segments]);
}

export default function RootLayout() {
  const hydrated = useHydrated();
  useBootstrap(hydrated);
  useGuard(hydrated);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#E4DED2' : C.bg, alignItems: 'center' }}>
        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: Platform.OS === 'web' ? FRAME_MAX : undefined,
            backgroundColor: C.bg,
            overflow: 'hidden',
          }}
        >
          {hydrated ? <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} /> : null}
        </View>
      </View>
    </SafeAreaProvider>
  );
}
