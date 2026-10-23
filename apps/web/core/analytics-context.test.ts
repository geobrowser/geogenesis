import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  delete window.lytics;
  delete window.geoAnalytics;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete window.lytics;
  delete window.geoAnalytics;
});

describe('shared analytics context', () => {
  it.each(['lytics', 'geoAnalytics'] as const)('reads the supported %s runtime', async name => {
    const expected = { anonymous_id: 'visitor', session_id: 'session' };
    window[name] = { getContext: () => expected };
    const { readAnalyticsContext } = await import('./analytics-context');
    expect(readAnalyticsContext()).toEqual(expected);
  });

  it('does not read IDs while analytics is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_DISABLE_POSTHOG', '1');
    const getContext = vi.fn();
    window.lytics = { getContext };
    const { readAnalyticsContext } = await import('./analytics-context');
    expect(readAnalyticsContext()).toEqual({});
    expect(getContext).not.toHaveBeenCalled();
  });

  it('does not interrupt product actions when the runtime throws', async () => {
    window.lytics = {
      getContext: () => {
        throw new Error('unavailable');
      },
    };
    const { readAnalyticsContext } = await import('./analytics-context');
    expect(readAnalyticsContext()).toEqual({});
  });

  it('supports server execution and an unloaded browser runtime', async () => {
    const { readAnalyticsContext, analyticsRuntime } = await import('./analytics-context');
    expect(readAnalyticsContext()).toEqual({});
    vi.stubGlobal('window', undefined);
    expect(analyticsRuntime()).toBeUndefined();
    expect(readAnalyticsContext()).toEqual({});
  });
});
