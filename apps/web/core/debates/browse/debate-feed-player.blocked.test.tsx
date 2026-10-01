import { act, cleanup, render, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebateFeedPlayer } from './debate-feed-player';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('./use-debate-end-card', () => ({ useDebateEndCard: () => ({}) }));
vi.mock('./debate-end-card', () => ({ DebateEndCard: () => <div data-testid="end-card" /> }));
vi.mock('~/core/debates/participant-bylines', () => ({ useParticipantBylines: () => new Map() }));
vi.mock('~/core/debates/use-playback-analytics', () => ({
  usePlaybackAnalytics: () => ({ elementRef: { current: null }, control: vi.fn() }),
}));
vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: vi.fn(), closeSidePanel: vi.fn(), sidePanelTarget: null }),
}));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null }) }));
vi.mock('~/core/telemetry/logger', () => ({ reportEvent: vi.fn() }));
vi.mock('./debate-claim-ticker', () => ({
  useDebateClaimTicker: () => ({
    cardsBySlot: new Map(),
    historyBySlot: new Map(),
    markers: [],
    answers: new Map(),
    onAnswered: vi.fn(),
    rowsByClaimId: new Map(),
    entitiesByClaimId: new Map(),
    participantByClaimId: new Map(),
  }),
  DebateClaimTickerStack: () => null,
  ClaimScrubberMarkers: () => null,
}));
vi.mock('~/core/debates/hooks', () => ({
  useRecordingPlaybackUrl: () => ({ lookup: mocks.lookup, refresh: mocks.refresh }),
  useDebateTranscript: () => ({ data: { segments: [] }, isLoading: false, error: null }),
  useDebateMedia: () => ({ data: { turn_segments: [] }, isPending: false, isLoading: false, error: null }),
}));

const debate = {
  id: 'debate-1',
  claim: { space_id: 'space-1' },
  started_at: new Date(1_700_000_000_000).toISOString(),
  first_participant_slot: 1,
  turn_durations_ms: [300_000, 300_000],
  participants: [
    { participant_slot: 1, profile_space_id: '11111111111111111111111111111111', position: true },
    { participant_slot: 2, profile_space_id: '22222222222222222222222222222222', position: false },
  ],
  recordings: [
    { participant_slot: 1, filename: 'slot1.webm', started_at_ms: 1_700_000_000_000 },
    { participant_slot: 2, filename: 'slot2.webm', started_at_ms: 1_700_000_000_000 },
  ],
} as unknown as Debate;

let now = 1_700_000_000_000;
let sig = 0;
const plays: string[] = [];
const state = new WeakMap<HTMLMediaElement, { paused: boolean; t: number }>();
const media = (v: HTMLMediaElement) => {
  let x = state.get(v);
  if (!x) {
    x = { paused: true, t: 0 };
    state.set(v, x);
  }
  return x;
};

beforeEach(() => {
  now = 1_700_000_000_000;
  sig = 0;
  plays.length = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  mocks.lookup.mockReset();
  mocks.refresh.mockReset();
  mocks.lookup.mockImplementation(({ filename }: { filename: string }) =>
    Promise.resolve({ url: `https://cdn/${filename}?s=${sig++}` })
  );
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    media(this).paused = true;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    plays.push(this.getAttribute('src') ?? 'null');
    media(this).paused = false;
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: HTMLMediaElement) {
    return media(this).paused;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockImplementation(() => 4);
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(function (this: HTMLMediaElement) {
    return media(this).t;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set').mockImplementation(function (
    this: HTMLMediaElement,
    v: number
  ) {
    media(this).t = v;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

function canplayAll(c: HTMLElement) {
  for (const v of Array.from(c.querySelectorAll('video')))
    act(() => {
      v.dispatchEvent(new Event('canplay'));
    });
}

// A start that comes back blocked must keep its error on screen and in the GEO-3074 outcome
// state; re-running autoplay as the resume settles cleared it within milliseconds (GEO-3067).
//
// GEO-3111: this used to sample once after a fixed 2 real-second wall-clock wait, racing the
// confirm cycle's real `setTimeout`s (`PLAY_CONFIRM_POLLS` x `PLAY_CONFIRM_INTERVAL_MS` in
// playback-utils.ts, which resets the error and sets it again) against CI scheduling jitter — a
// slow shard could still be between the reset and the re-set at the 2s mark.
//
// Fake timers looked like the fix, but proved to be the wrong tool here, confirmed by running
// this file under real multi-process CPU contention: the component's own effect scheduling can
// land a tick later than a synchronous `act()` guarantees, through a path `setTimeout`/
// `setInterval` faking doesn't reach, so advancing (even via `vi.runAllTimersAsync`) can resolve
// before the retry has actually started. `waitFor` below polls the real DOM on a real timer
// instead of sampling once at a guessed instant, so it is insensitive to exactly when, or over
// how many ticks, the retry gets scheduled.
describe('DebateFeedPlayer blocked start', () => {
  it('keeps the error shown and reported while retrying', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function (this: HTMLMediaElement) {
      plays.push(this.getAttribute('src') ?? 'null');
      return Promise.resolve(); // resolves, element stays paused => 'blocked'
    });
    const states: boolean[] = [];
    const view = render(<DebateFeedPlayer debate={debate} active onPlaybackState={s => states.push(s.error)} />);
    await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
    canplayAll(view.container);

    // Poll for the end state rather than sampling once after a fixed sleep — this is what makes
    // it immune to the original race. Generous timeout: the nominal cycle is ~300ms, but a loaded
    // CI shard is exactly the case this has to tolerate rather than race.
    await waitFor(
      () => {
        expect(view.container.textContent).toContain('Could not play both videos');
        expect(states.at(-1)).toBe(true);
      },
      { timeout: 8_000 }
    );

    // And it stays up, steadily, once it has — nothing later clears it while the card is left
    // alone (GEO-3067). A real wait here is fine: unlike the original bug, this isn't racing to
    // land inside a narrow window, it only has to outlast one the error could wrongly disappear
    // in, which the regression this guards against did "within milliseconds".
    await act(() => new Promise(resolve => setTimeout(resolve, 500)));
    expect(view.container.textContent).toContain('Could not play both videos');
    expect(states.at(-1)).toBe(true);
  }, 15_000);
});
