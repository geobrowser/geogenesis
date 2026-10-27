import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REQUEST_ALERT_TITLE, claimRequestAlert, useDebateRequestAlert } from './debate-request-alert';

/** Counts tones: each one starts two oscillators. */
let oscillatorsStarted = 0;
class FakeAudioContext {
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 0 },
      connect: (node: unknown) => node,
      start: () => {
        oscillatorsStarted += 1;
      },
      stop: () => undefined,
    };
  }
  createGain() {
    const gain = {
      gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: (node: unknown) => node,
    };
    return gain;
  }
}
const tones = () => oscillatorsStarted / 2;

let visibility: DocumentVisibilityState = 'visible';
let focused = true;
const setAway = (away: boolean) => {
  visibility = away ? 'hidden' : 'visible';
  focused = !away;
};
const comeBack = () =>
  act(() => {
    setAway(false);
    document.dispatchEvent(new Event('visibilitychange'));
  });

const mount = (ids: string[]) =>
  renderHook(({ pending }: { pending: string[] }) => useDebateRequestAlert(pending), {
    initialProps: { pending: ids },
  });

describe('claiming a request alert across tabs', () => {
  beforeEach(() => window.localStorage.clear());

  it('claims each request once', () => {
    expect(claimRequestAlert('a', 1_000)).toBe(true);
    expect(claimRequestAlert('a', 2_000)).toBe(false);
    expect(claimRequestAlert('b', 2_000)).toBe(true);
  });

  it('forgets claims after an hour', () => {
    expect(claimRequestAlert('a', 0)).toBe(true);
    expect(claimRequestAlert('b', 60 * 60 * 1_000 + 1)).toBe(true);
    expect(claimRequestAlert('a', 60 * 60 * 1_000 + 2)).toBe(true);
  });

  // No storage means nothing to coordinate with: a second tone beats none.
  it('alerts when storage is unavailable or throws', () => {
    expect(claimRequestAlert('a', 0, null)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(claimRequestAlert('a', 0, broken)).toBe(true);
  });

  it('survives a corrupted claim record', () => {
    window.localStorage.setItem('geo:debate-request-alerts', '{not json');
    expect(claimRequestAlert('a', 0)).toBe(true);
    expect(claimRequestAlert('a', 1)).toBe(false);
  });
});

describe('alerting on an incoming debate request', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    oscillatorsStarted = 0;
    setAway(false);
    document.title = 'Geo';
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('plays a tone once per request', () => {
    const { rerender } = mount(['request-1']);
    expect(tones()).toBe(1);

    rerender({ pending: ['request-1'] });
    expect(tones()).toBe(1);

    rerender({ pending: ['request-1', 'request-2'] });
    expect(tones()).toBe(2);
  });

  it('stays quiet when nothing is waiting', () => {
    mount([]);
    expect(tones()).toBe(0);
    expect(document.title).toBe('Geo');
  });

  // Another tab already rang for it.
  it('does not ring for a request another tab claimed', () => {
    claimRequestAlert('request-1');
    mount(['request-1']);
    expect(tones()).toBe(0);
  });

  // Checked at every tick: the flash toggles each second, so a single look after an even number of
  // seconds would find the original title even while it was flashing.
  it('leaves the title alone while the person is looking', () => {
    mount(['request-1']);
    expect(document.title).toBe('Geo');
    for (let second = 0; second < 4; second += 1) {
      act(() => void vi.advanceTimersByTime(1_000));
      expect(document.title).toBe('Geo');
    }
  });

  it('flashes the title while away and restores it on return', () => {
    setAway(true);
    mount(['request-1']);
    expect(document.title).toBe(`(1) ${REQUEST_ALERT_TITLE}`);

    act(() => void vi.advanceTimersByTime(1_000));
    expect(document.title).toBe('Geo');
    act(() => void vi.advanceTimersByTime(1_000));
    expect(document.title).toBe(`(1) ${REQUEST_ALERT_TITLE}`);

    comeBack();
    expect(document.title).toBe('Geo');
    act(() => void vi.advanceTimersByTime(5_000));
    expect(document.title).toBe('Geo');
  });

  // Focusing the window counts as coming back even if the tab was never hidden.
  it('stops flashing when the window regains focus', () => {
    focused = false;
    mount(['request-1']);
    expect(document.title).toBe(`(1) ${REQUEST_ALERT_TITLE}`);

    act(() => {
      focused = true;
      window.dispatchEvent(new Event('focus'));
    });
    expect(document.title).toBe('Geo');
  });

  it('stops flashing once nothing is waiting', () => {
    setAway(true);
    const { rerender } = mount(['request-1']);
    expect(document.title).toBe(`(1) ${REQUEST_ALERT_TITLE}`);

    rerender({ pending: [] });
    expect(document.title).toBe('Geo');
  });

  it('counts every request waiting', () => {
    setAway(true);
    mount(['request-1', 'request-2']);
    expect(document.title).toBe(`(2) ${REQUEST_ALERT_TITLE}`);
  });

  // A browser that refuses audio still gets the title.
  it('flashes even when audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    setAway(true);
    mount(['request-3']);
    expect(document.title).toBe(`(1) ${REQUEST_ALERT_TITLE}`);
  });
});
