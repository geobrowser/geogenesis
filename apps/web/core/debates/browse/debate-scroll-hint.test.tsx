import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateScrollHint } from './debate-scroll-hint';

const BOUNCE_MS = 3 * 700;
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

function renderHint(scrollEl: HTMLElement | null = null) {
  return render(
    <Provider store={store}>
      <DebateScrollHint scrollEl={scrollEl} />
    </Provider>
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
    expect(hint).toHaveStyle({ animationIterationCount: '3' });
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

  it('retires early once the viewer scrolls the feed', async () => {
    const scrollEl = document.createElement('div');
    document.body.appendChild(scrollEl);
    renderHint(scrollEl);

    await advance(300);
    await act(async () => {
      fireEvent.scroll(scrollEl);
    });
    expect(screen.getByTestId('debate-scroll-hint')).toHaveClass('opacity-0');

    await advance(FADE_MS);
    expect(screen.queryByTestId('debate-scroll-hint')).not.toBeInTheDocument();

    // A scroll counts as "message received" — the nudge is spent, not merely postponed.
    cleanup();
    store = createStore();
    renderHint(scrollEl);
    expect(screen.queryByTestId('debate-scroll-hint')).not.toBeInTheDocument();
  });
});
