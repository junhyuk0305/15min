import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { ActionSheet } from '@/components/BottomSheet';
import { LineEnter } from '@/components/ChatLine';
import { useInk } from '@/components/surface';
import { showToast } from '@/components/Toast';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { DUR } from '@/lib/motion';
import { reportError } from '@/lib/report';
import { markSeen, useTipSeen } from '@/lib/tips';
import { R, S, T } from '@/lib/theme';

/** 길게 누른 줄. send가 없으면 신고할 수 없는 줄이다(앱이 쓴 고정 문장) */
export type LineTarget = { id: string; text: string; send?: (reason: string) => Promise<void> };

type Sheet = { kind: 'line'; target: LineTarget } | { kind: 'more' } | { kind: 'reasons'; target: LineTarget };

const t = copy.report;

/**
 * 상대, 코치 줄 신고와 복사(UXP 3절 "신고 위치", 갭분석 C6, N10).
 * open(target): 줄을 길게 누르면 "신고하기", "복사하기" 시트. more(): 헤더 "⋯"의 "신고하기"는 가장 최근 줄(latest)을 신고한다.
 * 신고하기는 이유 시트로 이어지고, 고르면 보내고 토스트로 알린다. 시트 두 개가 한꺼번에 뜨지 않게 앞 시트가 닫힌 뒤 연다.
 * opened는 시트가 떠 있는 동안 참이다. 학습 시계는 이 동안 멈춘다(안내 모달로 본다, UXP 6.1).
 * onActivity는 학습 시계의 touch처럼 고정된 함수를 넘긴다(UXP 9.3). 돌려주는 함수도 모두 고정이다.
 */
export function useLineMenu(onActivity?: () => void) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [switching, setSwitching] = useState(false);
  const [latest, setLatest] = useState<LineTarget | null>(null);
  const activity = useRef(onActivity);
  useEffect(() => {
    activity.current = onActivity;
  }, [onActivity]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const show = useCallback((next: Sheet | null) => {
    activity.current?.();
    setSheet(next);
  }, []);
  const close = useCallback(() => show(null), [show]);
  /** 앞 시트가 내려간 뒤 이유 시트를 연다 */
  const toReasons = useCallback(
    (target: LineTarget) => {
      show(null);
      setSwitching(true);
      timer.current = setTimeout(() => {
        setSwitching(false);
        show({ kind: 'reasons', target });
      }, DUR.slow);
    },
    [show],
  );
  const open = useCallback((target: LineTarget) => show({ kind: 'line', target }), [show]);
  const more = useCallback(() => show({ kind: 'more' }), [show]);

  const choose = (target: LineTarget, reason: string) => {
    close();
    target.send?.(reason).then(
      () => showToast(t.done),
      (e: unknown) => {
        const err = toApiError(e);
        reportError(err, 'report');
        showToast(errorText(err.kind, err.code));
      },
    );
  };
  const copyText = (text: string) => {
    close();
    Clipboard.setStringAsync(text).then(
      (ok) => showToast(ok ? t.copied : copy.error.generic),
      (e: unknown) => {
        reportError(e, 'clipboard');
        showToast(copy.error.generic);
      },
    );
  };

  const line = sheet?.kind === 'line' ? sheet.target : null;
  const reasons = sheet?.kind === 'reasons' ? sheet.target : null;
  const sheets = (
    <>
      <ActionSheet
        visible={!!line}
        onClose={close}
        actions={[
          ...(line?.send ? [{ label: t.menu, onPress: () => toReasons(line) }] : []),
          { label: t.copy, onPress: () => line && copyText(line.text) },
        ]}
      />
      <ActionSheet visible={sheet?.kind === 'more'} onClose={close} actions={[{ label: t.menu, onPress: () => latest && toReasons(latest) }]} />
      <ActionSheet
        visible={!!reasons}
        onClose={close}
        title={t.label}
        actions={t.reasons.map((r) => ({ label: r, onPress: () => reasons && choose(reasons, r) }))}
      />
    </>
  );

  return { open, more, toReasons, latest, setLatest, opened: sheet !== null || switching, sheets };
}

export type LineMenu = ReturnType<typeof useLineMenu>;

const TIP = 'report-longpress';

/**
 * 첫 AI 메시지 아래 한 번 뜨는 말풍선(갭분석 3.1 8번). 4초 뒤 저절로 닫히고 다시 뜨지 않는다. 시계는 멈추지 않는다.
 */
export function LongPressTip() {
  const seen = useTipSeen(TIP);
  const { p } = useInk();
  useEffect(() => {
    if (seen) return;
    const id = setTimeout(() => markSeen(TIP), DUR.toast);
    return () => clearTimeout(id);
  }, [seen]);
  if (seen) return null;
  return (
    <LineEnter animate style={{ alignSelf: 'flex-start', marginTop: S.xs }}>
      <View style={{ marginLeft: S.md, width: 10, height: 10, backgroundColor: p.ink, transform: [{ rotate: '45deg' }], marginBottom: -5 }} />
      <View accessibilityLiveRegion="polite" style={{ backgroundColor: p.ink, borderRadius: R.md, paddingHorizontal: S.sm, paddingVertical: 6 }}>
        <Text style={[T.small, { color: p.onInk }]}>{t.longPressTip}</Text>
      </View>
    </LineEnter>
  );
}
