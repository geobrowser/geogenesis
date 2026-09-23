import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportDebateInteraction = vi.fn(() => Promise.resolve(undefined));
vi.mock('./api', () => ({ reportDebateInteraction: (...args: unknown[]) => reportDebateInteraction(...args) }));

const { INTERACTION_REPORT_INTERVAL_MS, useDebateInteractionReporter } =
  await import('./use-debate-interaction-reporter');

const getToken = () => Promise.resolve('token');
const mount = (enabled = true) => renderHook(() => useDebateInteractionReporter(enabled, getToken, 'account-1'));

const interact = () =>
  act(() => {
    window.dispatchEvent(new Event('pointerdown'));
  });

describe('debate interaction reporter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reportDebateInteraction.mockClear();
  });
  afterEach(() => {
    // Without this each test's hook stays mounted and listening, and the next test sees its
    // reports. The two failures that caught it looked like the throttle misbehaving.
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // The ranking matters most in the seconds after someone comes back, so the first click reports
  // at once rather than up to the throttle interval later.
  it('reports the first interaction immediately', () => {
    mount();
    expect(reportDebateInteraction).not.toHaveBeenCalled();
    interact();
    expect(reportDebateInteraction).toHaveBeenCalledTimes(1);
  });

  it('throttles a burst into one report', () => {
    mount();
    for (let i = 0; i < 20; i += 1) interact();
    expect(reportDebateInteraction).toHaveBeenCalledTimes(1);
  });

  // Continuous activity must keep reporting. A leading-edge-only throttle would fall silent after
  // the first click and the person would age out of "active" while still working.
  it('reports again on the trailing edge while activity continues', () => {
    mount();
    interact();
    interact();
    expect(reportDebateInteraction).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(INTERACTION_REPORT_INTERVAL_MS);
    });
    expect(reportDebateInteraction).toHaveBeenCalledTimes(2);
  });

  it('stays silent when there is no interaction at all', () => {
    mount();
    act(() => {
      vi.advanceTimersByTime(INTERACTION_REPORT_INTERVAL_MS * 10);
    });
    expect(reportDebateInteraction).not.toHaveBeenCalled();
  });

  it('does nothing until the viewer is authenticated', () => {
    const view = mount(false);
    interact();
    expect(reportDebateInteraction).not.toHaveBeenCalled();
    view.unmount();
  });

  it('does not report after unmount', () => {
    const view = mount();
    interact();
    interact();
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(INTERACTION_REPORT_INTERVAL_MS * 3);
    });
    expect(reportDebateInteraction).toHaveBeenCalledTimes(1);
  });

  // A failed report is not worth a visible error: the cost is a slightly stale ranking.
  it('swallows a failed report', () => {
    reportDebateInteraction.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    mount();
    expect(() => interact()).not.toThrow();
  });
});
