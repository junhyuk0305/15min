import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Children, Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import { DeleteAccountButton } from '@/components/AccountLinks';
import { ConfirmSheet } from '@/components/BottomSheet';
import { WEEKDAY_ORDER } from '@/components/goal/logic';
import { showToast } from '@/components/Toast';
import { H1, Row, Screen } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { getExactAlarm, openExactAlarmSettings, openSystemSettings } from '@/lib/notify';
import { fmtClock } from '@/lib/rules';
import { useRuntime } from '@/lib/runtime';
import { useApp } from '@/lib/store';
import { api } from '@/lib/supabase';
import { B, C, F, R, S, T } from '@/lib/theme';
import { resetTips } from '@/lib/tips';

const t = copy.settings;

/** 개발 화면을 여는 "앱 버전" 연속 누름 횟수(메가프롬프트 3절 개발 패널) */
const DEV_TAPS = 7;

/** 학습 요일 요약. 7일은 매일, 월~금은 평일, 나머지는 요일 이름을 붙여 쓴다 */
function daysLabel(weekdays: readonly number[]): string {
  const set = new Set(weekdays);
  if (set.size === 7) return t.everyDay;
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return t.weekdaysOnly;
  return WEEKDAY_ORDER.filter((d) => set.has(d))
    .map((d) => t.weekdayNames[d])
    .join('');
}

/** 묶음 카드(갭분석 7.2). 이름 13px 굵은 회색, 줄 사이 선은 왼쪽 16부터, 아래 회색 설명 13px */
function Group({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: S.sm }}>
      <Text accessibilityRole="header" style={[T.small, { fontFamily: F.sansBold, color: C.sub }]}>
        {label}
      </Text>
      <View style={{ backgroundColor: C.card, borderRadius: R.lg, borderWidth: B.hair, borderColor: C.line, overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View style={{ height: B.hair, marginLeft: S.md, backgroundColor: C.line }} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {note ? <Text style={[T.small, { color: C.sub }]}>{note}</Text> : null}
    </View>
  );
}

export default function Settings() {
  const goal = useApp((s) => s.goal);
  const signOut = useApp((s) => s.signOut);
  const permission = useRuntime((s) => s.permission);
  const exactAlarm = useRuntime((s) => s.exactAlarm);
  const setExactAlarm = useRuntime((s) => s.setExactAlarm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askLogout, setAskLogout] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const taps = useRef(0);

  // 로그인 정보는 기기에 저장된 세션에서 읽는다. 못 읽으면 줄을 숨긴다
  useEffect(() => {
    let alive = true;
    api.getSession().then(
      (s) => {
        if (alive) setEmail(s?.user.email ?? null);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch (e) {
      const err = toApiError(e);
      setError(errorText(err.kind, err.code));
    } finally {
      setBusy(false);
    }
  };

  // 권한을 읽기 전(앱 시작 직후)과 아직 묻지 않은 상태는 'undetermined'다. 홈 배너처럼 판단을 미루고 값을 비운다
  const notifOff = permission === 'denied';
  // 정확한 시각 알림은 Android 권한이다. 확인할 수 없으면(unknown) 줄을 두지 않는다. 거부는 Android에서만 나온다
  const showExact = exactAlarm === 'denied' || (Platform.OS === 'android' && exactAlarm === 'granted');
  const exactOff = exactAlarm === 'denied';
  const tapVersion = () => {
    taps.current += 1;
    if (taps.current < DEV_TAPS) return;
    taps.current = 0;
    router.push('/dev/tools');
  };

  return (
    <Screen>
      <H1>{t.title}</H1>

      <Group label={t.goalGroup}>
        {/* Group이 줄 사이에 선을 긋도록 Fragment 대신 배열로 넘긴다(Children.toArray는 Fragment를 펼치지 않는다) */}
        {goal ? (
          [
            <Row key="goal" inset pressBg left={t.goal} value={goal.name} chevron onPress={() => router.push('/settings/goal')} />,
            <Row key="coupons" inset pressBg left={t.coupons} value={copy.unit.sheets(goal.coupons)} chevron onPress={() => router.push('/coupon')} />,
            <Row
              key="schedule"
              inset
              pressBg
              left={t.schedule}
              value={t.scheduleValue(daysLabel(goal.weekdays), fmtClock(goal.startMinutes))}
              chevron
              onPress={() => router.push('/settings/goal')}
            />,
          ]
        ) : (
          <Row inset pressBg left={t.setGoal} chevron onPress={() => router.push('/goal/new')} />
        )}
      </Group>

      <Group label={t.notifGroup} note={t.notifNote}>
        <Row
          inset
          pressBg
          left={t.notif}
          value={notifOff ? t.notifOff : permission === 'granted' ? t.notifOn : undefined}
          dot={notifOff}
          chevron={notifOff}
          onPress={notifOff ? openSystemSettings : undefined}
        />
        {showExact ? (
          <Row
            inset
            pressBg
            left={t.exactAlarm}
            value={exactOff ? t.exactOff : t.exactOn}
            dot={exactOff}
            chevron={exactOff}
            onPress={exactOff ? () => void openExactAlarmSettings().then(() => setExactAlarm(getExactAlarm())) : undefined}
          />
        ) : null}
      </Group>

      <Group label={t.infoGroup}>
        <Row inset pressBg left={t.terms} chevron onPress={() => router.push('/settings/legal/terms')} />
        <Row inset pressBg left={t.privacy} chevron onPress={() => router.push('/settings/legal/privacy')} />
        <Row
          inset
          pressBg
          left={t.tipsReset}
          onPress={() => {
            resetTips();
            showToast(t.tipsResetToast);
          }}
        />
        {/* 개발 빌드에서만 7번 누르면 개발 화면을 연다. 프로덕션에서는 누를 수 없는 줄이다 */}
        <Row inset pressBg left={t.version} value={Constants.expoConfig?.version ?? ''} onPress={__DEV__ ? tapVersion : undefined} />
      </Group>

      <Group label={t.account}>
        {email ? <Row inset left={t.email} value={email} /> : null}
        <Row inset pressBg left={t.logout} onPress={busy ? undefined : () => setAskLogout(true)} />
      </Group>
      {error ? <Text accessibilityRole="alert" style={[T.small, { color: C.redText }]}>{error}</Text> : null}

      <View style={{ marginTop: S.sm }}>
        <DeleteAccountButton />
      </View>

      <ConfirmSheet
        visible={askLogout}
        onClose={() => setAskLogout(false)}
        title={t.logoutTitle}
        body={t.logoutBody}
        primary={t.logoutConfirm}
        onPrimary={() => {
          setAskLogout(false);
          void logout();
        }}
        secondary={copy.ux.close}
        onSecondary={() => setAskLogout(false)}
      />
    </Screen>
  );
}
