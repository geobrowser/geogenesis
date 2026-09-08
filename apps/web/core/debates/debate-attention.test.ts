import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDebateAttentionStore, createDebatePresenceStore } from './debate-attention';

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

describe('debate presence', () => {
  let focused: boolean;
  let visibilityState: DocumentVisibilityState;
  let store: ReturnType<typeof createDebatePresenceStore>;
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
    store = createDebatePresenceStore(window, document);
    unsubscribe = store.subscribe(vi.fn());
  }

  // The reason presence exists at all: geo-chat drops an offline user out of `/matchmaking/people`
  // and drops their pending requests out of every recipient's inbox. Neither should happen because
  // the viewer clicked into another window for a moment.
  it('stays present through a blur, however long', () => {
    subscribe();

    focused = false;
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(60_000);

    expect(store.getSnapshot()).toBe(true);
  });

  // GEO-2836. Hiding the tab starts a countdown rather than reporting a departure, because most
  // hides are not departures — the viewer looks something up and comes back.
  it('holds presence through a brief hide and drops once the grace expires', () => {
    subscribe();
    expect(store.getSnapshot()).toBe(true);

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(59_000);
    expect(store.getSnapshot()).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(store.getSnapshot()).toBe(false);
  });

  it('cancels the grace when the tab comes back, and starts a fresh one on the next hide', () => {
    subscribe();

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(30_000);

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60_000);
    expect(store.getSnapshot()).toBe(true);

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(59_000);
    expect(store.getSnapshot()).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(store.getSnapshot()).toBe(false);
  });

  // A tab that wakes for a moment every so often — a throttled timer, a background render — must
  // still expire. Restarting the deadline on each `visibilitychange` would let it live forever.
  it('does not extend the deadline for repeated hidden visibilitychange events', () => {
    subscribe();

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(30_000);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(30_000);

    expect(store.getSnapshot()).toBe(false);
  });

  // The one departure we can be sure of, so it skips the grace entirely: nobody should be offered
  // a debate by someone who has already closed the tab.
  it('drops on pagehide without waiting for the grace, and reconciles from the back-forward cache', () => {
    subscribe();

    window.dispatchEvent(new Event('pagehide'));
    expect(store.getSnapshot()).toBe(false);

    window.dispatchEvent(new Event('pageshow'));
    expect(store.getSnapshot()).toBe(true);
  });

  it('drops on pagehide while a hide grace is already running', () => {
    subscribe();

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));

    expect(store.getSnapshot()).toBe(false);
  });

  it('reconciles when listeners return after a gap', () => {
    subscribe();
    unsubscribe?.();
    unsubscribe = undefined;

    visibilityState = 'hidden';
    unsubscribe = store.subscribe(vi.fn());

    expect(store.getSnapshot()).toBe(false);
  });
});
