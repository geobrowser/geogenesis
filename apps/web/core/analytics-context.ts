import type { AnalyticsProperties } from './analytics';

// Shared by the loader and context snapshots so disabling analytics also disables ID reads.
export const isAnalyticsEnabled = process.env.NEXT_PUBLIC_DISABLE_POSTHOG !== '1';

export function analyticsRuntime() {
  return typeof window === 'undefined' ? undefined : (window.lytics ?? window.geoAnalytics);
}

/** Telemetry is observational: unavailable or throwing runtimes must not block an action. */
export function readAnalyticsContext(): AnalyticsProperties {
  if (!isAnalyticsEnabled) return {};
  try {
    return analyticsRuntime()?.getContext?.() ?? {};
  } catch {
    return {};
  }
}
