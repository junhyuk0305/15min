// 개발 빌드 전용 시간 이동과 알림 상태 흉내. 개발 화면(dev/tools)이 __DEV__일 때만 require 하므로 프로덕션 번들에 들어가지 않는다(MP 3절).
// 화면 문구가 아니라 개발 도구라 영어로 둔다. 서버 판정은 서버 시각으로 하므로, 이 이동은 화면 표시와 알림 계획에만 영향이 있다.
import { Text, View } from 'react-native';
import { Row, useNow } from '@/components/ui';
import { buildPlan } from '@/lib/plan';
import { APP_TIME_ZONE, fmtClock, localParts } from '@/lib/rules';
import { useRuntime } from '@/lib/runtime';
import { planInputOf } from '@/lib/selectors';
import { useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

export function DevTools() {
  const now = useNow();
  const state = useApp();
  const plan = buildPlan(planInputOf(state, now));
  const fmt = (ms: number) => {
    const p = localParts(ms, APP_TIME_ZONE);
    return `${p.month}/${p.day} ${fmtClock(p.hour * 60 + p.minute)}`;
  };
  return (
    <View style={{ gap: S.xs, marginTop: S.lg }}>
      <Text style={[T.label, { color: C.sub }]}>DEV TIME SHIFT</Text>
      <Text style={[T.small, { color: C.sub }]}>{`now ${fmt(now)}  scheduled ${plan.length}${plan[0] ? `  next ${fmt(plan[0].at)}` : ''}`}</Text>
      <Row left="+10 min" onPress={() => state.shiftTime(10 * 60_000)} />
      <Row left="+1 hour" onPress={() => state.shiftTime(3600_000)} />
      <Row left="+1 day" onPress={() => state.shiftTime(86400_000)} />
      <Row left="reset" onPress={() => state.resetTime()} />
      {/* 설정 화면 상태 확인용(U6). 앱이 포그라운드로 돌아오면 실제 값으로 다시 읽힌다 */}
      <Text style={[T.label, { color: C.sub, marginTop: S.md }]}>DEV NOTIFY STATE</Text>
      <Row left="notifications denied" onPress={() => useRuntime.getState().setPermission('denied')} />
      <Row left="notifications granted" onPress={() => useRuntime.getState().setPermission('granted')} />
      <Row left="exact alarm denied" onPress={() => useRuntime.getState().setExactAlarm('denied')} />
      <Row left="exact alarm granted" onPress={() => useRuntime.getState().setExactAlarm('granted')} />
    </View>
  );
}
