import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { type ComponentProps } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpenRoundPick } from './api';
import { OpenRoundPickCard, type OpenRoundPickContext } from './open-round-pick-card';

afterEach(cleanup);

function renderCard(props: Partial<ComponentProps<typeof OpenRoundPickCard>> = {}) {
  const onPick = vi
    .fn<(pick: OpenRoundPick, context: OpenRoundPickContext) => Promise<unknown>>()
    .mockResolvedValue(undefined);
  const allProps: ComponentProps<typeof OpenRoundPickCard> = {
    roundIndex: 0,
    savedPick: null,
    rebuttalTurnMs: 45_000,
    remainingSeconds: 8,
    onPick,
    localReconnecting: false,
    reconnectingOpponentName: null,
    ...props,
  };
  const view = render(<OpenRoundPickCard {...allProps} />);
  return { ...view, onPick: allProps.onPick as typeof onPick, props: allProps };
}

const extend = () => screen.getByRole('button', { name: /Extend/ });
const end = () => screen.getByRole('button', { name: /End/ });

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('OpenRoundPickCard (GEO-3178)', () => {
  it('asks to keep debating with Extend, End and the seconds left, and no instruction line (GEO-3315)', () => {
    const view = renderCard({ roundIndex: 1, remainingSeconds: 8 });

    expect(screen.getByRole('region', { name: 'Keep debating?' })).toBeInTheDocument();
    expect(view.container.querySelectorAll('p:not(:empty)')).toHaveLength(0);
    expect(extend()).toHaveAccessibleName(/\+45s each/);
    expect(end()).toHaveAccessibleName(/Finish here/);
    expect(extend()).toHaveAttribute('aria-pressed', 'false');
    expect(end()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('8 seconds to pick')).toBeInTheDocument();
  });

  it('saves a pick, shows it at once, and lets the debater change it', async () => {
    const view = renderCard();

    fireEvent.click(extend());
    expect(view.onPick).toHaveBeenLastCalledWith('extend', expect.objectContaining({ previousPick: null }));
    expect(extend()).toHaveAttribute('aria-pressed', 'true');
    // The pick turns white with a check, the other dims, and the question stays.
    expect(extend()).toHaveClass('bg-white', 'text-[#111]');
    expect(extend()).toHaveTextContent('✓ Extend');
    expect(end()).toHaveClass('opacity-40');
    expect(screen.getByRole('heading', { name: 'Keep debating?' })).toBeInTheDocument();

    await act(async () => undefined);
    view.rerender(<OpenRoundPickCard {...view.props} savedPick="extend" />);
    expect(extend()).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(end());
    expect(view.onPick).toHaveBeenLastCalledWith('end', expect.objectContaining({ previousPick: 'extend' }));
    expect(end()).toHaveAttribute('aria-pressed', 'true');
    expect(end()).toHaveClass('bg-white', 'text-[#111]');
    expect(extend()).toHaveClass('opacity-40', 'bg-black/66');
    expect(extend()).toHaveAttribute('aria-pressed', 'false');
  });

  it('tells the room how long the card was open when the pick was tapped (GEO-3182)', () => {
    vi.useFakeTimers({ now: 1_000 });
    try {
      const view = renderCard();
      vi.setSystemTime(4_250);
      fireEvent.click(end());
      expect(view.onPick).toHaveBeenLastCalledWith('end', { previousPick: null, msSinceCardOpened: 3_250 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not save the pick it already holds again', () => {
    const view = renderCard({ savedPick: 'end' });

    fireEvent.click(end());
    expect(view.onPick).not.toHaveBeenCalled();
  });

  it('keeps a successful pick checked while props and polling still contain the previous value', async () => {
    const view = renderCard();
    fireEvent.click(extend());
    await act(async () => undefined);

    expect(extend()).toHaveAttribute('aria-pressed', 'true');
    view.rerender(<OpenRoundPickCard {...view.props} remainingSeconds={7} savedPick={null} />);
    expect(extend()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(extend());
    expect(view.onPick).toHaveBeenCalledTimes(1);

    view.rerender(<OpenRoundPickCard {...view.props} savedPick="extend" />);
    view.rerender(<OpenRoundPickCard {...view.props} savedPick={null} remainingSeconds={6} />);
    expect(extend()).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the latest successful switch selected when an older pick arrives in props', async () => {
    const view = renderCard();
    fireEvent.click(extend());
    await act(async () => undefined);
    fireEvent.click(end());
    await act(async () => undefined);

    view.rerender(<OpenRoundPickCard {...view.props} savedPick="extend" />);
    expect(end()).toHaveAttribute('aria-pressed', 'true');
    expect(extend()).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not acknowledge a pick that missed the decision deadline', async () => {
    const view = renderCard();
    view.onPick.mockResolvedValueOnce(null);
    fireEvent.click(extend());
    await act(async () => undefined);

    expect(extend()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('starts a new round without carrying over the last round’s acknowledged pick', async () => {
    const view = renderCard();
    fireEvent.click(extend());
    await act(async () => undefined);
    expect(extend()).toHaveAttribute('aria-pressed', 'true');

    view.rerender(<OpenRoundPickCard {...view.props} key={1} roundIndex={1} savedPick={null} />);
    expect(extend()).toHaveAttribute('aria-pressed', 'false');
    expect(end()).toHaveAttribute('aria-pressed', 'false');
  });

  it('restores the last acknowledged pick after a failed switch even before polling catches up', async () => {
    const view = renderCard();
    fireEvent.click(extend());
    await act(async () => undefined);
    view.onPick.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(end());
    await act(async () => undefined);

    expect(extend()).toHaveAttribute('aria-pressed', 'true');
    expect(end()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save your pick. Tap again.");
  });

  it('puts the selection back to the saved pick and asks for another tap when a save fails', async () => {
    const view = renderCard({ savedPick: 'extend' });
    view.onPick.mockRejectedValueOnce(new Error('offline'));

    fireEvent.click(end());
    expect(end()).toHaveAttribute('aria-pressed', 'true');
    await act(async () => undefined);

    expect(extend()).toHaveAttribute('aria-pressed', 'true');
    expect(end()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save your pick. Tap again.");

    fireEvent.click(end());
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    expect(view.onPick).toHaveBeenCalledTimes(2);
  });

  it('lets only the latest tap settle the card when an earlier save answers late', async () => {
    const view = renderCard();
    const first = deferred();
    view.onPick.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);

    fireEvent.click(extend());
    fireEvent.click(end());
    await act(async () => undefined);
    view.rerender(<OpenRoundPickCard {...view.props} savedPick="end" />);

    await act(async () => first.reject(new Error('late')));
    expect(end()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('says when this debater is reconnecting, keeps their saved pick and stops new ones', () => {
    const view = renderCard({ savedPick: 'extend', localReconnecting: true });

    expect(screen.getByRole('status')).toHaveTextContent("You're reconnecting. Your saved pick still counts.");
    expect(extend()).toHaveAttribute('aria-pressed', 'true');
    expect(end()).toBeDisabled();
    fireEvent.click(end());
    expect(view.onPick).not.toHaveBeenCalled();
  });

  it('says when the other debater is reconnecting, without saying anything about their pick', () => {
    renderCard({ reconnectingOpponentName: 'Bob' });

    expect(screen.getByRole('status')).toHaveTextContent('Bob is reconnecting. Their last saved pick still counts.');
    expect(extend()).toBeEnabled();
  });

  it('stops taking picks once the window has run out', () => {
    renderCard({ remainingSeconds: 0 });

    expect(extend()).toBeDisabled();
    expect(end()).toBeDisabled();
  });
});
