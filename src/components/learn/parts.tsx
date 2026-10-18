import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CoachNote } from '@/components/CoachNote';
import { ErrorLine } from '@/components/ErrorLine';
import { LearnShell } from '@/components/learn/LearnShell';
import { useSurface } from '@/components/surface';
import { TextButton } from '@/components/TextButton';
import { Body, Button, H1, Label } from '@/components/ui';
import { copy } from '@/lib/copy';
import { phaseName, type CoachModalView, type ModalEntry, type Overlay } from '@/lib/learn';
import { reportError } from '@/lib/report';
import { fmtDuration, type Phase } from '@/lib/rules';
import { useRuntime } from '@/lib/runtime';
import { useApp } from '@/lib/store';
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

/** 상대와 코치 줄 옆의 작은 글자 버튼 '신고'. 보이는 크기는 작고 hitSlop을 더해 44pt다(MP 7.5-7) */
export function ReportButton({ onPress }: { onPress: () => void }) {
  const { p } = useSurface();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.report.label}
      onPress={onPress}
      hitSlop={S.sm}
      style={({ pressed }) => [{ minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 }]}
    >
      <Text style={[T.small, { color: p.sub, textDecorationLine: 'underline' }]}>{copy.report.action}</Text>
    </Pressable>
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

/**
 * 신고 흐름. open(id)로 이유 고르기를 열고, 고르면 report_message를 보낸다.
 * 열고 닫기는 활동으로 센다(onActivity).
 */
export function useReport(onActivity: () => void) {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    onActivity();
    setTarget(null);
    setError(null);
  };
  const choose = async (reason: string) => {
    if (!target || busy) return;
    onActivity();
    setBusy(true);
    try {
      await useApp.getState().reportMessage(target, reason);
      useRuntime.getState().setNotice(copy.report.done);
      setTarget(null);
      setError(null);
    } catch (e) {
      reportError(e, 'report');
      setError(copy.error.generic);
    } finally {
      setBusy(false);
    }
  };
  const sheet = (
    <Modal transparent visible={target !== null} animationType="fade" onRequestClose={close}>
      <View style={[s.dim, s.center]}>
        <ReportCard busy={busy} error={error} onChoose={(r) => void choose(r)} onCancel={close} />
      </View>
    </Modal>
  );
  return {
    open: (id: string) => {
      onActivity();
      setTarget(id);
    },
    sheet,
  };
}

function ReportCard({ busy, error, onChoose, onCancel }: { busy: boolean; error: string | null; onChoose: (r: string) => void; onCancel: () => void }) {
  const { p } = useSurface();
  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.ink }]}>
      <Label>{copy.report.label}</Label>
      {copy.report.reasons.map((r) => (
        <Button key={r} title={r} kind="secondary" disabled={busy} onPress={() => onChoose(r)} />
      ))}
      <ErrorLine message={error} />
      <TextButton title={copy.report.cancel} onPress={onCancel} busy={busy} />
    </View>
  );
}

/**
 * 영어 입력과 보내기. 실패하면 문장을 남긴 채 실패 안내와 다시 보내기를 보인다(MP 7.3).
 * 글자 수 제한은 없다(결정안 3). 빈 문장만 막고, 막힌 이유를 입력창 위에 한 줄 보인다(MP 7.5-5).
 * error는 실패 안내 문장. 없으면 공통 문장. secondary면 보내기를 테두리 버튼으로 낮춘다(아래에 주 버튼이 따로 있을 때).
 */
export function Composer({
  value,
  onChange,
  onSend,
  busy,
  failed,
  error,
  secondary,
  placeholder = t.inputPlaceholder,
  sendTitle = t.send,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  failed: boolean;
  error?: string | null;
  secondary?: boolean;
  placeholder?: string;
  sendTitle?: string;
}) {
  const { p } = useSurface();
  const empty = !value.trim();
  return (
    <>
      <ErrorLine message={failed ? (error ?? t.failed) : null} />
      {empty && !failed && !busy ? <Text style={[T.small, { color: p.sub }]}>{t.emptyAnswer}</Text> : null}
      <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'stretch' }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={p.sub}
          accessibilityLabel={placeholder}
          multiline
          editable={!busy}
          style={[s.input, T.body, { borderColor: p.ink, backgroundColor: p.card, color: p.ink }]}
        />
        <Button
          title={failed ? t.resend : sendTitle}
          kind={secondary ? 'secondary' : 'primary'}
          onPress={onSend}
          busy={busy}
          disabled={empty}
          style={{ minWidth: failed ? 112 : 84, alignSelf: 'flex-end' }}
        />
      </View>
    </>
  );
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', padding: S.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 412, borderRadius: R.xl, borderWidth: B.base, padding: S.md, gap: S.sm },
  input: { flex: 1, minHeight: 56, maxHeight: 140, borderWidth: B.base, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: 'top' },
});

