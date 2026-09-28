import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useDismissedNotice } from './use-dismissed-notice';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('useDismissedNotice', () => {
  it('starts undismissed and reports the dismissal once it is recorded', () => {
    const { result } = renderHook(() => useDismissedNotice('someNotice'));

    expect(result.current.dismissed).toBe(false);
    act(() => result.current.remember());
    expect(result.current.dismissed).toBe(true);
  });

  it('writes to storage, so the notice stays dismissed on the next load', () => {
    const { result } = renderHook(() => useDismissedNotice('someNotice'));
    act(() => result.current.remember());

    expect(window.localStorage.getItem('dismissedNotices')).toContain('someNotice');
  });

  it('keeps notices apart, so dismissing one leaves the others alone', () => {
    const { result: first } = renderHook(() => useDismissedNotice('firstNotice'));
    const { result: second } = renderHook(() => useDismissedNotice('secondNotice'));

    act(() => first.current.remember());

    expect(first.current.dismissed).toBe(true);
    expect(second.current.dismissed).toBe(false);
  });

  // The reason this is shared rather than written out per notice. `space-notices.tsx` builds the
  // next list from the rendered value instead of the setter's argument, so two dismissals in one
  // tick each start from the same stale array and the second overwrites the first.
  it('does not drop a dismissal when two notices are dismissed in the same tick', () => {
    const { result: first } = renderHook(() => useDismissedNotice('firstNotice'));
    const { result: second } = renderHook(() => useDismissedNotice('secondNotice'));

    act(() => {
      first.current.remember();
      second.current.remember();
    });

    expect(first.current.dismissed).toBe(true);
    expect(second.current.dismissed).toBe(true);
  });

  // Same root cause, the other symptom: an id appended twice is a list that grows without bound
  // for anyone who double-clicks a close button.
  it('records an id once however many times it is remembered', () => {
    const { result } = renderHook(() => useDismissedNotice('someNotice'));

    act(() => {
      result.current.remember();
      result.current.remember();
    });
    act(() => result.current.remember());

    const stored = JSON.parse(window.localStorage.getItem('dismissedNotices') ?? '[]') as Array<string>;
    expect(stored.filter(id => id === 'someNotice')).toHaveLength(1);
  });
});
