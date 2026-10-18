import { router, useNavigation } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useCallback, useRef, type ReactNode } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { ConfirmSheet } from '@/components/BottomSheet';
import { CoachNote } from '@/components/CoachNote';
import { LearnShell } from '@/components/learn/LearnShell';
import { useSurface } from '@/components/surface';
import { Body, Button, H1 } from '@/components/ui';
import { copy } from '@/lib/copy';
import { phaseName, type CoachModalView, type ModalEntry, type Overlay } from '@/lib/learn';
import { fmtDuration, type Phase } from '@/lib/rules';
import { B, F, PALETTES, R, S, T, type ThemeName } from '@/lib/theme';

const t = copy.learn;

/** 단계별 테마: A 화이트, B 다크, C 화이트(기획서 11.4). 회고도 화이트 */
export const themeOf = (phase: Phase): ThemeName => (phase === 'B' ? 'dark' : 'white');

/** 단계 전환 안내. 다음 단계 테마로 화면을 덮고 이름과 남은 시간을 1초 보인다. 첫날 A는 수준 확인 */
export function PhaseOverlay({ overlay, levelCheck }: { overlay: Overlay | null; levelCheck?: boolean }) {
  if (!overlay) return null;
  const p = PALETTES[themeOf(overlay.phase)];
  return (
    <View accessibilityLiveRegion="assertive" style={[StyleSheet.absoluteFill, s.center, { backgroundColor: p.bg, gap: S.sm }]}>
      <Text accessibilityRole="header" style={[T.h1Serif, { color: p.ink }]}>
        {phaseName(overlay.phase, levelCheck)}
      </Text>
      <Text style={[T.hero, { color: p.ink }]}>{fmtDuration(overlay.remaining * 1000)}</Text>
    </View>
  );
}

/** 딴짓 팝업(기획서 11.2). 시간은 멈춰 있고, 계속하기를 눌러야 다시 흐른다 */
export function IdleModal({ visible, onContinue }: { visible: boolean; onContinue: () => void }) {
  const { p } = useSurface();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onContinue}>
      <View style={[s.dim, s.center]}>
        <View style={[s.card, { backgroundColor: p.red, borderColor: p.red }]}>
          <Text style={[T.label, { color: p.onRed }]}>{copy.learn.idleKicker}</Text>
          <H1 inverse>{copy.learn.idleTitle}</H1>
          <Body inverse>{copy.learn.idleBody}</Body>
          <Button title={copy.learn.idleContinue} kind="inverse" onPress={onContinue} />
        </View>
      </View>
    </Modal>
  );
}

function Entry({ kind, e }: { kind: string; e: ModalEntry }) {
  const { p } = useSurface();
  return (
    <View style={{ gap: 2, borderTopWidth: B.hair, borderTopColor: p.line, paddingTop: S.sm }}>
      <Text style={[T.label, { color: p.sub }]}>{kind}</Text>
      <Text style={{ fontFamily: F.sansBold, fontSize: 16, lineHeight: 23, color: p.ink }}>{e.en}</Text>
      {e.ko ? <Text style={[T.body, { color: p.ink }]}>{e.ko}</Text> : null}
      {e.note ? <Text style={[T.small, { color: p.sub }]}>{e.note}</Text> : null}
    </View>
  );
}

/**
 * 코치 모달(결정안 10). 표현 1개와 단어 최대 2개. 각각 영어, 한국어 뜻, 한 문장 설명. 닫기 하나.
 * 복습의 항목 설명(결정안 12)도 같은 모양으로 쓴다.
 */
export function CoachModal({
  modal,
  note,
  onClose,
}: {
  modal: CoachModalView | null;
  /** 코치 안내 한 문장 */
  note?: string;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible={!!modal} animationType="fade" onRequestClose={onClose}>
      <View style={[s.dim, s.center]}>
        <View style={{ width: '100%', maxWidth: 412 }}>
          <CoachNote kicker={t.coach} modal description={note || undefined}>
            {modal?.expression ? <Entry kind={t.expression} e={modal.expression} /> : null}
            {modal?.words.map((w) => <Entry key={w.en} kind={t.word} e={w} />)}
            <Button title={t.close} onPress={onClose} style={{ marginTop: S.xs }} />
          </CoachNote>
        </View>
      </View>
    </Modal>
  );
}

/** 학습을 이어 갈 수 없어 멈춘 화면(한도 초과, 04:00 경계). 학습과 회고가 같이 쓴다. 주 버튼은 홈으로 가기 */
export function StopView({ theme, header, title, body }: { theme: ThemeName; header?: ReactNode; title: string; body: string }) {
  return (
    <LearnShell theme={theme} header={header} footer={<Button title={t.home} onPress={() => router.replace('/')} />}>
      <View style={{ flex: 1, justifyContent: 'center', gap: S.md }}>
        <H1>{title}</H1>
        <Body muted>{body}</Body>
      </View>
    </LearnShell>
  );
}

/** 뒤로 가는 동작. 이것만 시트로 막고 replace, navigate(회고로 넘어가기, route.ts 이동)는 그대로 보낸다 */
const BACK_ACTIONS = new Set(['GO_BACK', 'POP', 'POP_TO_TOP']);

/**
 * 학습 나가기(UXP 3절, 갭분석 N8). X(ask), Android 뒤로, iOS 스와이프가 같은 확인 시트를 연다.
 * open, setOpen은 부르는 쪽이 가진다. 시계보다 먼저 만들어 그 값으로 시계를 멈춘다(안내 모달로 본다, UXP 6.1).
 * 나가기는 OS 뒤로와 같다: 막았던 동작을 그대로 보내고, X였으면 앞 화면(없으면 홈)으로 간다. 이탈 처리는 useSessionPresence가 한다.
 * onActivity는 학습 시계의 touch처럼 고정된 함수를 넘긴다(1초마다 다시 그려져도 콜백이 바뀌지 않게, UXP 9.3).
 */
export function useLeave({
  enabled,
  open,
  setOpen,
  body,
  onActivity,
}: {
  enabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  body: string;
  onActivity: () => void;
}) {
  const navigation = useNavigation();
  const pending = useRef<NavigationAction | null>(null);
  const leaving = useRef(false);
  usePreventRemove(enabled, ({ data }) => {
    if (leaving.current || !BACK_ACTIONS.has(data.action.type)) {
      navigation.dispatch(data.action);
      return;
    }
    pending.current = data.action;
    onActivity();
    setOpen(true);
  });
  const ask = useCallback(() => {
    pending.current = null;
    onActivity();
    setOpen(true);
  }, [onActivity, setOpen]);
  const stay = useCallback(() => {
    pending.current = null;
    onActivity();
    setOpen(false);
  }, [onActivity, setOpen]);
  const leave = useCallback(() => {
    const action = pending.current;
    pending.current = null;
    leaving.current = true;
    setOpen(false);
    if (action) navigation.dispatch(action);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [navigation, setOpen]);
  // 학습 B(다크)에서는 시트도 다크로 그린다
  const sheet = (theme?: ThemeName) => (
    <ConfirmSheet visible={open} onClose={stay} title={t.leaveTitle} body={body} primary={t.stay} onPrimary={stay} secondary={t.leave} onSecondary={leave} theme={theme} />
  );
  return { ask, sheet };
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', padding: S.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 412, borderRadius: R.xl, borderWidth: B.base, padding: S.md, gap: S.sm },
});

