// 오류 보고의 순수 부분. 보낼 곳(sink)을 넣어 테스트한다. 앱은 report.ts를 쓴다.
// 사용자 id, 이메일은 보내지 않는다(명세 7절).

export type ErrorSink = { capture: (e: unknown) => void; log: (msg: string, e: unknown) => void };

export function createReporter(sink: ErrorSink, sentryOn: boolean) {
  return function reportError(e: unknown, where = 'app') {
    if (sentryOn) sink.capture(e);
    else sink.log(`[${where}]`, e);
  };
}
