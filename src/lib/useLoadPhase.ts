import { useEffect, useState } from 'react';
import { LOAD_ERROR_MS, LOAD_SHOW_MS } from './selectors';

/**
 * 요청이 걸린 시간(ms). 쉬고 있으면 null. 300ms와 10초 경계에서만 다시 그린다 (MP 7.4-2).
 * 화면은 selectors.loadPhaseOf로 보일 상태를 고른다.
 */
export function useLoadPhase(busy: boolean): number | null {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const startedAt = Date.now();
    const ids = [LOAD_SHOW_MS, LOAD_ERROR_MS].map((ms) => setTimeout(() => setElapsed(Date.now() - startedAt), ms));
    return () => {
      ids.forEach(clearTimeout);
      setElapsed(0);
    };
  }, [busy]);
  return busy ? elapsed : null;
}
