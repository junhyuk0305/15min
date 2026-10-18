import { router, Stack, useGlobalSearchParams, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorScreen } from '@/components/ErrorScreen';
import { copy, errorText } from '@/lib/copy';
import { useFontsReady } from '@/lib/fonts';
import { applyPlan, clearAll, getPermission, onNotificationTap, setupNotifications } from '@/lib/notify';
import { buildPlan } from '@/lib/plan';
import { reportError } from '@/lib/report';
import { redirectFor } from '@/lib/route';
import { useRuntime } from '@/lib/runtime';
import { planInputOf, routeInputOf } from '@/lib/selectors';
import { deviceTz, nowMs, todayKey, useApp } from '@/lib/store';
import { configMissing } from '@/lib/supabase';
import { C, FRAME_MAX, S, T } from '@/lib/theme';

// 인증 확인과 첫 읽기가 끝날 때까지 네이티브 스플래시를 둔다(MP P2-2). 모듈 범위에서 부른다.
if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch((e: unknown) => reportError(e, 'splash'));
}

/** 첫 읽기를 기다리는 최대 시간. 넘으면 캐시나 오류 화면을 보인다(MP 7.4-2) */
const BOOT_TIMEOUT_MS = 10_000;

/** 렌더 오류가 나면 흰 화면 대신 이 화면을 보인다. 오류는 Sentry(있으면)나 콘솔로 보낸다 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, 'render');
    if (Platform.OS !== 'web') SplashScreen.hide();
  }, [error]);
  return <ErrorScreen title={copy.status.crashTitle} body={copy.status.crashBody} action={copy.status.reopen} onAction={() => void retry()} />;
}

function useHydrated() {
  const [done, setDone] = useState(useApp.persist.hasHydrated());
  useEffect(() => useApp.persist.onFinishHydration(() => setDone(true)), []);
  return done;
}

/** 서버 캐시로 오늘과 내일 알림을 다시 건다. 학습 중에는 걸지 않는다 */
function replan() {
  if (useRuntime.getState().inSession) return;
  const s = useApp.getState();
  const job = s.authed ? applyPlan(buildPlan(planInputOf(s, nowMs(), deviceTz))) : clearAll();
  job.catch((e: unknown) => reportError(e, 'notify'));
}

/** 시작: 세션 확인, 서버 시각, 시간대, settle_me, 읽기. 포그라운드 복귀 때 다시. */
function useBootstrap(hydrated: boolean) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!hydrated || configMissing) return;
    void useApp.getState().boot();
    const limit = setTimeout(() => setTimedOut(true), BOOT_TIMEOUT_MS);
    setupNotifications().catch((e: unknown) => reportError(e, 'notify'));
    const checkPermission = () =>
      getPermission().then(useRuntime.getState().setPermission, (e: unknown) => reportError(e, 'notify'));
    void checkPermission();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubStore = useApp.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(replan, 500);
    });
    const unsubRuntime = useRuntime.subscribe((s, prev) => {
      if (prev.inSession && !s.inSession) replan();
    });
    const appSub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      const s = useApp.getState();
      s.syncTime().catch((e: unknown) => reportError(e, 'time'));
      void s.refresh();
      void checkPermission();
    });
    // 하루가 바뀌면(04:00) 다시 읽는다
    let day = todayKey();
    const tick = setInterval(() => {
      const d = todayKey();
      if (d !== day) {
        day = d;
        void useApp.getState().refresh();
      }
    }, 60_000);
    return () => {
      clearTimeout(limit);
      unsubStore();
      unsubRuntime();
      appSub.remove();
      clearInterval(tick);
      if (timer) clearTimeout(timer);
    };
  }, [hydrated]);
  return timedOut;
}

/** 지금 경로가 route.ts 결정과 다르면 옮긴다. 옮길 곳이 없으면 null */
function useGuard(active: boolean) {
  const pathname = usePathname();
  const { next } = useGlobalSearchParams<{ next?: string }>();
  const [now, setNow] = useState(nowMs());
  useEffect(() => {
    const id = setInterval(() => setNow(nowMs()), 30_000);
    return () => clearInterval(id);
  }, []);
  // 문자열 하나만 고른다. 메시지가 늘 때마다 루트가 다시 그려지지 않는다
  const target = useApp((s) =>
    active ? redirectFor(pathname, routeInputOf(s, s, now, deviceTz), typeof next === 'string' ? next : null) : null,
  );
  useEffect(() => {
    if (target) router.replace(target as never);
  }, [target]);
  return target;
}

/** 알림을 눌렀을 때 경로. 준비가 끝난 뒤에 연다(앱이 꺼진 상태에서 눌렀을 때 포함) */
function useNotificationTaps(ready: boolean) {
  const pending = useRef<string | null>(null);
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  useEffect(
    () =>
      onNotificationTap((url) => {
        if (readyRef.current) router.push(url as never);
        else pending.current = url;
      }),
    [],
  );
  useEffect(() => {
    if (ready && pending.current) {
      router.push(pending.current as never);
      pending.current = null;
    }
  }, [ready]);
}

/** 화면 위 한 줄 안내. 4초 뒤 사라진다 */
function Notice() {
  const insets = useSafeAreaInsets();
  const notice = useRuntime((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => useRuntime.getState().setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  if (!notice) return null;
  return (
    <View
      accessibilityRole="alert"
      pointerEvents="none"
      style={{ position: 'absolute', top: insets.top + S.sm, left: S.lg, right: S.lg, backgroundColor: C.ink, borderRadius: 12, padding: S.md }}
    >
      <Text style={[T.small, { color: C.onInk }]}>{notice}</Text>
    </View>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#E4DED2' : C.bg, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? FRAME_MAX : undefined, backgroundColor: C.bg, overflow: 'hidden' }}>
          {children}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const hydrated = useHydrated();
  const fontsReady = useFontsReady();
  const timedOut = useBootstrap(hydrated);
  const booted = useApp((s) => s.booted);
  const authed = useApp((s) => s.authed);
  const hasProfile = useApp((s) => s.profile !== null);
  const error = useApp((s) => s.error);
  const [retrying, setRetrying] = useState(false);
  const loadFailed = useApp((s) => s.loadFailed);

  const ready = hydrated && fontsReady && (booted || timedOut);
  // 로그인은 됐는데 서버 데이터가 한 번도 없으면 보일 캐시가 없다
  const bootFailed = ready && authed && !hasProfile && (timedOut || loadFailed);
  const signingIn = useApp((s) => s.signingIn);
  const target = useGuard(ready && !configMissing && !bootFailed && !signingIn);
  useNotificationTaps(ready && !target);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (configMissing || (ready && (!target || bootFailed))) SplashScreen.hide();
  }, [ready, target, bootFailed]);

  if (configMissing) {
    return (
      <Frame>
        <ErrorScreen title={copy.status.configTitle} body={copy.status.configBody} />
      </Frame>
    );
  }
  if (!ready) return <Frame>{null}</Frame>;
  if (bootFailed) {
    const retry = async () => {
      setRetrying(true);
      try {
        await useApp.getState().boot();
      } finally {
        setRetrying(false);
      }
    };
    return (
      <Frame>
        <ErrorScreen
          title={copy.status.bootTitle}
          body={error ? errorText(error.kind, error.code) : copy.error.kind.network}
          action={copy.status.retry}
          busy={retrying}
          onAction={() => void retry()}
        />
      </Frame>
    );
  }
  return (
    <Frame>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
      <Notice />
    </Frame>
  );
}
