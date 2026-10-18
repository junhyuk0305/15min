import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryFooter } from '@/components/PrimaryFooter';
import { SurfaceProvider } from '@/components/surface';
import { Body, Button, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import { requestPermission, setupNotifications } from '@/lib/notify';
import { reportError } from '@/lib/report';
import { MIN_WEEKDAYS } from '@/lib/rules';
import { useRuntime } from '@/lib/runtime';
import { useApp } from '@/lib/store';
import { B, C, R, S, T } from '@/lib/theme';

// 4장: O1 후킹, O2 문제, O3 약속, O4 경고와 알림(명세 5절). 옆으로 넘기거나 아래 버튼으로 넘긴다.
// 목표, 이유, 시각, 분은 여기서 묻지 않는다. 로그인 뒤 목표 설정 채팅에서 정한다.
const o = copy.onboarding;
const PAGES = 4;

// 후킹 숫자는 실제 규칙으로 센다: 주 5일(MIN_WEEKDAYS) x 52주 x 하루 15분. 매일 한다고 부풀리지 않는다.
const HOOK_MINUTES = 15;
const WEEKS_PER_YEAR = 52;
const perYear = HOOK_MINUTES * MIN_WEEKDAYS * WEEKS_PER_YEAR;
const HOOK_ROWS = [1, 3, 5].map((y) => ({ label: o.year(y), value: copy.unit.minutes(perYear * y) }));

function Dots({ step }: { step: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }} accessibilityLabel={o.page(step + 1, PAGES)}>
      {Array.from({ length: PAGES }, (_, i) => (
        <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === step ? C.ink : C.line }} />
      ))}
    </View>
  );
}

function Hook() {
  return (
    <View style={{ gap: S.sm }}>
      <Label>{o.hookLabel(MIN_WEEKDAYS, HOOK_MINUTES)}</Label>
      {HOOK_ROWS.map((r, i) => (
        <View key={r.label} style={{ gap: 2 }}>
          <Text style={[T.hero, i > 0 && { fontSize: 34, lineHeight: 42 }, { color: C.ink }]}>{r.value}</Text>
          <Text style={[T.small, { color: C.sub }]}>{r.label}</Text>
        </View>
      ))}
      <Text style={[T.small, { color: C.sub, marginTop: S.sm }]}>{o.hookNote(Math.round(perYear / 60))}</Text>
    </View>
  );
}

function Statement({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: S.md }}>
      <Text accessibilityRole="header" style={[T.h1Serif, { color: C.ink }]}>
        {title}
      </Text>
      <Body serif muted>
        {sub}
      </Body>
    </View>
  );
}

function Warning() {
  return (
    <View style={{ gap: S.md }}>
      <Label>{o.page(PAGES, PAGES)}</Label>
      <Text accessibilityRole="header" style={[T.h1Serif, { color: C.ink }]}>
        {o.warnTitle}
      </Text>
      <View style={{ backgroundColor: C.card, borderWidth: B.hair, borderColor: C.line, borderRadius: R.lg, paddingVertical: 12, paddingHorizontal: 14, gap: S.sm }}>
        {o.warnRows.map((r) => (
          <Text key={r} style={[T.small, { color: C.ink }]}>
            {r}
          </Text>
        ))}
      </View>
      <View style={{ backgroundColor: C.red, borderRadius: R.md, paddingVertical: 10, paddingHorizontal: 12 }}>
        <Text style={[T.small, { color: C.onRed, fontFamily: T.h2.fontFamily }]}>{o.warnBanner}</Text>
      </View>
    </View>
  );
}

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const pager = useRef<ScrollView>(null);
  const finishOnboarding = useApp((s) => s.finishOnboarding);
  const setPermission = useRuntime((s) => s.setPermission);

  const go = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(PAGES - 1, i));
      setStep(n);
      pager.current?.scrollTo({ x: n * width, animated: true });
    },
    [width],
  );

  // Android 뒤로 가기는 앞 장으로. 첫 장에서는 기본 동작(앱 닫기)
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (step === 0) return false;
        go(step - 1);
        return true;
      });
      return () => sub.remove();
    }, [step, go]),
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const n = Math.round(e.nativeEvent.contentOffset.x / width);
    if (n !== step && n >= 0 && n < PAGES) setStep(n);
  };

  // 알림을 거부해도 넘어간다. 홈이 붉은 배너와 설정 열기를 띄운다(명세 7절)
  // Android 13+는 채널이 있어야 권한 창이 뜬다. 권한을 묻기 전에 채널부터 만든다
  const agree = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setupNotifications();
      setPermission(await requestPermission());
    } catch (e) {
      reportError(e, 'notify');
    }
    finishOnboarding();
    router.replace('/auth');
  };

  const pages = [
    <Hook key="hook" />,
    <Statement key="problem" title={o.problem} sub={o.problemSub} />,
    <Statement key="promise" title={o.promise} sub={o.promiseSub} />,
    <Warning key="warn" />,
  ];

  return (
    <SurfaceProvider theme="ivory">
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 ? (
            <ScrollView
              ref={pager}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={32}
            >
              {pages.map((p, i) => (
                <ScrollView
                  key={i}
                  style={{ width }}
                  contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + S.xl, paddingHorizontal: S.lg, paddingBottom: S.lg }}
                  accessibilityElementsHidden={i !== step}
                  importantForAccessibility={i === step ? 'auto' : 'no-hide-descendants'}
                >
                  {p}
                </ScrollView>
              ))}
            </ScrollView>
          ) : null}
        </View>
        <PrimaryFooter>
          <Dots step={step} />
          {step < PAGES - 1 ? (
            <Button title={o.next} onPress={() => go(step + 1)} />
          ) : (
            <Button title={o.warnAgree} accessibilityLabel={o.warnAgreeLabel} busy={busy} onPress={() => void agree()} />
          )}
        </PrimaryFooter>
      </View>
    </SurfaceProvider>
  );
}
