import { useState } from 'react';
import { Modal, View } from 'react-native';
import { ErrorLine } from '@/components/ErrorLine';
import { TextButton } from '@/components/TextButton';
import { Button, Label } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { useRuntime } from '@/lib/runtime';
import { useApp } from '@/lib/store';
import { B, C, R, S } from '@/lib/theme';

/**
 * 목표 설정 코치 답 신고(Play AI 생성 콘텐츠 정책). goal-setup은 대화를 저장하지 않아 신고할 글을 함께 보낸다(report_ai_text).
 * 모양은 학습 화면의 신고 창과 같다: 이유 세 개, 실패하면 두 문장, 닫기.
 */
export function useSetupReport() {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setTarget(null);
    setError(null);
  };

  const choose = async (reason: string) => {
    if (target === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await useApp.getState().reportAiText('goal-setup', target, reason);
      useRuntime.getState().setNotice(copy.report.done);
      setTarget(null);
    } catch (e) {
      const err = toApiError(e);
      setError(errorText(err.kind, err.code));
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <Modal transparent visible={target !== null} animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', padding: S.lg, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: '100%', maxWidth: 412, borderRadius: R.xl, borderWidth: B.base, borderColor: C.ink, backgroundColor: C.card, padding: S.md, gap: S.sm }}>
          <Label>{copy.report.label}</Label>
          {copy.report.reasons.map((r) => (
            <Button key={r} title={r} kind="secondary" disabled={busy} onPress={() => void choose(r)} />
          ))}
          <ErrorLine message={error} />
          <TextButton title={copy.report.cancel} onPress={close} busy={busy} />
        </View>
      </View>
    </Modal>
  );

  return {
    open: (text: string) => {
      setError(null);
      setTarget(text);
    },
    sheet,
  };
}
