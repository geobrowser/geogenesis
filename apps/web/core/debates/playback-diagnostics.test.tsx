import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybackDiagnostics } from './playback-diagnostics';

/*
 * `usePlaybackDiagnosticsEnabled` is mocked rather than `useFeatureFlag`: the component calls the
 * former, and the former calls the latter through the module's own binding, which a mocked export
 * does not intercept.
 */
vi.mock('~/core/state/feature-flags', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/state/feature-flags')>()),
  usePlaybackDiagnosticsEnabled: () => true,
}));

/**
 * jsdom lays nothing out, so every element measures 0×0 and would read as off screen. Sizes are
 * assigned per element instead, which is also the only way to place one deliberately out of view.
 */
function placeAt(element: Element, box: { top: number; left: number; width: number; height: number }) {
  element.getBoundingClientRect = () =>
    ({
      top: box.top,
      left: box.left,
      right: box.left + box.width,
      bottom: box.top + box.height,
      width: box.width,
      height: box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

const ON_SCREEN = { top: 10, left: 0, width: 300, height: 200 };
const OFF_TO_THE_SIDE = { top: 10, left: 5_000, width: 300, height: 200 };

/** A debate card as `DebateFeedPlayer` publishes it: the state attributes, with its videos inside. */
function debateCard(state: { playing: boolean; blocked: boolean }) {
  const card = document.createElement('div');
  card.setAttribute('data-debate-ready', 'true');
  card.setAttribute('data-debate-active', 'true');
  card.setAttribute('data-debate-playing', String(state.playing));
  card.setAttribute('data-debate-autoplay-blocked', String(state.blocked));
  placeAt(card, ON_SCREEN);

  const video = document.createElement('video');
  placeAt(video, ON_SCREEN);
  card.append(video);

  return { card, video };
}

/**
 * jsdom has no media stack, so `play()` is unimplemented there. This stands in with the rejection
 * a refusing browser gives — and it has to be installed before the first render, because the
 * diagnostic patches the prototype once and captures whatever `play` it finds at that moment.
 */
const originalPlay = HTMLMediaElement.prototype.play;

beforeAll(() => {
  HTMLMediaElement.prototype.play = () =>
    Promise.reject(new DOMException('not allowed by the user agent', 'NotAllowedError'));
});

afterAll(() => {
  HTMLMediaElement.prototype.play = originalPlay;
});

beforeEach(() => {
  window.innerWidth = 400;
  window.innerHeight = 800;
});

afterEach(() => {
  cleanup();
  // The cards are appended to the body rather than rendered, so `cleanup` does not reach them.
  document.querySelectorAll('[data-debate-ready], video').forEach(node => node.remove());
});

describe('PlaybackDiagnostics', () => {
  /**
   * The readout's whole purpose is pairing a card's conclusion with what its videos did, and it
   * used to build those as two independent lists lined up by position. Explore opens with a hero
   * carousel above the feed, so the video described beside `card0` was regularly one the card had
   * never touched — a wrong measurement in the instrument built to stop wrong measurements.
   */
  it('describes only the videos inside a debate card, never unrelated media', () => {
    const stray = document.createElement('video');
    placeAt(stray, ON_SCREEN);
    // First in document order, which is exactly where the hero carousel sits.
    document.body.append(stray);

    const { card } = debateCard({ playing: false, blocked: true });
    document.body.append(card);

    render(<PlaybackDiagnostics />);

    // The card's own video is described, and attributed to the card by name rather than by index.
    expect(screen.getByText(/card0\.v0/)).toBeInTheDocument();
    // The stray is counted, so it cannot be silently dropped, but never described as a card's.
    expect(screen.getByText(/1 other video\(s\) on screen, outside any debate card/)).toBeInTheDocument();
    expect(screen.queryByText(/^\s*v0 ·/)).not.toBeInTheDocument();
  });

  /** Two cards on screen keep their own videos rather than sharing one numbering. */
  it('keeps each card with its own video', () => {
    const first = debateCard({ playing: true, blocked: false });
    const second = debateCard({ playing: false, blocked: true });
    document.body.append(first.card, second.card);

    render(<PlaybackDiagnostics />);

    expect(screen.getByText(/card0 · ready=true.*playing=true.*blocked=false/)).toBeInTheDocument();
    expect(screen.getByText(/card1 · ready=true.*playing=false.*blocked=true/)).toBeInTheDocument();
    expect(screen.getByText(/card0\.v0/)).toBeInTheDocument();
    expect(screen.getByText(/card1\.v0/)).toBeInTheDocument();
  });

  /**
   * Visibility is tested on both axes. A vertical-only test counts a card scrolled out sideways
   * in a horizontal row as on screen, which is how an earlier round of this investigation came to
   * believe twelve videos were playing at once and spent a day on a decoder limit never reached.
   */
  it('does not count a card scrolled out sideways as on screen', () => {
    const { card, video } = debateCard({ playing: false, blocked: false });
    placeAt(card, OFF_TO_THE_SIDE);
    placeAt(video, OFF_TO_THE_SIDE);
    document.body.append(card);

    render(<PlaybackDiagnostics />);

    expect(screen.getByText('no debate player on screen')).toBeInTheDocument();
  });

  /**
   * The line that identified GEO-2978: a card claiming to be playing over a `play()` the browser
   * refused. Reporting how the call settled, and not only what `paused` says, is the whole reason
   * the readout could tell a refusal apart from a card nothing ever asked to play.
   */
  it('records how each play() settled against the element it happened to', async () => {
    const { card, video } = debateCard({ playing: true, blocked: false });
    document.body.append(card);

    render(<PlaybackDiagnostics />);

    await video.play().catch(() => {});

    await waitFor(() => expect(screen.getByText(/calls=\[.*REJECTED:NotAllowedError/)).toBeInTheDocument(), {
      timeout: 3_000,
    });
  });
});
