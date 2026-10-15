import { act, fireEvent, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StackedCard, TickerWindow } from '~/core/debates/claim-ticker';

import { DebateClaimCounter } from './debate-claim-counter';

const mocks = vi.hoisted(() => ({
  percent: new Map<string, number | null>(),
  respond: vi.fn(),
}));

vi.mock('~/core/action-context-provider', () => ({
  ActionSurface: ({ children }: { children: React.ReactNode }) => children,
  ActionSurfaceDiv: (props: React.ComponentProps<'div'>) => <div {...props} />,
}));

vi.mock('./use-debate-claim-response', () => ({
  useDebateClaimResponse: ({ claimId }: { claimId: string }) => ({
    responseKind: 'stance',
    summary: { percent: mocks.percent.get(claimId) ?? null },
    control: { viewerPosition: null, canRespond: true, respond: mocks.respond, actionTitle: () => '' },
  }),
}));

/** A claim said at `saidMs` (its card's window opens when it has been said). */
const said = (id: string, saidMs: number, text = `Claim ${id}`): StackedCard => ({
  window: {
    claim: { id, text, spaceId: 'space-1' },
    startMs: saidMs,
    endMs: saidMs + 8_000,
  } as unknown as TickerWindow,
  opacity: 1,
});

const renderCounter = (history: StackedCard[], playheadMs: number, onSeeAll?: () => void) =>
  render(
    <DebateClaimCounter
      history={history}
      playheadMs={playheadMs}
      name="Preston"
      rowsByClaimId={new Map()}
      entitiesByClaimId={new Map()}
      onAnswered={() => {}}
      onSeeAll={onSeeAll}
    />
  );

beforeEach(() => {
  vi.useFakeTimers();
  mocks.percent = new Map();
});
afterEach(() => vi.useRealTimers());

const counter = (container: HTMLElement) => container.querySelector('[data-claim-counter]') as HTMLElement;
const hover = (el: HTMLElement) => fireEvent.pointerEnter(el, { pointerType: 'mouse' });
const leave = (el: HTMLElement) => fireEvent.pointerLeave(el, { pointerType: 'mouse' });

describe('DebateClaimCounter (GEO-3317)', () => {
  it('shows the count from the start, at 0, and opens nothing with nothing said', () => {
    const { container } = renderCounter([], 1_000);
    expect(container.querySelector('[data-claim-count]')?.getAttribute('data-claim-count')).toBe('0');

    hover(counter(container));
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('[data-claim-list]')).toBeNull();
  });

  it('never shows a claim’s text unless asked', () => {
    const { container } = renderCounter([said('a', 1_000, 'Whoever asks should plan the date')], 1_500);
    expect(container.textContent).not.toContain('Whoever asks');
  });

  it('rises a +1 out of the counter as a claim is said, and lets it go', () => {
    const history = [said('a', 10_000)];
    const { container, rerender } = renderCounter(history, 10_200);
    expect(container.querySelector('[data-claim-plus-one]')?.textContent).toBe('+1 claim');
    // Inside the counter's own box, so it starts at the counter rather than above it.
    expect(
      container.querySelector('[data-claim-plus-one]')?.parentElement?.querySelector('[data-claim-count]')
    ).not.toBeNull();

    rerender(
      <DebateClaimCounter
        history={history}
        playheadMs={12_000}
        name="Preston"
        rowsByClaimId={new Map()}
        entitiesByClaimId={new Map()}
        onAnswered={() => {}}
      />
    );
    expect(container.querySelector('[data-claim-plus-one]')).toBeNull();
  });

  it('opens after a moment on the counter, holds while the pointer crosses into the list, closes after it leaves', () => {
    const { container } = renderCounter([said('a', 1_000), said('b', 2_000)], 30_000);
    hover(counter(container));
    act(() => vi.advanceTimersByTime(100));
    expect(container.querySelector('[data-claim-list]')).toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(container.querySelector('[data-claim-list]')).not.toBeNull();

    leave(counter(container));
    act(() => vi.advanceTimersByTime(150));
    // Back on it before it closed: still open.
    hover(counter(container));
    act(() => vi.advanceTimersByTime(400));
    expect(container.querySelector('[data-claim-list]')).not.toBeNull();

    leave(counter(container));
    act(() => vi.advanceTimersByTime(300));
    expect(container.querySelector('[data-claim-list]')).toBeNull();
  });

  it('opens and closes on a press, for touch and the keyboard', () => {
    const { container } = renderCounter([said('a', 1_000)], 30_000);
    const button = container.querySelector('[data-claim-count]') as HTMLElement;
    fireEvent.click(button);
    expect(container.querySelector('[data-claim-list]')).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(button);
    expect(container.querySelector('[data-claim-list]')).toBeNull();
  });

  it('lists the claims newest nearest the counter, names the debater, and offers the Claims panel', () => {
    const onSeeAll = vi.fn();
    const { container, getByText } = renderCounter([said('a', 1_000), said('b', 2_000)], 30_000, onSeeAll);
    fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);

    // Newest first in the document; the list lays out bottom-up, so it sits nearest the counter.
    const cards = [...container.querySelectorAll('[data-claim-list-card]')].map(card =>
      card.getAttribute('data-claim-list-card')
    );
    expect(cards).toEqual(['b', 'a']);
    expect(container.querySelector('[data-claim-list]')?.textContent).toContain('Preston’s claims · 2');

    fireEvent.click(getByText('See all'));
    expect(onSeeAll).toHaveBeenCalledOnce();
  });

  it('shows the share who agree only once a claim has votes', () => {
    mocks.percent.set('b', 64);
    const { container } = renderCounter([said('a', 1_000), said('b', 2_000)], 30_000);
    fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);

    const card = (id: string) => container.querySelector(`[data-claim-list-card="${id}"]`) as HTMLElement;
    expect(card('b').textContent).toContain('64%');
    expect(card('a').textContent).not.toContain('%');
  });

  it('tints the newest claim for a few seconds after its +1', () => {
    const { container } = renderCounter([said('a', 1_000), said('b', 20_000)], 21_000);
    fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);
    expect(container.querySelector('[data-claim-list-card="b"]')?.hasAttribute('data-fresh')).toBe(true);
    expect(container.querySelector('[data-claim-list-card="a"]')?.hasAttribute('data-fresh')).toBe(false);
  });

  it('votes from the list', () => {
    const { container } = renderCounter([said('a', 1_000)], 30_000);
    fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);
    fireEvent.click(container.querySelector('[aria-label="Agree"]') as HTMLElement);
    expect(mocks.respond).toHaveBeenCalledWith(true);
  });

  // Copilot, #2843: "Hide them" on a list the pointer had opened pinned it open instead.
  it('closes a hover-opened list from its own button, and keeps it shut until the pointer leaves', () => {
    const { container } = renderCounter([said('a', 1_000)], 30_000);
    const button = container.querySelector('[data-claim-count]') as HTMLElement;
    hover(counter(container));
    act(() => vi.advanceTimersByTime(200));
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(button);
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('[data-claim-list]')).toBeNull();

    leave(counter(container));
    act(() => vi.advanceTimersByTime(300));
    hover(counter(container));
    act(() => vi.advanceTimersByTime(200));
    expect(container.querySelector('[data-claim-list]')).not.toBeNull();
  });

  it('lets a mouse that clicked it open close it by leaving', () => {
    const { container } = renderCounter([said('a', 1_000)], 30_000);
    hover(counter(container));
    fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);
    expect(container.querySelector('[data-claim-list]')).not.toBeNull();
    leave(counter(container));
    act(() => vi.advanceTimersByTime(300));
    expect(container.querySelector('[data-claim-list]')).toBeNull();
  });

  // Copilot, #2843: a keyboard user on a vote button lost their place when the pointer left and the
  // list closed under them.
  it('stays open while the keyboard is inside it, and closes once focus leaves', () => {
    const onActiveChange = vi.fn();
    const { container } = render(
      <div>
        <DebateClaimCounter
          history={[said('a', 1_000)]}
          playheadMs={30_000}
          name="Preston"
          rowsByClaimId={new Map()}
          entitiesByClaimId={new Map()}
          onAnswered={() => {}}
          onActiveChange={onActiveChange}
        />
        <button type="button" data-testid="elsewhere" />
      </div>
    );
    hover(counter(container));
    act(() => vi.advanceTimersByTime(200));
    const agree = container.querySelector('[aria-label="Agree"]') as HTMLElement;
    fireEvent.focus(agree);
    leave(counter(container));
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('[data-claim-list]')).not.toBeNull();
    expect(onActiveChange).toHaveBeenLastCalledWith(true);

    fireEvent.blur(agree, { relatedTarget: container.querySelector('[data-testid="elsewhere"]') });
    expect(container.querySelector('[data-claim-list]')).toBeNull();
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  it('does not hold open for focus a mouse press gave it', () => {
    const { container } = renderCounter([said('a', 1_000)], 30_000);
    hover(counter(container));
    act(() => vi.advanceTimersByTime(200));
    const agree = container.querySelector('[aria-label="Agree"]') as HTMLElement;
    fireEvent.pointerDown(agree);
    fireEvent.focus(agree);
    fireEvent.pointerUp(agree);
    leave(counter(container));
    act(() => vi.advanceTimersByTime(300));
    expect(container.querySelector('[data-claim-list]')).toBeNull();
  });

  // Copilot, #2843: content shown on hover must close with Escape, without moving the pointer.
  it('closes on Escape, stays closed while the pointer rests, and keeps a keyboard user on the counter', () => {
    const { container } = renderCounter([said('a', 1_000)], 30_000);
    hover(counter(container));
    act(() => vi.advanceTimersByTime(200));
    const agree = container.querySelector('[aria-label="Agree"]') as HTMLElement;
    agree.focus();
    fireEvent.focus(agree);

    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('[data-claim-list]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[data-claim-count]'));
  });
});
