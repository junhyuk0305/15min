import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Screen } from '@/components/ui';
import { copy } from '@/lib/copy';
import { requestPermission } from '@/lib/notify';
import { reportError } from '@/lib/report';
import { useRuntime } from '@/lib/runtime';
import { useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

// 4장: 후킹, 문제, 약속, 경고와 알림(명세 5절). 목표는 로그인 뒤 홈에서 정한다.
const STEPS = 4;
const o = copy.onboarding;

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const finishOnboarding = useApp((s) => s.finishOnboarding);
  const setPermission = useRuntime((s) => s.setPermission);

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));

  // 알림을 거부해도 넘어간다. 홈이 붉은 배너와 설정 열기를 띄운다(결정로그)
  const agree = async () => {
    try {
      setPermission(await requestPermission());
    } catch (e) {
      reportError(e, 'notify');
    }
    finishOnboarding();
    router.replace('/auth');
  };

  const dots = (
    <View style={{ flexDirection: 'row', gap: S.xs }}>
      {Array.from({ length: STEPS }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? C.ink : C.line }} />
      ))}
    </View>
  );

  let content: React.ReactNode = null;
  let footer: React.ReactNode = <Button title={o.next} onPress={next} />;

  if (step === 0) {
    content = (
      <View style={{ gap: S.lg }}>
        <Text style={T.hero}>{o.hookTitle}</Text>
        <View style={{ gap: S.sm }}>
          {o.hookRows.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: C.line, paddingVertical: S.sm }}>
              <Text style={T.h2}>{k}</Text>
              <Text style={[T.big, { fontSize: 32 }]}>{v}</Text>
            </View>
          ))}
        </View>
        <Body>{o.hookBody}</Body>
      </View>
    );
  } else if (step === 1) {
    content = (
      <View style={{ gap: S.md }}>
        <Text style={[T.h1, { fontSize: 36, lineHeight: 46 }]}>{o.problem}</Text>
        <Body muted>{o.problemSub}</Body>
      </View>
    );
  } else if (step === 2) {
    content = (
      <View style={{ gap: S.md }}>
        <Text style={[T.h1, { fontSize: 36, lineHeight: 46 }]}>{o.promise}</Text>
        <Body muted>{o.promiseSub}</Body>
      </View>
    );
  } else {
    content = (
      <View style={{ gap: S.lg }}>
        <Text style={[T.h1, { color: C.redInk, fontSize: 36, lineHeight: 46 }]}>{o.warnTitle}</Text>
        <Text style={[T.h2, { color: C.redInk }]}>{o.warnBody}</Text>
        <Body inverse>{o.warnCoupon}</Body>
      </View>
    );
    footer = <Button title={o.warnAgree} kind="inverse" onPress={() => void agree()} />;
  }

  return (
    <Screen danger={step === STEPS - 1} footer={footer}>
      {step < STEPS - 1 ? dots : null}
      {step > 0 && step < STEPS - 1 ? (
        <Text accessibilityRole="button" onPress={() => setStep(step - 1)} style={[T.small, { color: C.sub }]}>
          {o.prev}
        </Text>
      ) : null}
      <View style={{ flex: 1, justifyContent: step < 3 ? 'center' : 'flex-start', minHeight: 360 }}>{content}</View>
    </Screen>
  );
}
