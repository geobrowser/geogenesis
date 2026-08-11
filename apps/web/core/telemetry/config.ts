import { Environment } from '~/core/environment';

export const telemetryDsn = Environment.variables.sentryDsn;

// NEXT_PUBLIC_ prefix is required: this runs client-side (instrumentation-client.ts), and
// Next only exposes NEXT_PUBLIC_* env vars to the browser bundle. Set it to '1' to keep
// Sentry off (e.g. during local dev).
export const isTelemetryEnabled = Boolean(telemetryDsn) && process.env.NEXT_PUBLIC_DISABLE_SENTRY !== '1';
