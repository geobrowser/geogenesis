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

const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 20)));

/** Watch the debate, then scroll it out of the release window; `ageMs` ages its URLs first. */
async function watchThenRelease(ageMs = 0) {
  const view = render(<DebateFeedPlayer debate={debate} active />);
  await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
  canplayAll(view.container);
  await waitFor(() => expect(plays.length).toBeGreaterThanOrEqual(2));
  view.rerender(<DebateFeedPlayer debate={debate} active={false} />);
  now += ageMs;
  view.rerender(<DebateFeedPlayer debate={debate} active={false} releaseMedia />);
  expect(view.container.querySelectorAll('video')).toHaveLength(0);
  await flush();
  plays.length = 0;
  return view;
}

function gatedRefresh() {
  let open: () => void = () => {};
  const gate = new Promise<void>(resolve => {
    open = resolve;
  });
  mocks.refresh.mockImplementation(async ({ filename }: { filename: string }) => {
    await gate;
    return { url: `https://cdn/${filename}?fresh` };
  });
  return async () => {
    await act(async () => {
      open();
      await gate;
    });
  };
}

const errorShown = (c: HTMLElement) => c.textContent?.includes('Could not play') ?? false;

// A feed card re-attaching after release gets new <video> elements (GEO-3067). These drive the
// real player and playback hook through the returns the adversarial review proved broken.
describe('DebateFeedPlayer re-attach after release (GEO-3067)', () => {
  it('autoplays a card that comes back within the reuse window', async () => {
    const view = await watchThenRelease(60_000);
    view.rerender(<DebateFeedPlayer debate={debate} active />);
    await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
    canplayAll(view.container);
    await waitFor(() => expect(plays.length).toBeGreaterThanOrEqual(2));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('holds a re-attached pair until both new elements can play', async () => {
    const view = await watchThenRelease(60_000);
    let cold = true;
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockImplementation(() => (cold ? 0 : 4));
    view.rerender(<DebateFeedPlayer debate={debate} active={false} />);
    view.rerender(<DebateFeedPlayer debate={debate} active />);
    await flush();
    expect(plays).toHaveLength(0);

    cold = false;
    canplayAll(view.container);
    await waitFor(() => expect(plays.length).toBeGreaterThanOrEqual(2));
  });

  it('plays fresh URLs when reached while lapsed ones are being re-signed', async () => {
    const view = await watchThenRelease(6 * 60_000);
    const open = gatedRefresh();
    view.rerender(<DebateFeedPlayer debate={debate} active={false} />);
    view.rerender(<DebateFeedPlayer debate={debate} active />);
    await flush();
    expect(view.container.querySelectorAll('video')).toHaveLength(0);

    await open();
    await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
    canplayAll(view.container);
    await waitFor(() => expect(plays.length).toBeGreaterThanOrEqual(2));
    expect(plays.every(src => src.endsWith('?fresh'))).toBe(true);
    expect(errorShown(view.container)).toBe(false);
  });

  it('never hands a lapsed URL to a <video> when jumping straight from released to active', async () => {
    const view = await watchThenRelease(6 * 60_000);
    const open = gatedRefresh();
    view.rerender(<DebateFeedPlayer debate={debate} active />);
    await flush();
    expect(view.container.querySelectorAll('video')).toHaveLength(0);
    expect(plays).toHaveLength(0);

    await open();
    await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
    canplayAll(view.container);
    await waitFor(() => expect(plays.length).toBeGreaterThanOrEqual(2));
    expect(plays.every(src => src.endsWith('?fresh'))).toBe(true);
    expect(errorShown(view.container)).toBe(false);
  });

  it('cancels a resume still confirming when the card is released, and plays on return', async () => {
    const view = render(<DebateFeedPlayer debate={debate} active />);
    await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
    // The first play() is still pending when the card is flung away; releasing the element aborts it,
    // as browsers do when load() runs.
    const pending: Array<(error: unknown) => void> = [];
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play);
    playSpy.mockImplementation(function (this: HTMLMediaElement) {
      plays.push(this.getAttribute('src') ?? 'null');
      return new Promise<void>((_, reject) => pending.push(reject));
    });
    canplayAll(view.container);
    await waitFor(() => expect(plays.length).toBeGreaterThanOrEqual(1));

    view.rerender(<DebateFeedPlayer debate={debate} active={false} releaseMedia />);
    await act(async () => {
      for (const reject of pending) reject(new DOMException('The play() request was interrupted', 'AbortError'));
      await new Promise(resolve => setTimeout(resolve, 1_500));
    });
    expect(errorShown(view.container)).toBe(false);

    playSpy.mockImplementation(function (this: HTMLMediaElement) {
      plays.push(this.getAttribute('src') ?? 'null');
      media(this).paused = false;
      return Promise.resolve();
    });
    plays.length = 0;
    view.rerender(<DebateFeedPlayer debate={debate} active />);
    await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
    canplayAll(view.container);
    await waitFor(() => expect(plays.length).toBeGreaterThanOrEqual(2));
    expect(errorShown(view.container)).toBe(false);
  });
});
