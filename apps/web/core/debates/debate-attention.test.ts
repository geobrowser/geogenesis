import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDebateAttentionStore } from './debate-attention';

describe('debate attention', () => {
  let focused: boolean;
  let visibilityState: DocumentVisibilityState;
  let store: ReturnType<typeof createDebateAttentionStore>;
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    focused = true;
    visibilityState = 'visible';
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
  });

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function subscribe() {
    store = createDebateAttentionStore(window, document);
    unsubscribe = store.subscribe(vi.fn());
  }

  it.each([
    ['visible and focused', 'visible', true, true],
    ['hidden', 'hidden', true, false],
    ['visible but unfocused', 'visible', false, false],
  ] as const)('initializes %s as %s', (_label, visibility, hasFocus, expected) => {
    visibilityState = visibility;
    focused = hasFocus;
    subscribe();

    expect(store.getSnapshot()).toBe(expected);
  });

  it('deactivates immediately when hidden or pagehide fires', () => {
    subscribe();
    expect(store.getSnapshot()).toBe(true);

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.getSnapshot()).toBe(false);

    visibilityState = 'visible';
    focused = true;
    window.dispatchEvent(new Event('focus'));
    expect(store.getSnapshot()).toBe(true);

    window.dispatchEvent(new Event('pagehide'));
    expect(store.getSnapshot()).toBe(false);
  });

  it('keeps visible blur active for three seconds, then deactivates', () => {
    subscribe();
    focused = false;
    window.dispatchEvent(new Event('blur'));

    vi.advanceTimersByTime(2_999);
    expect(store.getSnapshot()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBe(false);
  });

  it('cancels blur deactivation when focus returns during the grace period', () => {
    subscribe();
    focused = false;
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(2_000);

    focused = true;
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(2_000);

    expect(store.getSnapshot()).toBe(true);
  });

  it('reactivates immediately when visible focus returns after deactivation', () => {
    subscribe();
    focused = false;
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(3_000);
    expect(store.getSnapshot()).toBe(false);

    focused = true;
    window.dispatchEvent(new Event('focus'));
    expect(store.getSnapshot()).toBe(true);
  });

  it('reconciles focus when a page returns from the back-forward cache', () => {
    subscribe();
    window.dispatchEvent(new Event('pagehide'));
    expect(store.getSnapshot()).toBe(false);

    focused = true;
    visibilityState = 'visible';
    window.dispatchEvent(new Event('pageshow'));

    expect(store.getSnapshot()).toBe(true);
  });

  it('reconciles attention when listeners return after a gap', () => {
    subscribe();
    expect(store.getSnapshot()).toBe(true);
    unsubscribe?.();
    unsubscribe = undefined;

    focused = false;
    unsubscribe = store.subscribe(vi.fn());

    expect(store.getSnapshot()).toBe(false);
  });
});
