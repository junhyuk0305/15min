// 오류 수집. EXPO_PUBLIC_SENTRY_DSN이 있을 때만 Sentry를 켠다. 없으면 console.error(MP 3절).
// sendDefaultPii false, setUser를 부르지 않는다(명세 7절). 기록(breadcrumb)의 주소에서 쿼리를 지운다.
import * as Sentry from '@sentry/react-native';
import { createReporter, scrubBreadcrumb } from './reportCore';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const sentryOn = !!dsn;

if (dsn) Sentry.init({ dsn, sendDefaultPii: false, beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb) });

export const reportError = createReporter(
  { capture: (e) => Sentry.captureException(e), log: (msg, e) => console.error(msg, e) },
  sentryOn,
);
