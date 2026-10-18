import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AccountMenu } from '@/components/AccountLinks';
import { Composer } from '@/components/Composer';
import { Header } from '@/components/Header';
import { LearnShell } from '@/components/learn/LearnShell';
import { Transcript } from '@/components/learn/Transcript';
import { useLineMenu } from '@/components/LineMenu';
import { TextButton } from '@/components/TextButton';
import { Body, H1, useNow } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import type { Line } from '@/lib/learn';
import { uuidv4 } from '@/lib/model';
import { APP_TIME_ZONE, canSend, fmtClock, localParts } from '@/lib/rules';
import { reflectionWindow } from '@/lib/selectors';
import { useApp } from '@/lib/store';
import { useBlockBack } from '@/lib/useBlockBack';
import { useReveal } from '@/lib/useReveal';
import { C, S, T } from '@/lib/theme';

const t = copy.suspended;

function fmtWhen(ms: number, tz: string) {
  const p = localParts(ms, tz);
  return t.date(p.month, p.day, fmtClock(p.hour * 60 + p.minute));
}

/**
 * 이용 정지 중 화면. 반성문 채팅은 포기한 목표의 원래 시작 시각부터 원래 학습 분 동안만 열린다.
 * 그 밖에는 다음에 열리는 시각을 보인다. 나가는 길 대신 헤더에 이유 한 줄을 두고, 계정 삭제와 약관은 헤더 "⋯"에 둔다(갭분석 F13).
 * 새 코치 답은 맨 아래로 내려 입력창에 가리지 않게 한다(F13). 글자 단위로 보이고, 길게 누르거나 헤더 "⋯"로 신고한다(UXP 3절).
 */
export default function Suspended() {
  useBlockBack();
  const now = useNow(15_000);
  const profile = useApp((s) => s.profile);
  const cached = useApp((s) => s.suspendedGoal);
  const reflections = useApp((s) => s.reflections);
  const reflectionTurn = useApp((s) => s.reflectionTurn);
  const tz = APP_TIME_ZONE;
  const [chat, setChat] = useState<'unknown' | 'open' | 'closed'>('unknown');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 실패한 문장. 같은 문장을 다시 보내면 같은 id로 보내 서버가 한 번만 저장한다
  const pending = useRef<{ id: string; text: string } | null>(null);
  const lines = useMemo<Line[]>(
    () =>
      reflections.map((m) =>
        m.role === 'user'
          ? { key: m.id, kind: 'me', text: m.text, id: m.id, pending: !!m.pending, reportable: false }
          : { key: m.id, kind: 'coach', text: m.text, id: m.id, modal: null, reportable: true },
      ),
    [reflections],
  );
  const reveal = useReveal(lines.map((l) => ({ id: l.id, text: l.text, ai: l.kind !== 'me' })));
  const menu = useLineMenu();
  const { open: openMenu, toReasons } = menu;
  const targetOf = useCallback((l: Line) => ({ id: l.id, text: l.text, send: (r: string) => useApp.getState().reportMessage(l.id, r) }), []);
  const latest = lines.findLast((l) => l.kind !== 'me');

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
  const footer = open ? (
    <Composer
      value={text}
      onChange={setText}
      onSend={() => void send()}
      busy={busy}
      blocked={!canSend(text)}
      placeholder={t.placeholder}
      onInputStart={reveal.finish}
    />
  ) : null;

  return (
    <LearnShell
      theme="ivory"
      header={<Header title={t.header} left="none" reason={t.locked} right={<AccountMenu report={open && latest ? () => toReasons(targetOf(latest)) : undefined} />} />}
      footer={footer}
      overlay={menu.sheets}
      follow={open}
      count={lines.length}
      mineLast={lines.at(-1)?.kind === 'me'}
      revealing={reveal.revealing}
      onTouch={reveal.finish}
    >
      <H1>{t.title}</H1>
      {profile?.suspendedUntil ? <Body>{t.until(fmtWhen(profile.suspendedUntil, tz))}</Body> : null}
      <Body muted>{t.body}</Body>
      {open ? (
        <>
          <Text style={[T.h2, { color: C.redText }]}>{t.open}</Text>
          {win ? <Body muted>{t.closesAt(fmtWhen(win.closesAt, tz))}</Body> : null}
          <Transcript
            lines={lines}
            partnerName={t.coach}
            coachSpeaks
            waiting={busy}
            target={reveal.target}
            isNew={reveal.isNew}
            onLine={(l) => openMenu(targetOf(l))}
          />
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
    </LearnShell>
  );
}
