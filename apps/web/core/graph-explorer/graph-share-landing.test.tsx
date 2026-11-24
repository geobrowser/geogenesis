import { act, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordGraphShareLanding } from './graph-share';
import { PageViewTracker } from '~/app/page-view-tracker';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const CENTRE = '3689bd216406451a9e506e85d1e397d7';

function LandingPage() {
  React.useEffect(() => recordGraphShareLanding(), []);
  return <PageViewTracker />;
}

afterEach(() => {
  delete window.lytics;
  vi.useRealTimers();
});

describe('a shared graph link landing', () => {
  it('keeps its tags in the URL until the late-loading runtime has read the landing page view', async () => {
    vi.useFakeTimers();
    const tagged = `/explore/graph/${CENTRE}?topic=${CENTRE}&utm_source=copy_link&utm_medium=share&utm_campaign=geo_share&utm_content=v1:graph:${CENTRE}:22222222222242228222222222222222`;
    window.history.replaceState({}, '', tagged);
    render(<LandingPage />);
    // The tracker's page view is queued: the runtime has not loaded yet.
    await act(async () => vi.advanceTimersByTime(10));

    // The runtime reads the URL when it takes the queued page view, not when it was queued.
    const seen: string[] = [];
    window.lytics = { capture: () => {}, pageViewed: () => void seen.push(window.location.search) };
    window.dispatchEvent(new Event('pointerdown'));
    document.querySelector<HTMLScriptElement>('script[data-geo-analytics-loader]')?.onload?.(new Event('load'));

    expect(seen).toHaveLength(1);
    const landing = new URLSearchParams(seen[0]);
    expect(landing.get('utm_source')).toBe('copy_link');
    expect(landing.get('utm_medium')).toBe('share');
    expect(landing.get('utm_campaign')).toBe('geo_share');
  });
});
