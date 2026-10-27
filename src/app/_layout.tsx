import { router, Stack, useGlobalSearchParams, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Platform, Text, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorScreen } from '@/components/ErrorScreen';
import { showToast, ToastHost } from '@/components/Toast';
import { copy, errorText } from '@/lib/copy';
import { useFontsReady } from '@/lib/fonts';
import { DUR } from '@/lib/motion';
import { applyPlan, clearAll, getExactAlarm, getPermission, onNotificationTap, setupNotifications } from '@/lib/notify';
import { tapTarget, type TapData } from '@/lib/notifyTarget';
import { buildPlan } from '@/lib/plan';
import { reportError } from '@/lib/report';
import { redirectFor } from '@/lib/route';
import { useRuntime } from '@/lib/runtime';
import { planInputOf, routeInputOf, tapStateOf } from '@/lib/selectors';
import { nowMs, todayKey, useApp } from '@/lib/store';
import { configMissing } from '@/lib/supabase';
import { C, FRAME_MAX, S, T } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

// 인증 확인과 첫 읽기가 끝날 때까지 네이티브 스플래시를 둔다(MP P2-2). 모듈 범위에서 부른다.
if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch((e: unknown) => reportError(e, 'splash'));
}

/** 첫 읽기를 기다리는 최대 시간. 넘으면 캐시나 오류 화면을 보인다(MP 7.4-2) */
const BOOT_TIMEOUT_MS = 10_000;

// 웹은 스크롤바를 어디서도 보이지 않는다(2026-10-27 오너 결정). 휠과 터치 스크롤은 그대로 된다
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = '* { scrollbar-width: none; } *::-webkit-scrollbar { display: none; }';
  document.head.appendChild(style);
}

/**
 * 개발 빌드 전용: ?crash=1이면 렌더 오류를 낸다. ErrorBoundary("다시 열기") 확인용(MP 7.3).
 * 다시 열기를 누르면 그 뒤로는 내지 않아 정상 화면으로 돌아오는지 볼 수 있다.
 */
let devRecovered = false;
function recoverDevCrash() {
  devRecovered = true;
}
function DevCrash() {
  // 웹 주소를 바로 읽는다. 라우터 값은 렌더를 다시 시도할 때 비어 있을 수 있다
  const crash = Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('crash') === '1';
  if (__DEV__ && crash && !devRecovered) {
    throw new Error('dev render crash');
  }
  return null;
}

/** 렌더 오류가 나면 흰 화면 대신 이 화면을 보인다. 오류는 Sentry(있으면)나 콘솔로 보낸다 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, 'render');
    if (Platform.OS !== 'web') SplashScreen.hide();
  }, [error]);
  return (
    <ErrorScreen
      title={copy.status.crashTitle}
      body={copy.status.crashBody}
      action={copy.status.reopen}
      onAction={() => {
        if (__DEV__) recoverDevCrash();
        void retry();
      }}
    />
  );
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
  const job = s.authed ? applyPlan(buildPlan(planInputOf(s, nowMs()))) : clearAll();
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
    // Android 정확한 알람 권한. 설정에서 켜고 돌아오면 다시 확인한다(P8-3)
    const checkExactAlarm = () => useRuntime.getState().setExactAlarm(getExactAlarm());
    checkExactAlarm();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubStore = useApp.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(replan, 500);
    });
    const unsubRuntime = useRuntime.subscribe((s, prev) => {
      if (prev.inSession && !s.inSession) replan();
      // 정확한 알람 권한을 새로 받으면 부정확하게 걸린 알림을 다시 건다
      else if (prev.exactAlarm !== 'granted' && s.exactAlarm === 'granted') replan();
    });
    const appSub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      const s = useApp.getState();
      s.syncTime().catch((e: unknown) => reportError(e, 'time'));
      void s.refresh();
      void checkPermission();
      checkExactAlarm();
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
    active ? redirectFor(pathname, routeInputOf(s, s, now), typeof next === 'string' ? next : null) : null,
  );
  useEffect(() => {
    if (target) router.replace(target as never);
  }, [target]);
  return target;
}

/**
 * 알림을 눌렀을 때 경로. 준비가 끝난 뒤에 연다(앱이 꺼진 상태에서 눌렀을 때 포함).
 * 그 알림이 가리키는 상태가 이미 끝났으면(예: 완료한 날의 독촉) 홈으로 보내고 한 줄 안내를 띄운다(P8-5).
 */
function openTap(tap: TapData) {
  const target = tapTarget(tap, tapStateOf(useApp.getState(), nowMs()));
  if (target.stale) useRuntime.getState().setNotice(copy.notify.stale);
  router.navigate(target.path as never);
}

function useNotificationTaps(ready: boolean) {
  const pending = useRef<TapData | null>(null);
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  useEffect(
    () =>
      onNotificationTap((tap) => {
        if (readyRef.current) openTap(tap);
        else pending.current = tap;
      }),
    [],
  );
  useEffect(() => {
    if (ready && pending.current) {
      openTap(pending.current);
      pending.current = null;
    }
  }, [ready]);
}

/** useRuntime.setNotice로 남긴 한 줄 안내를 토스트로 띄운다(갭분석 F4). 띄운 뒤 비운다 */
function NoticeToToast() {
  const notice = useRuntime((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    showToast(notice);
    useRuntime.getState().setNotice(null);
  }, [notice]);
  return null;
}

/**
 * 화면 전환 방향(갭분석 N13, M1). 학습 흐름(session/*)은 아래에서 올라오고, 완료에서 홈으로 갈 때는 아래로 내려가며 닫힌다.
 * 학습 흐름은 router.replace로 이어지므로 새 화면이 push 움직임을 하게 한다(기본은 pop).
 * 완료 → 홈 replace는 기본 pop이라 나가는 완료 화면의 움직임(아래로)을 쓴다. 그 밖은 플랫폼 기본(오른쪽 push).
 * 가입 화면에서 연 약관(?modal=1)도 아래에서 올라온다. 쿠폰은 투명 화면이고 시트는 화면 안 BottomSheet가 그린다.
 * animation, presentation은 iOS, Android에서만 동작한다. 줄인 움직임이면 모두 페이드.
 */
function screenOptions(reduced: boolean) {
  const rise: 'fade' | 'slide_from_bottom' = reduced ? 'fade' : 'slide_from_bottom';
  return ({ route }: { route: { name: string; params?: object } }) => {
    const base = { headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: reduced ? 'fade' : 'default' } as const;
    if (route.name.startsWith('session/')) return { ...base, animation: rise, animationTypeForReplace: 'push' } as const;
    if (route.name === 'coupon') {
      return { ...base, presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } } as const;
    }
    if (route.name === 'settings/legal/[doc]' && (route.params as { modal?: string } | undefined)?.modal === '1') return { ...base, animation: rise } as const;
    return base;
  };
}

/** 웹은 Stack 전환 움직임이 없어 새 화면을 짧게 페이드한다(메가프롬프트 4.3). 줄인 움직임이면 Reanimated가 건너뛴다 */
const webFade =
  Platform.OS === 'web'
    ? ({ children }: { children: ReactNode }) => (
        <Animated.View entering={FadeIn.duration(DUR.fast)} style={{ flex: 1 }}>
          {children}
        </Animated.View>
      )
    : undefined;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      {/* 학습 화면의 입력창과 주 버튼을 키보드 위로 올린다(react-native-keyboard-controller). 웹에서는 아무것도 하지 않는다 */}
      <KeyboardProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#E4DED2' : C.bg, alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? FRAME_MAX : undefined, backgroundColor: C.bg, overflow: 'hidden' }}>
            {children}
          </View>
        </View>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const fontsReady = useFontsReady();
  const timedOut = useBootstrap(hydrated);
  const booted = useApp((s) => s.booted);
  const authed = useApp((s) => s.authed);
  const hasProfile = useApp((s) => s.profile !== null);
  const error = useApp((s) => s.error);
  const [retrying, setRetrying] = useState(false);
  const loadFailed = useApp((s) => s.loadFailed);

  const ready = hydrated && fontsReady && (booted || timedOut);
  const signingIn = useApp((s) => s.signingIn);
  // 로그인은 됐는데 서버 데이터가 한 번도 없으면 보일 캐시가 없다.
  // 로그인 처리 중에는 프로필을 받기 전이라 판정하지 않는다. 로그인 화면에 10초 넘게 있으면 timedOut이 이미 참이라 오류 화면이 잠깐 비쳤다
  const bootFailed = ready && authed && !hasProfile && !signingIn && (timedOut || loadFailed);
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
  if (!ready) {
    // 네이티브는 스플래시가 덮는다. 웹은 빈 틀 대신 진행 표시를 보인다(MP 7.4-2)
    return (
      <Frame>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.sm }}>
          <ActivityIndicator color={C.ink} />
          <Text style={[T.small, { color: C.sub }]}>{copy.status.loading}</Text>
        </View>
      </Frame>
    );
  }
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
          action={copy.status.reload}
          busy={retrying}
          onAction={() => void retry()}
        />
      </Frame>
    );
  }
  return (
    <Frame>
      <Stack screenOptions={screenOptions(reduced)} screenLayout={webFade} />
      <NoticeToToast />
      <ToastHost />
      {__DEV__ ? <DevCrash /> : null}
    </Frame>
  );
}
