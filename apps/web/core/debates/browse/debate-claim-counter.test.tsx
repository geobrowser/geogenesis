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

const renderCounter = (history: StackedCard[]) =>
  render(
    <DebateClaimCounter
      history={history}
      name="Preston"
      speaker={{
        user_id: 'user-1',
        profile_space_id: 'profile-1',
        display_name: 'Preston Mantel',
        avatar_cid: null,
        participant_slot: 1,
        position: true,
        position_label: 'Agree',
        joined_at: null,
        ready_at: null,
      }}
      rowsByClaimId={new Map()}
      entitiesByClaimId={new Map()}
      onAnswered={() => {}}
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
    const { container } = renderCounter([]);
    expect(container.querySelector('[data-claim-count]')?.getAttribute('data-claim-count')).toBe('0');

    hover(counter(container));
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('[data-claim-list]')).toBeNull();
  });

  it('never shows a claim’s text unless asked', () => {
    const { container } = renderCounter([said('a', 1_000, 'Whoever asks should plan the date')]);
    expect(container.textContent).not.toContain('Whoever asks');
  });

  it('increments in place without a +1 or animation, and follows history when seeking back', () => {
    const props = { name: 'Preston', rowsByClaimId: new Map(), entitiesByClaimId: new Map(), onAnswered: () => {} };
    const view = render(<DebateClaimCounter {...props} history={[]} />);
    const button = view.container.querySelector('[data-claim-count]');
    view.rerender(<DebateClaimCounter {...props} history={[said('a', 10_000)]} />);
    expect(button?.getAttribute('data-claim-count')).toBe('1');
    expect(view.container.querySelector('[data-claim-count]')).toBe(button);
    expect(view.container.innerHTML).not.toMatch(/animate-|plus-one|purple/);
    view.rerender(<DebateClaimCounter {...props} history={[]} />);
    expect(button?.getAttribute('data-claim-count')).toBe('0');
  });

  it('opens after a moment on the counter, holds while the pointer crosses into the list, closes after it leaves', () => {
    const { container } = renderCounter([said('a', 1_000), said('b', 2_000)]);
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
    const { container } = renderCounter([said('a', 1_000)]);
    const button = container.querySelector('[data-claim-count]') as HTMLElement;
    fireEvent.click(button);
    expect(container.querySelector('[data-claim-list]')).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(button);
    expect(container.querySelector('[data-claim-list]')).toBeNull();
  });

  it('lists only the claim cards, newest nearest the counter, without a heading or See all', () => {
    const { container } = renderCounter([said('a', 1_000), said('b', 2_000)]);
    fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);

    // Newest first in the document; the list lays out bottom-up, so it sits nearest the counter.
    const cards = [...container.querySelectorAll('[data-claim-list-card]')].map(card =>
      card.getAttribute('data-claim-list-card')
    );
    expect(cards).toEqual(['b', 'a']);
    expect(container.querySelector('[data-claim-list]')?.textContent).not.toContain('Preston’s claims');
    expect(container.querySelector('[data-claim-list]')?.textContent).not.toContain('See all');
  });

  it('shows the share who agree only once a claim has votes', () => {
    mocks.percent.set('b', 64);
    const { container } = renderCounter([said('a', 1_000), said('b', 2_000)]);
    fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);

    const card = (id: string) => container.querySelector(`[data-claim-list-card="${id}"]`) as HTMLElement;
    const header = card('b').querySelector('[data-claim-list-header]');
    expect(header?.textContent).toContain('Preston Mantel');
    expect(header?.textContent).toContain('64% agree');
    expect(header?.querySelectorAll('button')).toHaveLength(2);
    expect(header?.textContent).not.toContain('Claim b');
    expect(card('b').lastElementChild?.textContent).toBe('Claim b');
    expect(card('a').textContent).not.toContain('%');
  });

  it('keeps every claim on dark glass, including the newest', () => {
    const { container } = renderCounter([said('a', 1_000), said('b', 20_000)]);
    fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);
    const cards = [...container.querySelectorAll('[data-claim-list-card]')];
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.className).toContain('bg-[#151515]/55');
      expect(card.className).toContain('backdrop-blur');
    }
    expect(container.innerHTML).not.toContain('purple');
  });

  it('votes from the list', () => {
    const { container } = renderCounter([said('a', 1_000)]);
    fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);
    fireEvent.click(container.querySelector('[aria-label="Agree"]') as HTMLElement);
    expect(mocks.respond).toHaveBeenCalledWith(true);
    fireEvent.click(container.querySelector('[aria-label="Disagree"]') as HTMLElement);
    expect(mocks.respond).toHaveBeenLastCalledWith(false);
  });

  // Copilot, #2843: "Hide them" on a list the pointer had opened pinned it open instead.
  it('closes a hover-opened list from its own button, and keeps it shut until the pointer leaves', () => {
    const { container } = renderCounter([said('a', 1_000)]);
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
    const { container } = renderCounter([said('a', 1_000)]);
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
    const { container } = renderCounter([said('a', 1_000)]);
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
    const { container } = renderCounter([said('a', 1_000)]);
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

  // Copilot, #2843: a mask on the scroll box is a backdrop root, so the cards' blur stopped seeing
  // the video. The fade is on the cards now, each with its own slice of it.
  it('fades the top of a long list card by card, never on the box that scrolls', () => {
    const rects = new Map<string, number>([
      ['list', 100],
      ['c', 95],
      ['b', 140],
      ['a', 185],
    ]);
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const key =
        this.getAttribute('data-claim-list-card') ??
        (this.firstElementChild?.hasAttribute('data-claim-list-card') ? 'list' : '');
      return { top: rects.get(key) ?? 0 } as DOMRect;
    });
    // Cards 40px tall in a 300px-wide list: a 6cqw ramp at 76cqw wide is about 24px.
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    try {
      const { container } = renderCounter([said('a', 1_000), said('b', 2_000), said('c', 3_000)]);
      fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);
      const card = (id: string) => container.querySelector(`[data-claim-list-card="${id}"]`) as HTMLElement;
      const box = card('c').parentElement as HTMLElement;

      expect(box.className).not.toContain('mask-image');
      expect(card('c').className).toContain('mask-image:var(--claim-ramp');
      // The card crossing the top edge carries the ramp; ones well below it carry none.
      expect(card('c').style.getPropertyValue('--claim-ramp')).toContain('linear-gradient');
      expect(card('a').style.getPropertyValue('--claim-ramp')).toBe('none');
    } finally {
      spy.mockRestore();
      height.mockRestore();
      width.mockRestore();
    }
  });

  // Copilot, #2843: a press dragged off the counter and released outside left it thinking a press
  // was still happening, so later keyboard focus no longer held the list open.
  it('still holds open for the keyboard after a press released outside', () => {
    const { container } = renderCounter([said('a', 1_000)]);
    hover(counter(container));
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerDown(counter(container));
    leave(counter(container));

    hover(counter(container));
    act(() => vi.advanceTimersByTime(200));
    fireEvent.focus(container.querySelector('[aria-label="Agree"]') as HTMLElement);
    leave(counter(container));
    act(() => vi.advanceTimersByTime(500));
    expect(container.querySelector('[data-claim-list]')).not.toBeNull();
  });

  // Copilot, #2843: leaving after Hide let go of the dismissal while the hover was still running out
  // its close delay, so the closed list came back for that moment.
  it('stays closed as the pointer leaves after Hide', () => {
    const { container } = renderCounter([said('a', 1_000)]);
    hover(counter(container));
    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(container.querySelector('[data-claim-count]') as HTMLElement);
    expect(container.querySelector('[data-claim-list]')).toBeNull();

    leave(counter(container));
    expect(container.querySelector('[data-claim-list]')).toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(container.querySelector('[data-claim-list]')).toBeNull();
  });
});
