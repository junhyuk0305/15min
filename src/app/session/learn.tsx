import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '@/components/Banner';
import { ErrorLine } from '@/components/ErrorLine';
import { useLineMenu } from '@/components/LineMenu';
import { FirstRules } from '@/components/learn/FirstRules';
import { ClockHeader, LearnShell } from '@/components/learn/LearnShell';
import { LessonPanel } from '@/components/learn/LessonPanel';
import { IdleModal, PhaseOverlay, StopView, themeOf, useLeave } from '@/components/learn/parts';
import { QuizPanel } from '@/components/learn/QuizPanel';
import type { PanelProps, Result } from '@/components/learn/types';
import { useLearnClock, useOnline, useSessionPresence } from '@/components/learn/useLearnClock';
import { Button, useNow } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { copy, errorText } from '@/lib/copy';
import {
  dayEnded,
  leftMinutes,
  overlayFor,
  overlayMs,
  phaseBar,
  phaseEnd,
  phaseName,
  phaseRemaining,
  phaseTipId,
  saveFailure,
  savePhase,
  studiedBefore,
} from '@/lib/learn';
import { reportError } from '@/lib/report';
import { RETRO_PATH } from '@/lib/route';
import { phaseAt, type DayRow, type Phase } from '@/lib/rules';
import { todayKey, todayKeyOf, todayRow, useApp } from '@/lib/store';
import { markSeen, useTipSeen } from '@/lib/tips';

const t = copy.learn;
const RULES_TIP = 'first-rules';

/**
 * 학습 화면 하나에 A(지난 학습 복습) → B(상황 대화) → C(오늘 학습 복습). 단계는 센 시간으로 정한다(MP P6-1, 2).
 * 경계에 닿으면 문항 중간이라도 끊고(결정안 5) 다음 단계 이름과 남은 시간을 보인다(갭분석 M4). 그동안 시계는 멈춘다.
 * 첫 B, 첫 C 진입에는 전환 화면에 한 줄 안내가 붙고 2초 머문다(갭분석 3.1-6, 9).
 * 처음이면 시계가 돌기 전에 첫 학습 규칙 모달을 띄운다(3.1-4). 서버는 시작 뒤 경과 시간으로만 자르므로 시작 뒤에 읽어도 손해가 없다.
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
  // B의 글자 단위 표시 중에는 응답 중으로 보고 시계를 멈춘다(UXP 3절, 영향지도 B-5)
  const [revealing, setRevealing] = useState(false);
  // 줄 길게 누르기와 헤더 "⋯" 신고 시트. 떠 있는 동안 시계를 멈춘다(안내 모달, UXP 6.1). 활동은 시계가 생긴 뒤 ref로 잇는다
  const touchRef = useRef<() => void>(() => undefined);
  const onMenuActivity = useCallback(() => touchRef.current(), []);
  const menu = useLineMenu(onMenuActivity);
  // 첫 학습 규칙 모달(갭분석 3.1-4). 떠 있는 동안 시계를 멈추고("안내 중"), 단계 안내도 닫힌 뒤에 시작한다
  const rulesOpen = !useTipSeen(RULES_TIP);
  const bSeen = useTipSeen('phase-b');
  const cSeen = useTipSeen('phase-c');

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
    gates: { waiting: waiting > 0, revealing, offline, failed: failed || saveStuck, overlay: leaveOpen || menu.opened, tip: rulesOpen, blocked },
    save,
  });
  useSessionPresence(() => save(clock.current()));

  const { touch, syncTo, current } = clock;
  useEffect(() => {
    touchRef.current = touch;
  }, [touch]);
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

  // 단계 전환: 시간으로 정한 단계가 화면의 단계와 다르면 안내 뒤 바꾼다(시계는 경계에서 멈춰 있다).
  // 그 단계를 처음 안내하면 한 줄을 붙이고 더 오래 머문다. 눌러서 넘길 수 있다. 바꾸면 그 안내는 본 것으로 둔다
  const overlay = overlayFor(shown, clock.secs, targetMinutes, rec.retroSeconds);
  const nextPhase = overlay?.phase ?? null;
  const tipId = nextPhase ? phaseTipId(nextPhase) : null;
  const phaseTip = tipId === 'phase-b' && !bSeen ? copy.tips.phaseB : tipId === 'phase-c' && !cSeen ? copy.tips.phaseC : null;
  const firstVisit = phaseTip !== null;
  const advance = useCallback(
    (phase: Phase) => {
      setFailed(false);
      setShown(phase);
      touch();
      const id = phaseTipId(phase);
      if (id) markSeen(id);
    },
    [touch],
  );
  useEffect(() => {
    if (!nextPhase || rulesOpen) return;
    const id = setTimeout(() => advance(nextPhase), overlayMs(firstVisit));
    return () => clearTimeout(id);
  }, [nextPhase, rulesOpen, firstVisit, advance]);
  const skipOverlay = useCallback(() => {
    if (nextPhase) advance(nextPhase);
  }, [nextPhase, advance]);
  const startRules = useCallback(() => {
    markSeen(RULES_TIP);
    touch();
  }, [touch]);

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

  // 단계 화면에 넘기는 것은 고정된 함수만(1초마다 다시 그려져도 바뀌지 않게, UXP 9.3)
  const { open: openLine, setLatest } = menu;
  const lineMenu = useMemo(() => ({ open: openLine, setLatest }), [openLine, setLatest]);
  const view = shown ?? phaseAt(clock.secs, targetMinutes);
  const header = (
    <ClockHeader
      label={phaseName(view, levelCheck)}
      phaseLeft={view === 'retro' ? undefined : phaseRemaining(view, clock.secs, targetMinutes)}
      remaining={total - clock.secs}
      cells={phaseBar(targetMinutes, clock.secs)}
      paused={!clock.running}
      idle={clock.idle}
      // 한도 초과로 멈춘 화면(StopView)에는 X 대신 기존 홈으로 가기 버튼만 둔다
      onClose={blocked ? undefined : leave.ask}
      onMore={!blocked && menu.latest ? menu.more : undefined}
    />
  );
  const banner = offline ? (
    <Banner message={t.offline} />
  ) : saveStuck ? (
    <Banner message={t.saveStuck} actionTitle={t.saveRetry} onAction={() => save(clock.current())} />
  ) : null;
  const layer = (
    <>
      <IdleModal visible={clock.idle} onContinue={clock.dismissIdle} />
      {leave.sheet(themeOf(view))}
      {menu.sheets}
    </>
  );

  if (blocked) return <StopView theme={themeOf(view)} header={header} title={t.limitTitle} body={t.limitBody} />;

  // 단계 전환 안내와 규칙 모달은 단계 화면 밖에 둔다. 단계 화면이 바뀌어도 안내가 이어서 흐려지며 사라진다
  const frame = (panel: ReactNode) => (
    <View style={{ flex: 1 }}>
      {panel}
      <PhaseOverlay overlay={rulesOpen ? null : overlay} from={themeOf(view)} levelCheck={levelCheck} tip={phaseTip} onSkip={skipOverlay} />
      <FirstRules visible={rulesOpen} targetMinutes={targetMinutes} levelCheck={levelCheck} onStart={startRules} />
    </View>
  );
  const props: PanelProps = { header, banner, overlay: layer, request, setFailed, touch, offline, setRevealing, menu: lineMenu };
  if (shown === 'A' || shown === 'C') return frame(<QuizPanel key={shown} phase={shown} onLevelCheck={shown === 'A' ? onLevelCheck : undefined} {...props} />);
  if (shown === 'B') return frame(<LessonPanel {...props} />);
  return frame(
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
    </LearnShell>,
  );
}
