'use client';

import posthog from 'posthog-js';

export type AnalyticsProperties = Record<string, unknown>;

const appName = 'geogenesis';
const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://v.geobrowser.io';

let initialized = false;

export const isAnalyticsEnabled = Boolean(posthogToken);

export function initAnalytics() {
  if (!posthogToken || initialized) {
    return;
  }

  posthog.init(posthogToken, {
    api_host: posthogHost,
    capture_pageview: false,
    defaults: '2026-01-30',
  });

  initialized = true;
}

export function capture(eventName: string, properties: AnalyticsProperties = {}) {
  if (!posthogToken) {
    return;
  }

  try {
    initAnalytics();
    posthog.capture(eventName, {
      app: appName,
      ...properties,
    });
  } catch {
    // Analytics should never block app behavior.
  }
}

export function pageViewed(properties: AnalyticsProperties = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  capture('page_viewed', {
    page_title: document.title,
    page_url: window.location.href,
    page_path: window.location.pathname,
    ...properties,
  });
}
