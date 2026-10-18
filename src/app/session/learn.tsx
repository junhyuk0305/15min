import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner } from '@/components/Banner';
import { ErrorLine } from '@/components/ErrorLine';
import { ClockHeader, LearnShell } from '@/components/learn/LearnShell';
import { LessonPanel } from '@/components/learn/LessonPanel';
import { IdleModal, PhaseOverlay, StopView, themeOf, useLeave } from '@/components/learn/parts';
import { QuizPanel } from '@/components/learn/QuizPanel';
import type { PanelProps, Result } from '@/components/learn/types';
import { useLearnClock, useOnline, useSessionPresence } from '@/components/learn/useLearnClock';
import { Button, useNow } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import { dayEnded, leftMinutes, OVERLAY_MS, overlayFor, phaseEnd, phaseName, phaseRemaining, saveFailure, savePhase, studiedBefore } from '@/lib/learn';
import { reportError } from '@/lib/report';
import { RETRO_PATH } from '@/lib/route';
import { phaseAt, type DayRow, type Phase } from '@/lib/rules';
import { todayKey, todayKeyOf, todayRow, useApp } from '@/lib/store';

const t = copy.learn;

/**
 * 학습 화면 하나에 A(지난 학습 복습) → B(상황 대화) → C(오늘 학습 복습). 단계는 센 시간으로 정한다(MP P6-1, 2).
 * 경계에 닿으면 문항 중간이라도 끊고(결정안 5) 다음 단계 이름과 남은 시간을 1초 보인다. 그동안 시계는 멈춘다.
 * 시간을 다 채우면 회고를 시작하고 회고 화면으로 간다.
 */
export default function Learn() {
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
  // 학습 중이 아니면 route.ts가 홈으로 보낸다
  if (!rec || rec.status !== 'progress') return null;
  return <LearnBody rec={rec} onGone={onGone} />;
}

function LearnBody({ rec, onGone }: { rec: DayRow; onGone: () => void }) {
  const targetMinutes = rec.targetMinutes;
  const total = targetMinutes * 60;
  const { offline, setOffline } = useOnline();
  const [waiting, setWaiting] = useState(0);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [shown, setShown] = useState<Phase | null>(null);
  const [retroError, setRetroError] = useState<{ message: string; network: boolean } | null>(null);
  const retroStarting = useRef(false);
  // 첫날 A는 수준 확인. 문항을 받기 전에는 지난 학습일로 짐작하고, 문항이 오면 서버 값으로 바꾼다
  const [levelCheck, setLevelCheck] = useState(() => !studiedBefore(useApp.getState().days, rec.goalId, rec.day));
  const onLevelCheck = useCallback((v: boolean) => setLevelCheck(v), []);
  const [saveStuck, setSaveStuck] = useState(false);
  const saveFails = useRef(0);
  // 나가기 시트가 떠 있는 동안 시계를 멈춘다(안내 모달). 시계보다 먼저 둔다
  const [leaveOpen, setLeaveOpen] = useState(false);

  const save = useCallback(
    (secs: number) => {
      if (secs <= 0) return;
      useApp
        .getState()
        .saveProgress(secs, savePhase(secs, targetMinutes))
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
            else reportError(err, 'save_progress');
            if (r.stuck) setSaveStuck(true);
          },
        );
    },
    [targetMinutes, setOffline, onGone],
  );

  // 화면에 띄운 단계의 끝에서 시계가 멈춘다. 처음(shown null)에는 안내가 끝날 때까지 멈춰 있다
  const clock = useLearnClock({
    initial: rec.activeSeconds,
    total,
    limit: shown ? phaseEnd(shown, targetMinutes) : 0,
    gates: { waiting: waiting > 0, offline, failed: failed || saveStuck, overlay: leaveOpen, blocked },
    save,
  });
  useSessionPresence(() => save(clock.current()));

  const { touch, syncTo, current } = clock;
  const leave = useLeave({ enabled: !blocked, open: leaveOpen, setOpen: setLeaveOpen, body: t.leaveBody(leftMinutes(total - clock.secs)), onActivity: touch });
  const request = useCallback(
    async <T,>(job: () => Promise<T>): Promise<Result<T>> => {
      setWaiting((n) => n + 1);
      try {
        const value = await job();
        setOffline(false);
        return { ok: true, value };
      } catch (e) {
        const error = toApiError(e);
        if (error.code === 'not_found') onGone();
        if (error.kind === 'network') setOffline(true);
        if (error.kind === 'limit') setBlocked(true);
        // 하루가 바뀌었거나(04:00) 학습이 닫혔으면 다시 읽어 route.ts가 화면을 옮기게 한다
        if (error.kind === 'closed') void useApp.getState().refresh();
        reportError(error, 'learn');
        return { ok: false, error };
      } finally {
        setWaiting((n) => n - 1);
        touch(); // 응답을 기다린 시간은 딴짓이 아니다
      }
    },
    [setOffline, touch, onGone],
  );

  // 단계 전환: 시간으로 정한 단계가 화면의 단계와 다르면 1초 안내 뒤 바꾼다(시계는 경계에서 멈춰 있다)
  const overlay = overlayFor(shown, clock.secs, targetMinutes, rec.retroSeconds);
  const nextPhase = overlay?.phase ?? null;
  useEffect(() => {
    if (!nextPhase) return;
    const id = setTimeout(() => {
      setFailed(false);
      setShown(nextPhase);
      touch();
    }, OVERLAY_MS);
    return () => clearTimeout(id);
  }, [nextPhase, touch]);

  const startRetro = useCallback(async () => {
    if (retroStarting.current) return;
    retroStarting.current = true;
    setRetroError(null);
    const r = await request(async () => {
      const s = useApp.getState();
      await s.saveProgress(total, 'C');
      await s.startRetro();
    });
    retroStarting.current = false;
    if (r.ok) {
      router.replace(RETRO_PATH);
      return;
    }
    if (r.error.code === 'not_enough_time') {
      // 서버가 경과 시간으로 잘랐다. 서버 값으로 맞추고 C를 이어 간다
      syncTo(todayRow()?.activeSeconds ?? current());
      return;
    }
    setRetroError({ message: errorText(r.error.kind, r.error.code), network: r.error.kind === 'network' });
  }, [request, total, syncTo, current]);

  useEffect(() => {
    if (shown !== 'retro') return;
    const id = setTimeout(() => void startRetro(), 0);
    return () => clearTimeout(id);
  }, [shown, startRetro]);

  // 연결이 돌아오면 회고 시작을 다시 한다
  const retryRetro = !offline && shown === 'retro' && !!retroError?.network;
  useEffect(() => {
    if (!retryRetro) return;
    const id = setTimeout(() => void startRetro(), 0);
    return () => clearTimeout(id);
  }, [retryRetro, startRetro]);

  const view = shown ?? phaseAt(clock.secs, targetMinutes);
  const header = (
    <ClockHeader
      label={phaseName(view, levelCheck)}
      phaseLeft={view === 'retro' ? undefined : phaseRemaining(view, clock.secs, targetMinutes)}
      remaining={total - clock.secs}
      ratio={total ? clock.secs / total : 0}
      paused={!clock.running}
      // 한도 초과로 멈춘 화면(StopView)에는 X 대신 기존 홈으로 가기 버튼만 둔다
      onClose={blocked ? undefined : leave.ask}
    />
  );
  const banner = offline ? (
    <Banner message={t.offline} />
  ) : saveStuck ? (
    <Banner message={t.saveStuck} actionTitle={t.saveRetry} onAction={() => save(clock.current())} />
  ) : null;
  const layer = (
    <>
      <PhaseOverlay overlay={overlay} levelCheck={levelCheck} />
      <IdleModal visible={clock.idle} onContinue={clock.dismissIdle} />
      {leave.sheet(themeOf(view))}
    </>
  );

  if (blocked) return <StopView theme={themeOf(view)} header={header} title={t.limitTitle} body={t.limitBody} />;

  const props: PanelProps = { header, banner, overlay: layer, request, setFailed, touch, offline };
  if (shown === 'A' || shown === 'C') return <QuizPanel key={shown} phase={shown} onLevelCheck={shown === 'A' ? onLevelCheck : undefined} {...props} />;
  if (shown === 'B') return <LessonPanel {...props} />;
  return (
    <LearnShell
      theme={themeOf(view)}
      header={header}
      banner={banner}
      overlay={layer}
      footer={
        shown === 'retro' && retroError ? (
          <>
            <ErrorLine message={retroError.message} />
            <Button title={t.toRetro} busy={waiting > 0} onPress={() => void startRetro()} />
          </>
        ) : null
      }
    >
      {null}
    </LearnShell>
  );
}
