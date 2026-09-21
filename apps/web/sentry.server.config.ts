import * as Sentry from '@sentry/nextjs';

import { isTelemetryEnabled, telemetryDsn } from '~/core/telemetry/config';
import { isAbortedResponseStream } from '~/core/telemetry/noise';

if (isTelemetryEnabled) {
  Sentry.init({
    dsn: telemetryDsn,

    environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
    // Server-side, so the unprefixed variable is available; falls back to the shared one so
    // both SDKs report an identical release even if the build sets only NEXT_PUBLIC_SENTRY_RELEASE.
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // 100% of traces in development, 1% in production.
    //
    // 20% is what exhausted the org's quota on 2026-09-10 and left every project blind for the
    // eleven days after it: 12.3M and 12.7M spans on 8-9 September against 6,542 and 8,781 error
    // events, so tracing outran errors by roughly 1,500x. Errors at that volume fit in any plan.
    // Tracing at 20% does not, and a larger budget alone would be spent the same way.
    //
    // 1% is a starting point rather than a measured optimum. If a route genuinely needs denser
    // sampling, prefer a `tracesSampler` that raises it for that route over lifting this floor
    // for everything.
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.01,

    beforeSend(event) {
      // Dropped before anything else: this was the largest error group in production, with zero
      // users impacted, and its volume is what makes real reports hard to find. See noise.ts.
      if (isAbortedResponseStream(event)) return null;

      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.Authorization;
        delete event.request.headers.cookie;
        delete event.request.headers.Cookie;
      }

      return event;
    },
  });
}
