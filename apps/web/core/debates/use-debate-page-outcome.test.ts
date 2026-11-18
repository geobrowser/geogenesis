import { renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readDebatePageNavigation,
  resetDebatePageLandingForTests,
  useDebatePageOutcome,
} from './use-debate-page-outcome';

function navigatedTo(url: string, extra: Record<string, unknown> = {}) {
  vi.spyOn(performance, 'getEntriesByType').mockImplementation(type =>
    type === 'navigation' ? ([{ name: url, type: 'navigate', ...extra }] as unknown as PerformanceEntryList) : []
  );
}

describe('readDebatePageNavigation (GEO-3604)', () => {
  beforeEach(() => {
    resetDebatePageLandingForTests();
    window.history.replaceState(null, '', '/space/s1/debate-a');
  });
  afterEach(() => vi.restoreAllMocks());

  it('is the landing when the document was loaded for this page', () => {
    navigatedTo('https://www.geobrowser.io/space/s1/debate-a?utm_source=ig');
    expect(readDebatePageNavigation('debate-a')).toEqual({ entry: 'landing', type: 'navigate', activationStart: 0 });
  });

  it('is in-app when the document was loaded for another page', () => {
    navigatedTo('https://www.geobrowser.io/explore');
    expect(readDebatePageNavigation('debate-a')?.entry).toBe('in_app');
  });

  it('lets only one debate claim the landing, but the same one more than once (Strict Mode builds twice)', () => {
    navigatedTo('https://www.geobrowser.io/space/s1/debate-a');
    expect(readDebatePageNavigation('debate-a')?.entry).toBe('landing');
    expect(readDebatePageNavigation('debate-a')?.entry).toBe('landing');
    window.history.replaceState(null, '', '/space/s1/debate-a');
    expect(readDebatePageNavigation('debate-b')?.entry).toBe('in_app');
  });

  it('counts a return to the landing debate as in-app once the landing visit has sent its outcome', () => {
    navigatedTo('https://www.geobrowser.io/space/s1/debate-a');
    const { result, unmount } = renderHook(() => useDebatePageOutcome('debate-a'));
    expect(result.current).not.toBeNull();
    unmount();
    expect(readDebatePageNavigation('debate-a')?.entry).toBe('in_app');
  });

  it('carries a prerendered page’s activation start', () => {
    navigatedTo('https://www.geobrowser.io/space/s1/debate-a', { type: 'prerender', activationStart: 1_234 });
    expect(readDebatePageNavigation('debate-a')).toMatchObject({ type: 'prerender', activationStart: 1_234 });
  });

  it('is null where the browser has no navigation entry', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    expect(readDebatePageNavigation('debate-a')).toBeNull();
  });
});
