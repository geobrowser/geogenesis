import * as Sentry from '@sentry/nextjs';

import { initAnalytics } from '~/core/analytics';
import { Environment } from '~/core/environment';
import { isTelemetryEnabled, telemetryDsn } from '~/core/telemetry/config';

initAnalytics();

const tracePropagationTargets: (string | RegExp)[] = [
  /^\/api\//,
  /^\/monitoring$/,
  // The active network's API endpoint (mainnet apiEndpoint is optional now, so
  // listing both raw vars would inject undefined on testnet-only configs).
  Environment.getConfig().api,
];

/**
 * Analytics beacons that an ad-blocker or privacy extension refused.
 *
 * These are unactionable by construction — the request never leaves the browser, no user-facing
 * behaviour changes, and the "fix" would be asking users to disable their blocker. They are
 * also overwhelming: measured over 7 days, 5,742 of 6,251 error events (92%) were these, which
 * buried the ~500 real ones and made the issue stream unreadable. Dropping them client-side
 * also stops them consuming event quota.
 *
 * Matched on the host rather than on "Failed to fetch", because that message is the generic
 * one every genuine network failure produces — filtering by it would silently discard real
 * API failures, which is exactly the mistake worth avoiding here.
 */
const BLOCKED_ANALYTICS_HOSTS = ['api2.amplitude.com', 'api.amplitude.com', 'cdn.amplitude.com'];

/** Frames from the analytics bundle, which is served from the root as `ga-<contenthash>.js`. */
const ANALYTICS_BUNDLE_FRAME = /(^|\/)ga-[a-z0-9]+\.js$/i;

/** Amplitude's own transport functions, as they appear in the analytics bundle's frames. */
const ANALYTICS_TRANSPORT_FUNCTIONS = ['sendAmplitudeHttp', 'flushAmplitudeEvents', 'queueAmplitude'];

type SentryExceptionValue = {
  value?: string;
  stacktrace?: { frames?: { filename?: string; function?: string }[] };
};

function isBlockedAnalyticsTransport(value: SentryExceptionValue): boolean {
  // Two independent signals, because either alone is brittle. The message currently carries the
  // host ("Failed to fetch (api2.amplitude.com)"), but that formatting is the SDK's and could
  // change; the stack frames are the analytics bundle's own and are stable.
  if (value.value && BLOCKED_ANALYTICS_HOSTS.some(host => value.value!.includes(host))) {
    return true;
  }

  const frames = value.stacktrace?.frames ?? [];
  return frames.some(
    frame =>
      (frame.filename !== undefined && ANALYTICS_BUNDLE_FRAME.test(frame.filename)) ||
      (frame.function !== undefined && ANALYTICS_TRANSPORT_FUNCTIONS.includes(frame.function))
  );
}

if (isTelemetryEnabled) {
  Sentry.init({
    dsn: telemetryDsn,

    environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
    // NEXT_PUBLIC_ prefix is load-bearing: this runs in the browser, and Next only inlines
    // NEXT_PUBLIC_* variables into the client bundle. This read `VERCEL_GIT_COMMIT_SHA`
    // directly, which is server-only, so it resolved to `undefined` and every client event was
    // reported with no release — leaving the uploaded source maps unmatchable and every browser
    // stack minified. Set in next.config.ts from the same value the source-map upload pins.
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // 100% of traces in development, 20% in production
    tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.2,

    // Filter wallet rejections globally — these are user-initiated, not errors
    beforeSend(event) {
      const values = event.exception?.values ?? [];

      for (const value of values) {
        if (value.value?.includes('User rejected the request') || value.type === 'UserRejectedRequestError') {
          return null;
        }
        if (isBlockedAnalyticsTransport(value)) {
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
