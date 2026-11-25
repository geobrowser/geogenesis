import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionContextProvider } from '~/core/action-context-provider';
import { isGestureVideoUnlocked, resetGestureVideoPoolForTests } from '~/core/utils/video/gesture-media-pool';

import type { Debate } from '../api';
import type { DebateMoment } from './debate-moments';
import { MomentsCardPlayer, type MomentsCardPlayerProps } from './moments-card-player';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  push: vi.fn(),
  markDebateWatched: vi.fn(),
  setMuted: vi.fn(),
  sound: { muted: true, muteChosen: false },
  pooled: false,
  /** What the next `play()` does: start, or be refused by the autoplay policy. */
  refuse: false,
  play: vi.fn(function (this: HTMLMediaElement) {
    if (mocks.refuse) return Promise.reject(Object.assign(new Error('refused'), { name: 'NotAllowedError' }));
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }),
  pause: vi.fn(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    this.dispatchEvent(new Event('pause'));
  }),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));
vi.mock('~/core/marketing-events', () => ({ WATCH_DEBATE_MS: 30_000, pushMarketingEvent: mocks.push }));
vi.mock('../watched-debates', () => ({ markDebateWatched: mocks.markDebateWatched }));
vi.mock('../use-debate-playback', () => ({
  useFeedSoundPreference: () => ({ ...mocks.sound, setMuted: mocks.setMuted }),
}));
vi.mock('../participant-bylines', () => ({ useParticipantBylines: () => new Map() }));
vi.mock('../browse/use-open-debater-profile', () => ({ useOpenDebaterProfile: () => () => {} }));
vi.mock('~/core/follows/follow-button', () => ({ FollowButton: () => null }));
vi.mock('~/design-system/avatar', () => ({ Avatar: () => null }));
vi.mock('~/core/utils/video/gesture-media-pool', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/utils/video/gesture-media-pool')>()),
  gestureUnlocksEachMediaElement: () => mocks.pooled,
}));

const DEBATE_ID = 'fd51f935-2063-4617-8039-7b672b23364c';

const MOMENTS: DebateMoment[] = [0, 1, 2].map(i => ({
  id: `clip-${i}`,
  momentIndex: i,
  claimIndex: i,
  claimText: null,
  participantSlot: (i % 2) + 1,
  clipUrl: `https://chat.test/debates/${DEBATE_ID}/moments/clip-${i}/content`,
  durationMs: 10_000,
  debateStartMs: 20_000 + i * 60_000,
  debateEndMs: 30_000 + i * 60_000,
  cutStartMs: 19_750 + i * 60_000,
  cutEndMs: 30_250 + i * 60_000,
  captions: [{ startMs: 0, endMs: 4000, text: `Caption of moment ${i + 1}` }],
}));

const DEBATE = {
  id: DEBATE_ID,
  participants: [
    { participant_slot: 1, display_name: 'Ada', position: false, profile_space_id: 'a', position_label: 'Disagree' },
    { participant_slot: 2, display_name: 'Blaise', position: true, profile_space_id: 'b', position_label: 'Agree' },
  ],
} as unknown as Debate;

function renderPlayer(
  overrides: Partial<MomentsCardPlayerProps> = {},
  wrap: (node: React.ReactNode) => React.ReactNode = node => node
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props: MomentsCardPlayerProps = {
    debate: DEBATE,
    moments: MOMENTS,
    stills: { slot1: 'https://still/1.jpg', slot2: 'https://still/2.jpg' },
    topSlot: 1,
    active: true,
    mountMedia: true,
    upNext: false,
    tapToPlay: false,
    onShowFullDebate: () => {},
    ...overrides,
  };
  const ui = (next: Partial<MomentsCardPlayerProps> = {}) => (
    <QueryClientProvider client={client}>{wrap(<MomentsCardPlayer {...props} {...next} />)}</QueryClientProvider>
  );
  const result = render(ui());
  return { ...result, update: (next: Partial<MomentsCardPlayerProps>) => result.rerender(ui(next)) };
}

const slot = (n: 0 | 1) => screen.getByTestId(`moment-video-slot-${n}`);
const videoIn = (n: 0 | 1) => slot(n).querySelector('video') as HTMLVideoElement;

/** The element has decoded a frame and is playing at `seconds`. */
function playing(video: HTMLVideoElement, seconds = 1) {
  Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
  Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: seconds });
  fireEvent(video, new Event('loadeddata'));
  fireEvent(video, new Event('playing'));
  fireEvent.timeUpdate(video);
}

function ended(video: HTMLVideoElement) {
  Object.defineProperty(video, 'paused', { configurable: true, value: true });
  fireEvent(video, new Event('pause'));
  fireEvent(video, new Event('ended'));
}

const events = (name: string) =>
  mocks.capture.mock.calls.filter(([event]) => event === name).map(([, props]) => props as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sound = { muted: true, muteChosen: false };
  mocks.pooled = false;
  mocks.refuse = false;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(mocks.play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(mocks.pause);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  resetGestureVideoPoolForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MomentsCardPlayer', () => {
  it('plays the first moment muted on an active feed card, marked for the in-app fullscreen detector', () => {
    const { container } = renderPlayer();
    expect(container.querySelector('[data-debate-slot="1"]')).not.toBeNull();
    const first = videoIn(0);
    expect(first.getAttribute('src')).toBe(MOMENTS[0]!.clipUrl);
    expect(first.preload).toBe('auto');
    expect(first.muted).toBe(true);
    expect(mocks.play).toHaveBeenCalled();
    // The spare holds nothing until the first moment is showing.
    expect(videoIn(1).getAttribute('src')).toBeNull();
    expect(screen.getByRole('button', { name: 'Moment 1 of 3' })).toHaveAttribute('aria-current', 'true');
  });

  it('loads the next moment in the spare while one plays, and swaps on its first frame with the last frame held', () => {
    vi.useFakeTimers();
    renderPlayer();
    act(() => playing(videoIn(0)));
    expect(screen.queryByTestId('moments-poster')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(videoIn(1).getAttribute('src')).toBe(MOMENTS[1]!.clipUrl);
    expect(videoIn(1).preload).toBe('auto');

    mocks.play.mockClear();
    act(() => ended(videoIn(0)));
    // The next moment starts in the spare; until it has a frame the old one stays on top.
    expect(mocks.play.mock.contexts).toContain(videoIn(1));
    expect(slot(0).style.opacity).toBe('1');
    expect(slot(1).style.opacity).toBe('0');
    act(() => playing(videoIn(1)));
    expect(slot(1).style.opacity).toBe('1');
    expect(slot(0).style.opacity).toBe('0');
    // Both elements stay: the first still holds its clip, the reel never reloads into one element.
    expect(videoIn(0).getAttribute('src')).toBe(MOMENTS[0]!.clipUrl);
    expect(screen.getByRole('button', { name: 'Moment 2 of 3' })).toHaveAttribute('aria-current', 'true');
    expect(events('debate_moment_ended').map(event => [event.moment_id, event.end_reason])).toEqual([
      ['clip-0', 'completed'],
    ]);
  });

  it('steps with the outer thirds and pauses with the middle one', () => {
    renderPlayer();
    act(() => playing(videoIn(0)));
    fireEvent.click(screen.getByRole('button', { name: 'Next moment' }));
    expect(screen.getByRole('button', { name: 'Moment 2 of 3' })).toHaveAttribute('aria-current', 'true');
    expect(videoIn(1).getAttribute('src')).toBe(MOMENTS[1]!.clipUrl);
    fireEvent.click(screen.getByRole('button', { name: 'Previous moment' }));
    // Back to the element that still holds the first moment.
    expect(screen.getByRole('button', { name: 'Moment 1 of 3' })).toHaveAttribute('aria-current', 'true');
    act(() => playing(videoIn(0)));

    fireEvent.click(screen.getByRole('button', { name: 'Pause moment' }));
    expect(videoIn(0).paused).toBe(true);
    expect(screen.getByRole('button', { name: 'Play moment' })).toBeInTheDocument();
    expect(screen.getByTestId('play-indicator')).toBeInTheDocument();

    expect(events('debate_playback_control').map(event => [event.control, event.trigger, event.seek_kind])).toEqual([
      ['seek', 'manual', 'moment_next'],
      ['seek', 'manual', 'moment_previous'],
      ['pause', 'manual', undefined],
    ]);
    expect(events('debate_moment_ended').map(event => event.end_reason)).toEqual(['skipped', 'skipped']);
  });

  it('jumps to a moment from its bar', () => {
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Moment 3 of 3' }));
    expect(screen.getByRole('button', { name: 'Moment 3 of 3' })).toHaveAttribute('aria-current', 'true');
    expect(events('debate_playback_control')[0]).toMatchObject({ control: 'seek', seek_kind: 'moment_jump' });
  });

  it('rests on the last frame when the reel ends, marks the debate watched, and restarts from moment 1 on a tap', () => {
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Moment 3 of 3' }));
    const last = slot(0).getAttribute('data-moment-index') === '2' ? videoIn(0) : videoIn(1);
    act(() => playing(last));
    act(() => ended(last));
    expect(mocks.markDebateWatched).toHaveBeenCalledWith(DEBATE_ID);
    expect(screen.getByTestId('play-indicator')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play moment' }));
    expect(screen.getByRole('button', { name: 'Moment 1 of 3' })).toHaveAttribute('aria-current', 'true');
    expect(events('debate_playback_control').at(-1)).toMatchObject({ control: 'replay', trigger: 'manual' });
  });

  it('holds no elements when the card lets its media go, and shows the stills', () => {
    const { update } = renderPlayer({ active: false, mountMedia: false });
    expect(document.querySelector('video')).toBeNull();
    expect(screen.getByTestId('moments-poster')).toBeInTheDocument();
    update({ active: true, mountMedia: true });
    expect(videoIn(0).getAttribute('src')).toBe(MOMENTS[0]!.clipUrl);
  });

  it('loads the up-next card’s first moment ahead without playing it', () => {
    renderPlayer({ active: false, upNext: true });
    expect(videoIn(0).preload).toBe('auto');
    expect(mocks.play).not.toHaveBeenCalled();
  });

  it('mounts a tap-to-play card paused, and starts it with sound inside the tap', () => {
    const onPlaybackRequest = vi.fn();
    renderPlayer({ active: false, tapToPlay: true, onPlaybackRequest });
    const first = videoIn(0);
    expect(first.preload).toBe('metadata');
    expect(mocks.play).not.toHaveBeenCalled();
    // No thirds while it waits: the whole picture is Play.
    expect(screen.queryByRole('button', { name: 'Next moment' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Play moment' }));
    expect(onPlaybackRequest).toHaveBeenCalledTimes(1);
    // In the same tap, not after a render: that is what gives the element sound.
    expect(mocks.play.mock.contexts).toContain(first);
    expect(first.muted).toBe(false);
    expect(mocks.setMuted).toHaveBeenCalledWith(false, 'inferred');
  });

  it('shows Tap to play when the browser refuses a muted start, and starts on the tap', async () => {
    mocks.refuse = true;
    renderPlayer();
    await act(async () => {});
    const tap = screen.getByRole('button', { name: 'Tap to play' });
    mocks.refuse = false;
    fireEvent.click(tap);
    expect(screen.queryByRole('button', { name: 'Tap to play' })).toBeNull();
    expect(videoIn(0).paused).toBe(false);
  });

  it('puts the Agree speaker on top: a canvas over each element when Agree recorded in slot 2', () => {
    renderPlayer({ topSlot: 2 });
    expect(screen.getAllByTestId('moment-swap-canvas')).toHaveLength(2);
    const [top] = screen.getAllByTestId('reel-speaker');
    expect(top).toHaveTextContent('Blaise');
  });

  it('draws no canvas when slot 1 is already on top', () => {
    renderPlayer({ topSlot: 1 });
    expect(screen.queryByTestId('moment-swap-canvas')).toBeNull();
  });

  it('switches to the full debate at the moment on screen, and reports the switch', () => {
    const onShowFullDebate = vi.fn();
    renderPlayer({ onShowFullDebate });
    act(() => {
      Object.defineProperty(videoIn(0), 'readyState', { configurable: true, value: 4 });
      Object.defineProperty(videoIn(0), 'currentTime', { configurable: true, writable: true, value: 3 });
      fireEvent.timeUpdate(videoIn(0));
    });
    expect(screen.queryByRole('link', { name: 'Open full debate' })).toBeNull();
    // One button, naming the mode the card is not on.
    expect(screen.queryByRole('button', { name: 'Moments' })).toBeNull();
    const full = screen.getByRole('button', { name: 'Full debate' });
    expect(full).toHaveAttribute('data-geo-analytics-intent', 'debate_media_mode');
    expect(onShowFullDebate).not.toHaveBeenCalled();
    fireEvent.click(full);
    // 19.75 s + 3 s into the clip, no source times: 22 s on the recordings' clock.
    expect(onShowFullDebate).toHaveBeenCalledWith(22);
    expect(events('debate_moment_ended').at(-1)).toMatchObject({ end_reason: 'switched_to_full' });
    expect(events('debate_navigation')).toHaveLength(0);
  });

  it('offers the full debate in place when the reel cannot play', () => {
    const onShowFullDebate = vi.fn();
    renderPlayer({ moments: [MOMENTS[0]!], onShowFullDebate });
    act(() => {
      fireEvent.error(videoIn(0));
    });
    act(() => {
      fireEvent.error(videoIn(0));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Watch full debate' }));
    expect(onShowFullDebate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'Watch full debate' })).toBeNull();
  });

  it('reports a full-screen feed card as the app does', () => {
    renderPlayer({ surface: 'debate_feed', barOverClip: true, framed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Full debate' }));
    expect(events('debate_moment_ended').at(-1)).toMatchObject({
      end_reason: 'switched_to_full',
      playback_surface: 'fullscreen_moment',
      component: 'debate_feed_card',
    });
  });

  it('shows the moment’s caption', () => {
    renderPlayer();
    expect(screen.getByText('Caption of moment 1')).toBeInTheDocument();
  });

  it('borrows its two elements from the gesture pool where sound is granted per element', () => {
    mocks.pooled = true;
    const { container } = renderPlayer();
    expect(container.querySelectorAll('[data-feed-video-host]')).toHaveLength(2);
    expect(container.querySelectorAll('video')).toHaveLength(2);
  });

  it('gives the other element its own sound grant in the tap, so the reel keeps sound when it swaps back', () => {
    mocks.pooled = true;
    renderPlayer();
    act(() => playing(videoIn(0)));
    fireEvent.click(screen.getByRole('button', { name: 'Next moment' }));
    act(() => playing(videoIn(1)));
    // Slot 0 has played moment 1 (muted, from autoplay), so the pool's own tap unlock passes it over.
    Object.defineProperty(videoIn(0), 'played', { configurable: true, value: { length: 1 } });
    expect(isGestureVideoUnlocked(videoIn(0))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Unmute all videos' }));
    expect(isGestureVideoUnlocked(videoIn(1))).toBe(true);
    // Moment 3 goes back to slot 0: it was played inside the same tap, which is iOS's grant.
    expect(mocks.play.mock.contexts).toContain(videoIn(0));
    expect(isGestureVideoUnlocked(videoIn(0))).toBe(true);
  });

  it('lets a spare whose preload failed go, so the reel loads that moment afresh and fails over', () => {
    vi.useFakeTimers();
    renderPlayer();
    act(() => playing(videoIn(0)));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(videoIn(1).getAttribute('src')).toBe(MOMENTS[1]!.clipUrl);
    act(() => {
      fireEvent.error(videoIn(1));
    });
    expect(videoIn(1).getAttribute('src')).toBeNull();
    // Not preloaded again while moment 1 plays.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(videoIn(1).getAttribute('src')).toBeNull();

    act(() => ended(videoIn(0)));
    expect(screen.getByRole('button', { name: 'Moment 2 of 3' })).toHaveAttribute('aria-current', 'true');
    expect(videoIn(1).getAttribute('src')).toBe(MOMENTS[1]!.clipUrl);
    // Its retry was the preload: a second failure skips on to moment 3 instead of hanging.
    act(() => {
      fireEvent.error(videoIn(1));
    });
    expect(screen.getByRole('button', { name: 'Moment 3 of 3' })).toHaveAttribute('aria-current', 'true');
    expect(events('debate_playback_quality').at(-1)).toMatchObject({
      quality_kind: 'failed',
      failure_action: 'skipped',
    });
  });

  it('lets a failed spare go on the pooled path too, so that moment loads again when it is reached', () => {
    vi.useFakeTimers();
    mocks.pooled = true;
    renderPlayer();
    act(() => playing(videoIn(0)));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(videoIn(1).getAttribute('src')).toBe(MOMENTS[1]!.clipUrl);
    act(() => {
      fireEvent.error(videoIn(1));
    });
    // A pooled element ignores an undefined `src` prop, so the player drops the failed source itself.
    expect(videoIn(1).getAttribute('src')).toBeNull();

    act(() => ended(videoIn(0)));
    expect(screen.getByRole('button', { name: 'Moment 2 of 3' })).toHaveAttribute('aria-current', 'true');
    expect(videoIn(1).getAttribute('src')).toBe(MOMENTS[1]!.clipUrl);
  });

  it('reports the list the card is in and its place, from the card’s action scope', () => {
    renderPlayer({}, node => (
      <ActionContextProvider value={{ list_id: 'profile_activity', item_position: 3, feed_arm: 'b' }}>
        {node}
      </ActionContextProvider>
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Next moment' }));
    expect(events('debate_playback_control')[0]).toMatchObject({
      list_id: 'profile_activity',
      item_position: 3,
      feed_arm: 'b',
      asset_kind: 'clip',
    });
  });

  it('falls back to the explore list outside any list', () => {
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Next moment' }));
    expect(events('debate_playback_control')[0]).toMatchObject({ list_id: 'explore' });
  });

  it('measures nothing while the window is not focused, as the full player does', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'performance', 'Date'] });
    vi.mocked(document.hasFocus).mockReturnValue(false);
    renderPlayer();
    act(() => playing(videoIn(0)));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(events('debate_exposed')).toHaveLength(0);
    expect(events('debate_moment_ended')).toHaveLength(0);

    vi.mocked(document.hasFocus).mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(events('debate_exposed')).toHaveLength(1);
  });
});
