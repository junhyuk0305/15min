import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner } from '@/components/Banner';
import { Composer } from '@/components/Composer';
import { ErrorLine } from '@/components/ErrorLine';
import { ClockHeader, LearnShell } from '@/components/learn/LearnShell';
import { IdleModal, StopView, useLeave } from '@/components/learn/parts';
import { lineText, Transcript } from '@/components/learn/Transcript';
import { useLineMenu } from '@/components/LineMenu';
import { useLearnClock, useOnline, useSessionPresence } from '@/components/learn/useLearnClock';
import { Body, Button, useNow } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { dayEnded, leftMinutes, linesOf, retroAwaitsAnswer, retroClosing, saveFailure, sendId, type Line } from '@/lib/learn';
import { dayKeyId, uuidv4, type Message } from '@/lib/model';
import { reportError } from '@/lib/report';
import { RETRO_SECONDS, type DayRow } from '@/lib/rules';
import { todayKey, todayKeyOf, todayRow, useApp } from '@/lib/store';
import { useReveal } from '@/lib/useReveal';

const t = copy.learn;
const NONE: Message[] = [];

/**
 * 회고 3분(결정안 17). 서버의 고정 영어 질문 2개 뒤에 짧은 후속 질문. 시간은 학습과 같은 규칙으로 센다(기획서 10).
 * 마지막 20초에 보내면 closing으로 보내 서버가 새 질문 없이 마무리한다.
 * 3분을 채우면 주 버튼은 완료하기다. 답을 기다리는 질문이 남아 있으면 입력창을 그 위에 두고 보내기를 테두리 버튼으로 낮춘다.
 * 완료는 서버가 학습 분과 회고 3분을 다시 확인한다.
 * 새 코치 질문은 글자 단위로 보이고 그동안 시계를 멈춘다(UXP 3절). 줄을 길게 누르거나 헤더 "⋯"로 신고한다.
 */
export default function Retro() {
  // 들어온 날에 고정한다. 04:00이 지나 하루가 바뀌면 빈 화면 대신 끝났다는 안내를 보인다(Q-E)
  const [day] = useState(() => todayKey());
  const now = useNow(5000);
  const rec = useApp((s) => (s.goal ? s.days.find((d) => d.goalId === s.goal?.id && d.day === day) : undefined));
  const current = todayKeyOf(now);
  const [gone, setGone] = useState(false);
  // 매 렌더마다 새 함수를 넘기면 이 함수에 걸린 요청 콜백이 5초마다 다시 만들어져 문항과 대화를 다시 불러온다
  const onGone = useCallback(() => setGone(true), []);
  if (rec && dayEnded(day, current, rec.status, gone ? 'not_found' : null)) {
    return <StopView theme="white" title={t.dayEndedTitle} body={t.dayEndedBody} />;
  }
  if (!rec || (rec.status !== 'progress' && rec.status !== 'done')) return null;
  return <RetroBody rec={rec} onGone={onGone} />;
}

function RetroBody({ rec, onGone }: { rec: DayRow; onGone: () => void }) {
  const goalId = rec.goalId;
  const day = rec.day;
  const messages = useApp((s) => s.messages[dayKeyId(goalId, day)]) ?? NONE;
  const done = rec.status === 'done';
  const { offline, setOffline } = useOnline();
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState<'open' | 'send' | 'finish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [netFail, setNetFail] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [text, setText] = useState('');
  const pending = useRef<{ id: string; text: string } | null>(null);
  const [saveStuck, setSaveStuck] = useState(false);
  const saveFails = useRef(0);
  // 나가기 시트가 떠 있는 동안 시계를 멈춘다(안내 모달). 시계보다 먼저 둔다
  const [leaveOpen, setLeaveOpen] = useState(false);
  const lines = useMemo(() => linesOf(messages, 'retro'), [messages]);
  // 글자 단위 표시 중에는 응답 중으로 보고 시계를 멈춘다(영향지도 B-5). 시계보다 먼저 둔다
  const reveal = useReveal(lines.map((l) => ({ id: l.id, text: l.text, ai: l.kind !== 'me' })));
  // 신고 시트가 떠 있는 동안 시계를 멈춘다(UXP 6.1). 활동은 시계가 생긴 뒤 ref로 잇는다
  const touchRef = useRef<() => void>(() => undefined);
  const onMenuActivity = useCallback(() => touchRef.current(), []);
  const menu = useLineMenu(onMenuActivity);

  const save = useCallback(
    (secs: number) => {
      if (secs <= 0 || done) return;
      useApp
        .getState()
        .saveRetroProgress(secs)
        .then(
          () => {
            saveFails.current = 0;
            setSaveStuck(false);
          },
          (e: unknown) => {
            const err = toApiError(e);
            if (err.code === 'not_found') return onGone();
            const r = saveFailure(err.kind, saveFails.current);
            saveFails.current = r.failsInRow;
            if (r.offline) setOffline(true);
            else reportError(err, 'save_retro');
            if (r.stuck) setSaveStuck(true);
          },
        );
    },
    [done, setOffline, onGone],
  );

  const clock = useLearnClock({
    initial: done ? RETRO_SECONDS : rec.retroSeconds,
    total: RETRO_SECONDS,
    gates: { waiting, revealing: reveal.revealing, offline, failed: failed !== null || saveStuck, overlay: leaveOpen || menu.opened, blocked: done || blocked },
    save,
  });
  const { touch, syncTo, current } = clock;
  useEffect(() => {
    touchRef.current = touch;
  }, [touch]);
  useSessionPresence(() => save(current()));
  const { open: openMenu, setLatest } = menu;
  const latest = lines.findLast((l) => l.kind !== 'me' && l.reportable);
  const latestId = latest?.id;
  const latestText = latest ? lineText(latest) : '';
  useEffect(() => {
    setLatest(latestId ? { id: latestId, text: latestText, send: (r) => useApp.getState().reportMessage(latestId, r) } : null);
  }, [latestId, latestText, setLatest]);
  const onLine = useCallback(
    (l: Line) => openMenu({ id: l.id, text: lineText(l), send: l.reportable ? (r) => useApp.getState().reportMessage(l.id, r) : undefined }),
    [openMenu],
  );
  // 3분을 채운 뒤에는 남은 분 대신 완료하기를 눌러야 끝난다고 알린다
  const filled = done || clock.secs >= RETRO_SECONDS;
  const leave = useLeave({
    enabled: !done && !blocked,
    open: leaveOpen,
    setOpen: setLeaveOpen,
    body: filled ? t.leaveFilledBody : t.leaveBody(leftMinutes(RETRO_SECONDS - clock.secs)),
    onActivity: touch,
  });

  /** 실패면 안내 문장을 남긴다. 연결 끊김이면 연결이 돌아올 때 다시 한다 */
  const run = useCallback(
    async (what: 'open' | 'send' | 'finish', job: () => Promise<void>): Promise<boolean> => {
      setWaiting(true);
      try {
        await job();
        setOffline(false);
        setFailed(null);
        setError(null);
        return true;
      } catch (e) {
        const err = toApiError(e);
        reportError(err, 'retro');
        if (err.code === 'not_found') onGone();
        if (err.kind === 'network') setOffline(true);
        if (err.kind === 'limit') setBlocked(true);
        if (err.kind === 'closed') void useApp.getState().refresh();
        setNetFail(err.kind === 'network');
        setFailed(what);
        // 회고 첫 질문은 보낸 것이 없어 ai_failed의 "다시 보내 주십시오" 대신 다시 불러오기로 안내한다
        setError(what === 'open' && err.code === 'ai_failed' ? t.loadFailed : errorText(err.kind, err.code));
        if (what === 'finish' && err.code === 'not_enough_time') {
          // 서버가 경과 시간으로 잘랐다. 서버 값으로 맞추고 회고를 이어 간다
          syncTo(todayRow()?.retroSeconds ?? current());
          setFailed(null);
        }
        return false;
      } finally {
        setWaiting(false);
        touch();
      }
    },
    [setOffline, syncTo, current, touch, onGone],
  );

  const open = useCallback(
    () =>
      run('open', async () => {
        const s = useApp.getState();
        if (todayRow()?.retroStartedAt == null) await s.startRetro();
        if (!s.messages[dayKeyId(goalId, day)]?.some((m) => m.phase === 'retro')) await s.retroTurn();
      }),
    [run, goalId, day],
  );

  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => void open(), 0);
    return () => clearTimeout(id);
  }, [open, done]);

  // 연결이 돌아오면 다시 연다
  const reopen = !offline && failed === 'open' && netFail;
  useEffect(() => {
    if (!reopen) return;
    const id = setTimeout(() => void open(), 0);
    return () => clearTimeout(id);
  }, [reopen, open]);

  const send = async () => {
    const body = text.trim();
    if (!body || waiting) return;
    touch();
    const id = sendId(pending.current, body, uuidv4);
    pending.current = { id, text: body };
    setText('');
    const closing = retroClosing(current());
    const ok = await run('send', () => useApp.getState().retroTurn(body, id, closing));
    if (ok) pending.current = null;
    else setText(body);
  };

  const finish = async () => {
    const out = { earned: false };
    const ok = await run('finish', async () => {
      const s = useApp.getState();
      if (!done) await s.saveRetroProgress(RETRO_SECONDS);
      out.earned = await s.completeDay();
    });
    if (ok) router.replace({ pathname: '/session/done', params: { earned: out.earned ? '1' : '0' } });
  };

  const composer = (
    <Composer
      value={text}
      onChange={(v) => {
        setText(v);
        touch();
      }}
      onSend={() => void send()}
      busy={waiting}
      error={failed === 'send' ? (error ?? t.failed) : null}
      placeholder={t.inputPlaceholder}
      onInputStart={reveal.finish}
    />
  );
  // 시간이 찼어도 답을 기다리는 질문이 남았거나 쓰던 문장이 있으면 입력창을 남긴다. 완료하기가 주 버튼이다
  const keepInput = filled && !done && (retroAwaitsAnswer(messages) || !!text.trim() || failed === 'send');
  const footer = filled ? (
    <>
      {keepInput ? composer : null}
      <Body muted>{t.retroFilled}</Body>
      <ErrorLine message={failed === 'finish' ? error : null} />
      <Button title={t.finish} busy={waiting} onPress={() => void finish()} />
    </>
  ) : failed === 'open' ? (
    <>
      <ErrorLine message={error} />
      <Button title={t.reload} busy={waiting} onPress={() => void open()} />
    </>
  ) : (
    composer
  );

  const header = (
    <ClockHeader
      label={t.phase.retro}
      remaining={RETRO_SECONDS - clock.secs}
      ratio={clock.secs / RETRO_SECONDS}
      paused={!clock.running && !filled}
      idle={clock.idle}
      onClose={done || blocked ? undefined : leave.ask}
      onMore={!blocked && menu.latest ? menu.more : undefined}
    />
  );
  if (blocked) return <StopView theme="white" header={header} title={t.limitTitle} body={t.limitBody} />;

  return (
    <LearnShell
      theme="white"
      header={header}
      banner={
        offline ? (
          <Banner message={t.offline} />
        ) : saveStuck ? (
          <Banner message={t.saveStuck} actionTitle={t.saveRetry} onAction={() => save(current())} />
        ) : null
      }
      footer={footer}
      overlay={
        <>
          <IdleModal visible={clock.idle} onContinue={clock.dismissIdle} />
          {leave.sheet()}
          {menu.sheets}
        </>
      }
      follow
      count={lines.length}
      mineLast={lines.at(-1)?.kind === 'me'}
      revealing={reveal.revealing}
      onTouch={reveal.finish}
    >
      <Body muted>{t.retroSub}</Body>
      <Transcript
        lines={lines}
        partnerName={t.coach}
        coachSpeaks
        waiting={waiting && failed === null}
        note={t.uncounted}
        target={reveal.target}
        isNew={reveal.isNew}
        onLine={onLine}
      />
    </LearnShell>
  );
}
