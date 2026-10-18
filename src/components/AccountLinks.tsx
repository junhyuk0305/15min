import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { TextButton } from '@/components/TextButton';
import { Body, Button, H1 } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { useApp } from '@/lib/store';
import { C, R, S, T } from '@/lib/theme';

const t = copy.settings;

/** 계정 삭제 입구. 주 버튼 자리에 두지 않고, 한 번 더 확인한다 (MP 7.5-4) */
export function DeleteAccountButton({ inverse }: { inverse?: boolean }) {
  const deleteAccount = useApp((s) => s.deleteAccount);
  const giveupPending = useApp((s) => s.goal?.giveupRequestedAt != null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      setOpen(false);
    } catch (e) {
      const err = toApiError(e);
      setError(errorText(err.kind, err.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TextButton title={t.deleteAccount} tone="danger" inverse={inverse} onPress={() => setOpen(true)} />
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => !busy && setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: S.lg }}>
          <View style={{ backgroundColor: C.bg, borderRadius: R.xl, padding: S.lg, gap: S.md }}>
            <H1>{t.deleteTitle}</H1>
            <Body>{t.deleteBody}</Body>
            <Body muted>{t.deleteKeep}</Body>
            {giveupPending ? <Text style={[T.body, { color: C.redText }]}>{t.deleteGiveup}</Text> : null}
            {error ? <Text accessibilityRole="alert" style={[T.small, { color: C.redText }]}>{error}</Text> : null}
            <Button title={t.deleteConfirm} kind="danger" busy={busy} onPress={() => void confirm()} />
            <TextButton title={t.deleteCancel} onPress={() => setOpen(false)} disabled={busy} />
          </View>
        </View>
      </Modal>
    </>
  );
}

/** 이용약관, 개인정보처리방침 글자 버튼 */
export function LegalLinks({ inverse }: { inverse?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: S.md, flexWrap: 'wrap' }}>
      <TextButton title={t.terms} tone="sub" inverse={inverse} onPress={() => router.push('/settings/legal/terms')} />
      <TextButton title={t.privacy} tone="sub" inverse={inverse} onPress={() => router.push('/settings/legal/privacy')} />
    </View>
  );
}
