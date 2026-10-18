import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { clockRunning, dismissIdle, PROBE_MS, tick, touch, type ClockGates, type ClockState } from '@/lib/learn';
import { clearAll } from '@/lib/notify';
import { reportError } from '@/lib/report';
import { useRuntime } from '@/lib/runtime';
import { nowMs, todayRow, useApp } from '@/lib/store';

type Gates = Omit<ClockGates, 'appActive' | 'focused'>;

/**
 * 학습과 회고의 시계. 앱이 앞에 있고, 화면이 보이고, gates가 모두 열려 있을 때만 1초씩 센다.
 * limit(단계 경계)에 닿으면 스스로 멈춘다. 화면이 다음 단계로 바꾸면 limit이 늘어 다시 돈다.
 * 2분 동안 활동이 없으면 딴짓 팝업과 진동(기획서 11.2). 5초마다, 경계와 끝에서, 나갈 때 save를 부른다.
 */
export function useLearnClock({
  initial,
  total,
  limit = total,
  gates,
  save,
}: {
  initial: number;
  total: number;
  limit?: number;
  gates: Gates;
  save: (secs: number) => void;
}) {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active' || Platform.OS === 'web');
  const [state, setState] = useState<ClockState>({ secs: Math.min(initial, total), quietMs: 0, idle: false });
  const ref = useRef(state);
  const all: ClockGates = { ...gates, appActive, focused };
  const stop = Math.min(total, limit);
  const gatesRef = useRef(all);
  const saveRef = useRef(save);
  const stopRef = useRef(stop);
  useEffect(() => {
    gatesRef.current = all;
    saveRef.current = save;
    stopRef.current = stop;
  });

  const put = useCallback((s: ClockState) => {
    ref.current = s;
    setState(s);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const r = tick(ref.current, stopRef.current, clockRunning(gatesRef.current));
      if (r.state === ref.current) return;
      put(r.state);
      if (r.save) saveRef.current(r.state.secs);
      if (r.becameIdle && Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch((e: unknown) => reportError(e, 'haptics'));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [put]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      const active = st === 'active';
      setAppActive(active);
      if (active) put(touch(ref.current));
      else saveRef.current(ref.current.secs);
    });
    return () => sub.remove();
  }, [put]);

  return {
    secs: state.secs,
    idle: state.idle,
    running: clockRunning(all) && !state.idle && state.secs < stop,
    /** 활동(결정안 4) */
    touch: useCallback(() => put(touch(ref.current)), [put]),
    dismissIdle: useCallback(() => put(dismissIdle(ref.current)), [put]),
    /** 서버가 센 시간으로 맞춘다(서버가 경과 시간으로 잘랐을 때) */
    syncTo: useCallback((secs: number) => put({ ...ref.current, secs: Math.min(secs, total) }), [put, total]),
    current: useCallback(() => ref.current.secs, []),
  };
}

/**
 * 학습 중이라는 표시. 예약 알림을 내리고, 나가면 나간 시각을 남겨 홈과 독촉이 이어지게 한다.
 * flush는 나갈 때 진행을 저장한다.
 */
export function useSessionPresence(flush: () => void) {
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => {
    const rt = useRuntime.getState();
    rt.setInSession(true);
    clearAll().catch((e: unknown) => reportError(e, 'notify'));
    useApp.getState().setLeftAt(null);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        useApp.getState().setLeftAt(null);
        useRuntime.getState().setInSession(true);
        clearAll().catch((e: unknown) => reportError(e, 'notify'));
      } else {
        flushRef.current();
        if (todayRow()?.status === 'progress') useApp.getState().setLeftAt(nowMs());
        useRuntime.getState().setInSession(false);
      }
    });
    return () => {
      sub.remove();
      flushRef.current();
      if (todayRow()?.status === 'progress') useApp.getState().setLeftAt(nowMs());
      useRuntime.getState().setInSession(false);
    };
  }, []);
}

/** 연결 상태. 끊기면 PROBE_MS마다 서버 시각을 물어 돌아왔는지 본다(netinfo 없이) */
export function useOnline() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!offline) return;
    let alive = true;
    const id = setInterval(() => {
      useApp
        .getState()
        .syncTime()
        .then(
          () => alive && setOffline(false),
          () => undefined, // 아직 끊겨 있다. 다음 확인을 기다린다
        );
    }, PROBE_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [offline]);
  return { offline, setOffline };
}
