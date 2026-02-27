import * as Sentry from '@sentry/nextjs';

import { Environment } from '~/core/environment';
import { isTelemetryEnabled, telemetryDsn } from '~/core/telemetry/config';

const tracePropagationTargets = [
  /^\/api\//,
  /^\/monitoring$/,
  Environment.variables.apiEndpoint,
  Environment.variables.apiEndpointTestnet,
];

if (isTelemetryEnabled) {
  Sentry.init({
    dsn: telemetryDsn,

    environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // 100% of traces in development, 20% in production
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.2,

    // Filter wallet rejections globally — these are user-initiated, not errors
    beforeSend(event) {
      const values = event.exception?.values ?? [];

      for (const value of values) {
        if (value.value?.includes('User rejected the request') || value.type === 'UserRejectedRequestError') {
          return null;
        }
      }

      return event;
    },

    // Keep only errors with stack frames from first-party origins.
    allowUrls: [
      /^https:\/\/([\w-]+\.)*geobrowser\.io(?:\/|$)/i,
      /^https:\/\/.*\.vercel\.app(?:\/|$)/i,
      /^https?:\/\/localhost(?::\d+)?(?:\/|$)/i,
      /^https?:\/\/127\.0\.0\.1(?::\d+)?(?:\/|$)/i,
    ],

    // Block errors from proxied third-party origins
    denyUrls: [/geo\.framer\.website/, /geo-blog\.vercel\.app/, /geobrowser-v2\.vercel\.app/],

    // Only propagate tracing headers to app-owned/API routes.
    tracePropagationTargets,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
