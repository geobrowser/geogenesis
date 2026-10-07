import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { type ComponentProps } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpenRoundPick } from './api';
import { OpenRoundPickCard } from './open-round-pick-card';

afterEach(cleanup);

function renderCard(props: Partial<ComponentProps<typeof OpenRoundPickCard>> = {}) {
  const onPick = vi.fn<(pick: OpenRoundPick) => Promise<unknown>>().mockResolvedValue(undefined);
  const allProps: ComponentProps<typeof OpenRoundPickCard> = {
    roundIndex: 0,
    savedPick: null,
    rebuttalTurnMs: 45_000,
    remainingSeconds: 8,
    progress: 0.2,
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
  it('asks to keep debating with Extend, End and the seconds left', () => {
    renderCard({ roundIndex: 1, remainingSeconds: 8 });

    expect(screen.getByRole('region', { name: 'Keep debating?' })).toBeInTheDocument();
    expect(screen.getByText('Pick in secret. Two Extends unlock Round 2.')).toBeInTheDocument();
    expect(extend()).toHaveAccessibleName(/\+45 s each/);
    expect(end()).toHaveAccessibleName(/Ends here/);
    expect(extend()).toHaveAttribute('aria-pressed', 'false');
    expect(end()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('8 seconds to pick')).toBeInTheDocument();
  });

  it('saves a pick, shows it at once, and lets the debater change it', async () => {
    const view = renderCard();

    fireEvent.click(extend());
    expect(view.onPick).toHaveBeenLastCalledWith('extend');
    expect(extend()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Locked in' })).toBeInTheDocument();
    expect(screen.getByText('You can change it until the reveal.')).toBeInTheDocument();

    await act(async () => undefined);
    view.rerender(<OpenRoundPickCard {...view.props} savedPick="extend" />);
    expect(extend()).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(end());
    expect(view.onPick).toHaveBeenLastCalledWith('end');
    expect(end()).toHaveAttribute('aria-pressed', 'true');
    expect(extend()).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not save the pick it already holds again', () => {
    const view = renderCard({ savedPick: 'end' });

    fireEvent.click(end());
    expect(view.onPick).not.toHaveBeenCalled();
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
    renderCard({ remainingSeconds: 0, progress: 1 });

    expect(extend()).toBeDisabled();
    expect(end()).toBeDisabled();
  });
});
