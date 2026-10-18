import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner } from '@/components/Banner';
import { ErrorLine } from '@/components/ErrorLine';
import { ClockHeader, LearnShell } from '@/components/learn/LearnShell';
import { Composer, IdleModal, useReport } from '@/components/learn/parts';
import { Transcript } from '@/components/learn/Transcript';
import { useLearnClock, useOnline, useSessionPresence } from '@/components/learn/useLearnClock';
import { Body, Button } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { linesOf, sendId } from '@/lib/learn';
import { dayKeyId, uuidv4, type Message } from '@/lib/model';
import { reportError } from '@/lib/report';
import { RETRO_SECONDS, type DayRow } from '@/lib/rules';
import { todayRow, useApp } from '@/lib/store';

const t = copy.learn;
const NONE: Message[] = [];

/**
 * 회고 3분(결정안 17). 서버의 고정 영어 질문 2개 뒤에 짧은 후속 질문. 시간은 학습과 같은 규칙으로 센다(기획서 10).
 * 3분을 채우면 완료하기 하나만 남는다. 완료는 서버가 학습 분과 회고 3분을 다시 확인한다.
 */
export default function Retro() {
  const rec = useApp((s) => (s.goal ? todayRow(s) : undefined));
  if (!rec || (rec.status !== 'progress' && rec.status !== 'done')) return null;
  return <RetroBody rec={rec} />;
}

function RetroBody({ rec }: { rec: DayRow }) {
  const goalId = rec.goalId;
  const day = rec.day;
  const messages = useApp((s) => s.messages[dayKeyId(goalId, day)]) ?? NONE;
  const done = rec.status === 'done';
  const { offline, setOffline } = useOnline();
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState<'open' | 'send' | 'finish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [netFail, setNetFail] = useState(false);
  const [text, setText] = useState('');
  const pending = useRef<{ id: string; text: string } | null>(null);

  const save = useCallback(
    (secs: number) => {
      if (secs <= 0 || done) return;
      useApp
        .getState()
        .saveRetroProgress(secs)
        .catch((e: unknown) => {
          const err = toApiError(e);
          if (err.kind === 'network') setOffline(true);
          else reportError(err, 'save_retro');
        });
    },
    [done, setOffline],
  );

  const clock = useLearnClock({
    initial: done ? RETRO_SECONDS : rec.retroSeconds,
    total: RETRO_SECONDS,
    gates: { waiting, offline, failed: failed !== null, overlay: false, blocked: done },
    save,
  });
  const { touch, syncTo, current } = clock;
  useSessionPresence(() => save(current()));
  const report = useReport(touch);

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
        if (err.kind === 'network') setOffline(true);
        if (err.kind === 'closed') void useApp.getState().refresh();
        setNetFail(err.kind === 'network');
        setFailed(what);
        setError(what === 'finish' ? errorText(err.kind, err.code) : t.failed);
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
    [setOffline, syncTo, current, touch],
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
    const ok = await run('send', () => useApp.getState().retroTurn(body, id));
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

  const filled = done || clock.secs >= RETRO_SECONDS;
  const footer = filled ? (
    <>
      <Body muted>{t.retroFilled}</Body>
      <ErrorLine message={failed === 'finish' ? error : null} />
      <Button title={t.finish} busy={waiting} onPress={() => void finish()} />
    </>
  ) : failed === 'open' ? (
    <>
      <ErrorLine message={error} />
      <Button title={t.resend} busy={waiting} onPress={() => void open()} />
    </>
  ) : (
    <Composer
      value={text}
      onChange={(v) => {
        setText(v);
        touch();
      }}
      onSend={() => void send()}
      busy={waiting}
      failed={failed === 'send'}
    />
  );

  return (
    <LearnShell
      theme="white"
      header={
        <ClockHeader
          label={t.phase.retro}
          remaining={RETRO_SECONDS - clock.secs}
          ratio={clock.secs / RETRO_SECONDS}
          paused={!clock.running && !filled}
        />
      }
      banner={offline ? <Banner message={t.offline} /> : null}
      footer={footer}
      overlay={<IdleModal visible={clock.idle} onContinue={clock.dismissIdle} />}
      follow
    >
      <Body muted>{t.retroSub}</Body>
      <Transcript lines={linesOf(messages, 'retro')} partnerName={t.coach} coachSpeaks waiting={waiting && failed === null} onReport={report.open} />
      {report.sheet}
    </LearnShell>
  );
}
