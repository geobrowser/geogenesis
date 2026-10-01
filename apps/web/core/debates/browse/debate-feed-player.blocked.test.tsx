import { act, render, waitFor } from '@testing-library/react';

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
afterEach(() => vi.restoreAllMocks());

function canplayAll(c: HTMLElement) {
  for (const v of Array.from(c.querySelectorAll('video')))
    act(() => {
      v.dispatchEvent(new Event('canplay'));
    });
}


// A start that comes back blocked must keep its error on screen and in the GEO-3074 outcome
// state; re-running autoplay as the resume settles cleared it within milliseconds (GEO-3067).
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
    await act(() => new Promise(r => setTimeout(r, 2000)));
    expect(view.container.textContent).toContain('Could not play both videos');
    expect(states.at(-1)).toBe(true);
  }, 10000);
});
