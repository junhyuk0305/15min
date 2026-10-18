// 오류 보고의 순수 부분. 보낼 곳(sink)을 넣어 테스트한다. 앱은 report.ts를 쓴다.
// 사용자 id, 이메일은 보내지 않는다(명세 7절).

export type ErrorSink = { capture: (e: unknown) => void; log: (msg: string, e: unknown) => void };

export function createReporter(sink: ErrorSink, sentryOn: boolean) {
  return function reportError(e: unknown, where = 'app') {
    if (sentryOn) sink.capture(e);
    else sink.log(`[${where}]`, e);
  };
}

type Crumb = { category?: string; data?: { [key: string]: unknown } };

/** 주소에서 쿼리와 해시를 뗀다. 요청 주소의 필터 값(목표 id, 날짜)이 오류 수집 도구로 가지 않게 한다 */
export const stripQuery = (url: string) => url.split(/[?#]/)[0];

/** Sentry beforeBreadcrumb. 요청(fetch, xhr)과 화면 이동 기록의 주소에서 쿼리를 지운다 */
export function scrubBreadcrumb<T extends Crumb>(crumb: T): T {
  const data = crumb.data;
  if (!data) return crumb;
  const out: { [key: string]: unknown } = { ...data };
  for (const key of ['url', 'from', 'to']) {
    const v = out[key];
    if (typeof v === 'string') out[key] = stripQuery(v);
  }
  return { ...crumb, data: out };
}
