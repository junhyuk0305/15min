import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState, type ComponentType } from 'react';
import { Text, View } from 'react-native';
import { DeleteAccountButton } from '@/components/AccountLinks';
import { H1, Label, Row, Screen } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { openSystemSettings } from '@/lib/notify';
import { useRuntime } from '@/lib/runtime';
import { useApp } from '@/lib/store';
import { C, S, T } from '@/lib/theme';

const t = copy.settings;

// 개발 빌드에서만 불러온다. 프로덕션 번들에서는 이 require와 화면이 함께 빠진다(MP 3절)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DevTools: ComponentType | null = __DEV__ ? require('@/components/DevTools').DevTools : null;

export default function Settings() {
  const goal = useApp((s) => s.goal);
  const signOut = useApp((s) => s.signOut);
  const permission = useRuntime((s) => s.permission);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Screen>
      <H1>{t.title}</H1>
      {goal ? (
        <View>
          <Row left={t.goal} right={goal.name} onPress={() => router.push('/settings/goal')} />
          <Row left={t.coupons} right={copy.unit.sheets(goal.coupons)} onPress={() => router.push('/coupon')} />
        </View>
      ) : null}
      <Row left={t.notif} right={permission === 'granted' ? t.notifOn : t.notifOff} onPress={permission === 'granted' ? undefined : openSystemSettings} />

      <View style={{ gap: S.xs, marginTop: S.md }}>
        <Label>{t.docs}</Label>
        <Row left={t.terms} onPress={() => router.push('/settings/legal/terms')} />
        <Row left={t.privacy} onPress={() => router.push('/settings/legal/privacy')} />
      </View>

      <View style={{ gap: S.xs, marginTop: S.md }}>
        <Label>{t.account}</Label>
        <Row left={t.logout} onPress={busy ? undefined : () => void logout()} />
        <Row left={t.version} right={Constants.expoConfig?.version ?? ''} />
      </View>
      {error ? <Text accessibilityRole="alert" style={[T.small, { color: C.redText }]}>{error}</Text> : null}

      <View style={{ marginTop: S.lg }}>
        <DeleteAccountButton />
      </View>
      {DevTools ? <DevTools /> : null}
    </Screen>
  );
}
