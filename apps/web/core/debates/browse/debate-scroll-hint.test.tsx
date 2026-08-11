import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateScrollHint } from './debate-scroll-hint';

const BOUNCE_MS = 6 * 700;
const FADE_MS = 200;

let store: ReturnType<typeof createStore>;

// `atomWithStorage` re-reads localStorage on mount, so a fresh jotai store alone doesn't
// isolate tests — the backing storage has to be fresh too.
function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', memoryStorage());
  store = createStore();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderHint() {
  return render(
    <Provider store={store}>
      <DebateScrollHint />
    </Provider>
  );
}

function isSpent() {
  return JSON.parse(localStorage.getItem('dismissedProductOnboardingHints') ?? '[]').includes(
    'geoDebateScrollHintDismissedV1'
  );
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe('DebateScrollHint', () => {
  it('bounces a fixed number of times, then fades out and never returns', async () => {
    renderHint();

    const hint = screen.getByTestId('debate-scroll-hint');
    expect(hint).toHaveClass('animate-debate-scroll-hint', 'motion-reduce:animate-none', 'opacity-100');
    expect(hint).toHaveStyle({ animationIterationCount: '6' });
    expect(hint).toHaveTextContent('Scroll');
    expect(hint).toHaveTextContent('Swipe');

    // Still bouncing right up to the last frame of the final bounce.
    await advance(BOUNCE_MS - 1);
    expect(screen.getByTestId('debate-scroll-hint')).toHaveClass('opacity-100');

    await advance(1);
    expect(screen.getByTestId('debate-scroll-hint')).toHaveClass('opacity-0');

    await advance(FADE_MS);
    expect(screen.queryByTestId('debate-scroll-hint')).not.toBeInTheDocument();

    // A fresh store stands in for a later page load: the dismissal has to survive in
    // storage, not just in memory.
    cleanup();
    store = createStore();
    renderHint();
    expect(screen.queryByTestId('debate-scroll-hint')).not.toBeInTheDocument();
  });

  // Regression: the feed is `snap-mandatory`, so the browser fires `scroll` on the
  // container as the videos load and it re-snaps. An earlier version dismissed on that
  // event, which spent the one-and-only showing before the hint ever painted.
  it('keeps bouncing through scroll activity on the feed and stays unspent until it has played', async () => {
    const scrollEl = document.createElement('div');
    document.body.appendChild(scrollEl);
    renderHint();

    await act(async () => {
      fireEvent.scroll(scrollEl);
      fireEvent.scroll(window);
    });
    expect(screen.getByTestId('debate-scroll-hint')).toHaveClass('opacity-100');
    expect(isSpent()).toBe(false);

    await advance(BOUNCE_MS - 1);
    expect(screen.getByTestId('debate-scroll-hint')).toHaveClass('opacity-100');
    expect(isSpent()).toBe(false);

    await advance(1);
    expect(screen.getByTestId('debate-scroll-hint')).toHaveClass('opacity-0');

    await advance(FADE_MS);
    expect(screen.queryByTestId('debate-scroll-hint')).not.toBeInTheDocument();
    expect(isSpent()).toBe(true);
  });
});
