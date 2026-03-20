import * as Sentry from '@sentry/nextjs';

import { isTelemetryEnabled, telemetryDsn } from '~/core/telemetry/config';

if (isTelemetryEnabled) {
  Sentry.init({
    dsn: telemetryDsn,

    environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // 100% of traces in development, 20% in production
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.2,

    beforeSend(event) {
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
