import { act, cleanup, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useFeedPlayingCard } from './feed-playing-card';

// The viewport is 844 tall under a 44px navbar, so its middle is at 444.
const MIDDLE = 444;

/** A card whose centre sits `offset` px below the middle of the screen. */
function Card({ id, offset, candidate }: { id: string; offset: number; candidate: boolean }) {
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  if (element) {
    element.getBoundingClientRect = () =>
      ({ top: MIDDLE + offset - 100, height: 200, bottom: MIDDLE + offset + 100 }) as DOMRect;
  }
  const playing = useFeedPlayingCard(id, element, candidate);
  return <div ref={setElement} data-testid={id} data-playing={String(playing)} />;
}

const playing = (id: string) => screen.getByTestId(id).getAttribute('data-playing');

function scrollTo(next: React.ReactElement, rerender: (ui: React.ReactElement) => void) {
  rerender(next);
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  // Run the scroll handler's frame at once.
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  };
});

afterEach(cleanup);

describe('useFeedPlayingCard', () => {
  it('plays only the candidate nearest the middle of the screen when two qualify', () => {
    render(
      <>
        <Card id="leaving" offset={-300} candidate />
        <Card id="arriving" offset={120} candidate />
      </>
    );
    expect(playing('arriving')).toBe('true');
    expect(playing('leaving')).toBe('false');
  });

  it('plays a lone candidate wherever it is, and nothing that is not one', () => {
    render(
      <>
        <Card id="only" offset={-300} candidate />
        <Card id="out" offset={0} candidate={false} />
      </>
    );
    expect(playing('only')).toBe('true');
    expect(playing('out')).toBe('false');
  });

  it('hands playback over as the scroll brings the next card to the middle', () => {
    const { rerender } = render(
      <>
        <Card id="first" offset={0} candidate />
        <Card id="second" offset={500} candidate />
      </>
    );
    expect(playing('first')).toBe('true');

    scrollTo(
      <>
        <Card id="first" offset={-420} candidate />
        <Card id="second" offset={80} candidate />
      </>,
      rerender
    );
    expect(playing('second')).toBe('true');
    expect(playing('first')).toBe('false');
  });

  it('keeps the current card while the other is only slightly nearer the middle', () => {
    const { rerender } = render(
      <>
        <Card id="first" offset={0} candidate />
        <Card id="second" offset={500} candidate />
      </>
    );
    scrollTo(
      <>
        <Card id="first" offset={-250} candidate />
        <Card id="second" offset={240} candidate />
      </>,
      rerender
    );
    expect(playing('first')).toBe('true');
    expect(playing('second')).toBe('false');
  });

  it('passes playback to the other candidate the moment the playing card stops being one', () => {
    const { rerender } = render(
      <>
        <Card id="first" offset={0} candidate />
        <Card id="second" offset={300} candidate />
      </>
    );
    expect(playing('first')).toBe('true');
    rerender(
      <>
        <Card id="first" offset={0} candidate={false} />
        <Card id="second" offset={300} candidate />
      </>
    );
    expect(playing('first')).toBe('false');
    expect(playing('second')).toBe('true');
  });

  it('lets go when the playing card unmounts', () => {
    const { rerender } = render(
      <>
        <Card id="first" offset={0} candidate />
        <Card id="second" offset={300} candidate />
      </>
    );
    rerender(<Card id="second" offset={300} candidate />);
    expect(playing('second')).toBe('true');
  });
});
