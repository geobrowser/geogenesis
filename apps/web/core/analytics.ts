'use client';

import * as amplitude from '@amplitude/unified';
import posthog from 'posthog-js';

export type AnalyticsProperties = Record<string, unknown>;

const appName = 'geogenesis';
const amplitudeApiKey =
  process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY ?? '87bc6bb6653d7ba096c25a1330dd83a';
const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://v.geobrowser.io';

let amplitudeInitialized = false;
let posthogInitialized = false;
let lastPageView: { key: string; timestamp: number } | null = null;

export const isAnalyticsEnabled = Boolean(amplitudeApiKey || posthogToken);

export function initAnalytics() {
  if (typeof window === 'undefined') {
    return;
  }

  if (amplitudeApiKey && !amplitudeInitialized) {
    try {
      amplitude.initAll(amplitudeApiKey, {
        analytics: { autocapture: true },
        sessionReplay: { sampleRate: 1 },
      });
      amplitudeInitialized = true;
    } catch {
      // Analytics should never block app behavior.
    }
  }

  if (posthogToken && !posthogInitialized) {
    try {
      posthog.init(posthogToken, {
        api_host: posthogHost,
        capture_pageview: false,
        defaults: '2026-01-30',
      });

      posthogInitialized = true;
    } catch {
      // Analytics should never block app behavior.
    }
  }
}

export function capture(eventName: string, properties: AnalyticsProperties = {}) {
  if (typeof window === 'undefined' || !isAnalyticsEnabled) {
    return;
  }

  initAnalytics();

  const eventProperties = {
    app: appName,
    ...properties,
  };

  try {
    if (amplitudeApiKey) {
      amplitude.track(eventName, eventProperties);
    }
  } catch {
    // Analytics should never block app behavior.
  }

  try {
    if (posthogToken) {
      posthog.capture(eventName, eventProperties);
    }
  } catch {
    // Analytics should never block app behavior.
  }
}

export function pageViewed(properties: AnalyticsProperties = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const pageViewKey = `${document.title}|${window.location.href}`;
  const now = Date.now();

  if (lastPageView?.key === pageViewKey && now - lastPageView.timestamp < 1000) {
    return;
  }

  lastPageView = {
    key: pageViewKey,
    timestamp: now,
  };

  capture('page_viewed', {
    page_title: document.title,
    page_url: window.location.href,
    page_path: window.location.pathname,
    ...properties,
  });
}
