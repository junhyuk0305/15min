import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { DeleteAccountButton, LegalLinks } from '@/components/AccountLinks';
import { ChatLine } from '@/components/ChatLine';
import { TextButton } from '@/components/TextButton';
import { Body, Button, H1, Screen, styles, useNow } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { uuidv4, type ReflectionMessage } from '@/lib/model';
import { canSend, fmtClock, localParts } from '@/lib/rules';
import { reflectionWindow } from '@/lib/selectors';
import { tzOf, useApp } from '@/lib/store';
import { useBlockBack } from '@/lib/useBlockBack';
import { C, S, T } from '@/lib/theme';

const t = copy.suspended;

function fmtWhen(ms: number, tz: string) {
  const p = localParts(ms, tz);
  return t.date(p.month, p.day, fmtClock(p.hour * 60 + p.minute));
}

/** 코치 답 옆 신고 (명세 7절). 이유는 짧은 보기에서 고른다 */
function Report({ id }: { id: string }) {
  const reportMessage = useApp((s) => s.reportMessage);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (state === 'done') return <Text style={[T.small, { color: C.sub }]}>{copy.report.done}</Text>;
  if (!open) return <TextButton title={copy.report.action} tone="sub" accessibilityLabel={copy.report.label} onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />;
  const send = async (reason: string) => {
    setState('busy');
    setError(null);
    try {
      await reportMessage(id, reason);
      setState('done');
    } catch (e) {
      const err = toApiError(e);
      setError(errorText(err.kind, err.code));
      setState('idle');
    }
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.xs, alignItems: 'center' }}>
      {copy.report.reasons.map((r) => (
        <TextButton key={r} title={r} onPress={() => void send(r)} busy={state === 'busy'} />
      ))}
      <TextButton title={copy.report.cancel} tone="sub" onPress={() => setOpen(false)} />
      {error ? <Text style={[T.small, { color: C.redText }]}>{error}</Text> : null}
    </View>
  );
}

/**
 * 이용 정지 중 화면. 반성문 채팅은 포기한 목표의 원래 시작 시각부터 원래 학습 분 동안만 열린다.
 * 그 밖에는 다음에 열리는 시각을 보인다. 나가는 길 대신 계정 삭제와 약관을 둔다.
 */
export default function Suspended() {
  useBlockBack();
  const now = useNow(15_000);
  const profile = useApp((s) => s.profile);
  const cached = useApp((s) => s.suspendedGoal);
  const reflections = useApp((s) => s.reflections);
  const reflectionTurn = useApp((s) => s.reflectionTurn);
  const tz = useApp(tzOf);
  const [chat, setChat] = useState<'unknown' | 'open' | 'closed'>('unknown');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 실패한 문장. 같은 문장을 다시 보내면 같은 id로 보내 서버가 한 번만 저장한다
  const pending = useRef<{ id: string; text: string } | null>(null);

  // 반성문 시간대는 서버 프로필 값(suspended_start_minutes, suspended_target_minutes)을 쓴다.
  // 그 값이 없는 옛 응답일 때만 이 기기의 목표 캐시로 대신한다
  const sched =
    profile?.suspendedStartMinutes != null && profile.suspendedTargetMinutes != null
      ? { startMinutes: profile.suspendedStartMinutes, targetMinutes: profile.suspendedTargetMinutes }
      : cached;
  const win = sched ? reflectionWindow(sched, now, tz) : null;
  // 시각을 알면 창이 열렸을 때만 서버에 묻는다. 모르면 서버 답으로 정한다
  const shouldAsk = win ? win.open : chat === 'unknown';

  const load = useCallback(
    () =>
      reflectionTurn().then(
        () => {
          setChat('open');
          setError(null);
        },
        (e: unknown) => {
          const err = toApiError(e);
          if (err.kind === 'closed') setChat('closed');
          else setError(errorText(err.kind, err.code));
        },
      ),
    [reflectionTurn],
  );

  const winOpen = win?.open ?? null;
  useEffect(() => {
    if (shouldAsk && chat !== 'open') void load();
    // 창이 열리고 닫힐 때와 처음 한 번만 묻는다. 실패하면 error를 보이고 다음 변화까지 기다린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAsk, winOpen]);

  const send = async () => {
    const body = text.trim();
    if (!canSend(body) || busy) return;
    setBusy(true);
    setError(null);
    setText('');
    const id = pending.current?.text === body ? pending.current.id : uuidv4();
    pending.current = { id, text: body };
    try {
      await reflectionTurn(body, id);
      pending.current = null;
    } catch (e) {
      const err = toApiError(e);
      setText(body); // 입력한 문장은 남긴다 (MP 7.3)
      if (err.kind === 'closed') setChat('closed');
      setError(errorText(err.kind, err.code));
    } finally {
      setBusy(false);
    }
  };

  // 시각을 알면 창이 닫히는 순간 입력을 닫는다
  const open = chat === 'open' && winOpen !== false;
  // 창이 열린 시각(또는 시각을 몰라 서버에 묻는 중)인데 아직 대화를 받지 못했다
  const asking = !open && chat !== 'closed' && (win ? win.open : chat === 'unknown');
  const footer = (
    <>
      {open ? (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t.placeholder}
            placeholderTextColor={C.sub}
            accessibilityLabel={t.placeholder}
            multiline
            style={[styles.input, T.bodySerif, { borderColor: C.ink, backgroundColor: C.card, color: C.ink, minHeight: 80, maxHeight: 160, textAlignVertical: 'top' }]}
          />
          <Button title={t.send} onPress={() => void send()} busy={busy} disabled={!canSend(text)} disabledReason={canSend(text) ? null : t.needText} />
        </>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}>
        <DeleteAccountButton />
      </View>
      <LegalLinks />
    </>
  );

  const speakerOf = (m: ReflectionMessage): 'me' | 'partner' => (m.role === 'user' ? 'me' : 'partner');
  const lines = reflections.map((m, i) => {
    const speaker = speakerOf(m);
    const prev = i > 0 ? speakerOf(reflections[i - 1]) : null;
    return (
      <View key={m.id} style={{ gap: S.xs }}>
        <ChatLine speaker={speaker} text={m.text} who={m.role === 'user' ? t.me : t.coach} prev={prev} />
        {m.role === 'coach' ? <Report id={m.id} /> : null}
      </View>
    );
  });

  return (
    <Screen footer={footer}>
      <H1>{t.title}</H1>
      {profile?.suspendedUntil ? <Body>{t.until(fmtWhen(profile.suspendedUntil, tz))}</Body> : null}
      <Body muted>{t.body}</Body>
      {open ? (
        <>
          <Text style={[T.h2, { color: C.redText }]}>{t.open}</Text>
          {win ? <Body muted>{t.closesAt(fmtWhen(win.closesAt, tz))}</Body> : null}
          <View>{lines}</View>
        </>
      ) : asking ? (
        error ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
            <ActivityIndicator color={C.ink} />
            <Body muted>{t.loading}</Body>
          </View>
        )
      ) : chat === 'closed' || win ? (
        <Body>{win && win.opensAt > now ? t.opensAt(fmtWhen(win.opensAt, tz)) : t.opensUnknown}</Body>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={[T.small, { color: C.redText }]}>
          {error}
        </Text>
      ) : null}
      {error && !open ? <TextButton
          title={copy.status.reload}
          onPress={() => {
            setError(null); // 다시 묻는 동안 진행 표시를 보인다
            void load();
          }}
        /> : null}
    </Screen>
  );
}
