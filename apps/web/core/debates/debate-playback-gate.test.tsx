import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import { DebateFeedAutoplay, tappedDebateAtom, useDebateCardPlayback } from './debate-playback-gate';

/** A card's view of the gate: whether it may play, and its own tap. */
function Probe({ id, owner }: { id: string; owner: string }) {
  const { tapToPlay, allowed, tap, reclaim } = useDebateCardPlayback(id, owner);
  // A feed card's click takes playback back; any other card's takes the tap.
  return (
    <button type="button" data-testid={owner} onClick={tapToPlay ? tap : reclaim}>
      {allowed ? 'allowed' : 'held'}
    </button>
  );
}

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function renderWith(children: React.ReactNode) {
  const store = createStore();
  const view = render(<Provider store={store}>{children}</Provider>);
  return { store, ...view };
}

describe('debate playback gate', () => {
  afterEach(cleanup);

  it('holds a card outside a feed until it is tapped, then lets only that card play', () => {
    renderWith(
      <>
        <Probe id={A} owner="profile" />
        <Probe id={B} owner="claim" />
      </>
    );
    expect(screen.getByTestId('profile')).toHaveTextContent('held');
    expect(screen.getByTestId('claim')).toHaveTextContent('held');

    fireEvent.click(screen.getByTestId('profile'));
    expect(screen.getByTestId('profile')).toHaveTextContent('allowed');
    expect(screen.getByTestId('claim')).toHaveTextContent('held');

    // A second tap anywhere moves it: one debate at a time, app-wide.
    fireEvent.click(screen.getByTestId('claim'));
    expect(screen.getByTestId('profile')).toHaveTextContent('held');
    expect(screen.getByTestId('claim')).toHaveTextContent('allowed');
  });

  it('plays the same debate only on the card it was tapped on', () => {
    renderWith(
      <>
        <Probe id={A} owner="debates-tab" />
        <Probe id={A} owner="activity-gallery" />
      </>
    );
    fireEvent.click(screen.getByTestId('activity-gallery'));

    expect(screen.getByTestId('activity-gallery')).toHaveTextContent('allowed');
    expect(screen.getByTestId('debates-tab')).toHaveTextContent('held');
  });

  it('lets feed cards play until a debate is tapped elsewhere, and again once it is let go', () => {
    const { store } = renderWith(
      <>
        <DebateFeedAutoplay>
          <Probe id={A} owner="feed" />
        </DebateFeedAutoplay>
        <Probe id={B} owner="side-panel" />
      </>
    );
    expect(screen.getByTestId('feed')).toHaveTextContent('allowed');

    fireEvent.click(screen.getByTestId('side-panel'));
    expect(screen.getByTestId('feed')).toHaveTextContent('held');

    act(() => store.set(tappedDebateAtom, null));
    expect(screen.getByTestId('feed')).toHaveTextContent('allowed');
  });

  it('lets a feed card take playback back from a debate tapped outside the feed', () => {
    const { store } = renderWith(
      <>
        <DebateFeedAutoplay>
          <Probe id={A} owner="feed" />
        </DebateFeedAutoplay>
        <Probe id={B} owner="side-panel" />
      </>
    );
    fireEvent.click(screen.getByTestId('side-panel'));
    expect(screen.getByTestId('feed')).toHaveTextContent('held');

    fireEvent.click(screen.getByTestId('feed'));
    expect(screen.getByTestId('feed')).toHaveTextContent('allowed');
    expect(screen.getByTestId('side-panel')).toHaveTextContent('held');
    expect(store.get(tappedDebateAtom)).toBeNull();
  });

  it('gives the tap up when the card that took it unmounts, so a remount there does not play', () => {
    function Toggle() {
      const [shown, setShown] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setShown(value => !value)}>
            toggle
          </button>
          {/* The same owner on the way back, as React's `useId` gives a card remounted in place. */}
          {shown ? <Probe id={A} owner="card" /> : null}
        </>
      );
    }
    const { store } = renderWith(<Toggle />);
    fireEvent.click(screen.getByTestId('card'));
    expect(store.get(tappedDebateAtom)).toEqual({ debateId: A, owner: 'card' });

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(store.get(tappedDebateAtom)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('card')).toHaveTextContent('held');
  });

  it('does not give up another card’s tap when an untapped card unmounts', () => {
    function Toggle() {
      const [shown, setShown] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setShown(false)}>
            hide
          </button>
          <Probe id={A} owner="tapped" />
          {shown ? <Probe id={B} owner="other" /> : null}
        </>
      );
    }
    const { store } = renderWith(<Toggle />);
    fireEvent.click(screen.getByTestId('tapped'));
    fireEvent.click(screen.getByRole('button', { name: 'hide' }));

    expect(store.get(tappedDebateAtom)).toEqual({ debateId: A, owner: 'tapped' });
  });

  it('matches ids however they are spelled', () => {
    // A card's id comes from the entity, without dashes; the player's from geo-chat, with them.
    const { store } = renderWith(<Probe id={A} owner="card" />);
    act(() => store.set(tappedDebateAtom, { debateId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', owner: 'card' }));

    expect(screen.getByTestId('card')).toHaveTextContent('allowed');
  });
});
