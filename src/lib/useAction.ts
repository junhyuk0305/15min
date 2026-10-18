import { useCallback, useRef, useState } from 'react';
import { toApiError, type ApiError } from './api';
import { errorText } from './copy';

/**
 * 버튼 하나의 서버 요청. 처리 중에는 다시 보내지 않고(MP 7.5-6), 실패하면 두 문장 안내를 남긴다(MP 7.6-5).
 * run은 성공하면 결과를, 실패하면 undefined를 돌려준다.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef(false);
  const run = useCallback(async <T,>(job: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      return await job();
    } catch (e) {
      setError(toApiError(e));
      return undefined;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, error, message: error ? errorText(error.kind, error.code) : null, run, clear: () => setError(null) };
}
