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

    // 100% of traces in development, 20% in production
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.2,

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
