import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { ActionSheet, BottomSheet } from '@/components/BottomSheet';
import { HeaderMore } from '@/components/Header';
import { TextButton } from '@/components/TextButton';
import { Body, Button, H1 } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { DUR } from '@/lib/motion';
import { useApp } from '@/lib/store';
import { C, T } from '@/lib/theme';

const t = copy.settings;

/** 계정 삭제 확인. 아래에서 올라오는 시트(UXP 3절 "시트"). 삭제하는 동안은 닫지 않는다 */
function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const deleteAccount = useApp((s) => s.deleteAccount);
  const giveupPending = useApp((s) => s.goal?.giveupRequestedAt != null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      onClose();
    } catch (e) {
      const err = toApiError(e);
      setError(errorText(err.kind, err.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissible={!busy}>
      <H1>{t.deleteTitle}</H1>
      <Body>{t.deleteBody}</Body>
      <Body muted>{t.deleteKeep}</Body>
      {giveupPending ? <Text style={[T.body, { color: C.redText }]}>{t.deleteGiveup}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[T.small, { color: C.redText }]}>{error}</Text> : null}
      <Button title={t.deleteConfirm} kind="danger" busy={busy} onPress={() => void confirm()} />
      <TextButton title={t.deleteCancel} onPress={onClose} disabled={busy} />
    </BottomSheet>
  );
}

/** 계정 삭제 입구. 주 버튼 자리에 두지 않고, 한 번 더 확인한다 (MP 7.5-4) */
export function DeleteAccountButton({ inverse }: { inverse?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TextButton title={t.deleteAccount} tone="danger" inverse={inverse} onPress={() => setOpen(true)} />
      <DeleteAccountSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * 강제 화면(반성문, 영구 정지 안내) 헤더 오른쪽 "⋯". 계정 삭제하기, 이용약관, 개인정보처리방침을 고르는 시트를 연다(갭분석 F13).
 * 계정 삭제는 위 확인 시트를 거친다. 시트 두 개가 한꺼번에 떠 있지 않게 고르기 시트가 닫힌 뒤에 연다.
 * report가 있으면 맨 위에 "신고하기"(반성문의 가장 최근 코치 답, UXP 3절 "신고 위치"). 이유 시트는 report 쪽이 이 시트가 닫힌 뒤 연다.
 */
export function AccountMenu({ report }: { report?: () => void } = {}) {
  const [menu, setMenu] = useState(false);
  const [del, setDel] = useState(false);
  // 고르기 시트가 내려간 뒤 확인 시트를 여는 타이머. 그사이 화면이 사라지면 지운다
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const close = () => setMenu(false);
  const legal = (doc: 'terms' | 'privacy') => {
    close();
    router.push(`/settings/legal/${doc}`);
  };
  return (
    <>
      <HeaderMore onPress={() => setMenu(true)} />
      <ActionSheet
        visible={menu}
        onClose={close}
        actions={[
          ...(report
            ? [
                {
                  label: copy.report.menu,
                  onPress: () => {
                    close();
                    report();
                  },
                },
              ]
            : []),
          {
            label: t.deleteAccount,
            danger: true,
            onPress: () => {
              close();
              timer.current = setTimeout(() => setDel(true), DUR.slow);
            },
          },
          { label: t.terms, onPress: () => legal('terms') },
          { label: t.privacy, onPress: () => legal('privacy') },
        ]}
      />
      <DeleteAccountSheet visible={del} onClose={() => setDel(false)} />
    </>
  );
}
