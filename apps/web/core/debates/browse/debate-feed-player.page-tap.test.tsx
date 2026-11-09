import { act, cleanup, render, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { tapMayStartBlockedDebate } from './blocked-page-tap';
import { DebateFeedPlayer } from './debate-feed-player';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  refresh: vi.fn(),
}));

// Follow (GEO-3236) writes through the account and reads follows; both have their own suites.
vi.mock('~/core/follows/follow-button', () => ({ FollowButton: () => null }));
vi.mock('~/core/follows/person-follow-counts', () => ({
  usePersonFollowerCount: () => null,
  usePersonFollowers: () => null,
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

let inTap = false;

beforeEach(() => {
  now = 1_700_000_000_000;
  sig = 0;
  plays.length = 0;
  inTap = false;
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
  // A browser that refuses every `play()` made outside a tap, muted or not, as Meta's iOS in-app
  // browsers do.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    if (!inTap) return Promise.reject(new DOMException('not allowed', 'NotAllowedError'));
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
  vi.restoreAllMocks();
  cleanup();
  document.body.innerHTML = '';
});

function canplayAll(c: HTMLElement) {
  for (const v of Array.from(c.querySelectorAll('video')))
    act(() => {
      v.dispatchEvent(new Event('canplay'));
    });
}

/** A tap on `target`: `play()` is allowed only while its handlers run. */
function tap(target: Element, type: 'click' | 'touchend' = 'click') {
  act(() => {
    inTap = true;
    target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    inTap = false;
  });
}

function outside(html: string) {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.firstElementChild as HTMLElement;
}

async function blockedPlayer() {
  const view = render(<DebateFeedPlayer debate={debate} active />);
  await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
  canplayAll(view.container);
  return view;
}

const blockedState = (c: HTMLElement) =>
  c.querySelector('[data-debate-autoplay-blocked]')?.getAttribute('data-debate-autoplay-blocked');

describe('tapMayStartBlockedDebate', () => {
  it.each([
    ['<p>text</p>', true],
    ['<a href="/x"><span>link</span></a>', false],
    ['<button><svg></svg></button>', false],
    ['<div role="button">x</div>', false],
    ['<input />', false],
    ['<a href="/claim" data-entity-side-panel-opener=""><span>claim title</span></a>', true],
  ])('%s -> %s', (html, expected) => {
    const element = outside(html);
    expect(tapMayStartBlockedDebate(element.querySelector('span, svg') ?? element)).toBe(expected);
  });
});

// GEO-3602
describe('DebateFeedPlayer, refused autoplay started by a tap anywhere', () => {
  it('starts the refused debate from a tap on plain page content', async () => {
    const view = await blockedPlayer();
    await waitFor(() => expect(blockedState(view.container)).toBe('true'), { timeout: 8_000 });

    tap(outside('<p>Generative AI is making culture less original</p>'), 'touchend');

    expect(plays).toHaveLength(2);
    await waitFor(() => expect(blockedState(view.container)).toBe('false'), { timeout: 8_000 });
  }, 15_000);

  it('starts it from the claim title that opens the side panel', async () => {
    const view = await blockedPlayer();
    await waitFor(() => expect(blockedState(view.container)).toBe('true'), { timeout: 8_000 });

    const title = outside('<a href="/claim" data-entity-side-panel-opener="">Claim</a>');
    title.addEventListener('click', event => event.preventDefault());
    tap(title);

    expect(plays).toHaveLength(2);
  }, 15_000);

  it('leaves a tap on a control or link with its own action alone', async () => {
    const view = await blockedPlayer();
    await waitFor(() => expect(blockedState(view.container)).toBe('true'), { timeout: 8_000 });

    tap(outside('<button type="button">Agree</button>'));
    const link = outside('<a href="/elsewhere">Log in</a>');
    link.addEventListener('click', event => event.preventDefault());
    tap(link);

    expect(plays).toHaveLength(0);
    expect(blockedState(view.container)).toBe('true');
  }, 15_000);

  it('does nothing for a card that is not the active one', async () => {
    const view = render(<DebateFeedPlayer debate={debate} active={false} />);
    await act(() => new Promise(resolve => setTimeout(resolve, 300)));
    tap(outside('<p>text</p>'));

    expect(plays).toHaveLength(0);
    expect(blockedState(view.container)).not.toBe('true');
  }, 15_000);

  it('starts once per tap, though the tap sends both touchend and click', async () => {
    const view = await blockedPlayer();
    await waitFor(() => expect(blockedState(view.container)).toBe('true'), { timeout: 8_000 });

    const text = outside('<p>text</p>');
    tap(text, 'touchend');
    tap(text, 'click');

    expect(plays).toHaveLength(2);
  }, 15_000);

  it('turns the sound on through the shared preference', async () => {
    const view = await blockedPlayer();
    await waitFor(() => expect(blockedState(view.container)).toBe('true'), { timeout: 8_000 });
    // The preference is shared across cards, and earlier cases here turned it on.
    const mute = view.queryByRole('button', { name: 'Mute' });
    if (mute) act(() => mute.click());
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();

    tap(outside('<p>text</p>'));

    await waitFor(() => expect(view.getByRole('button', { name: 'Mute' })).toBeTruthy(), { timeout: 8_000 });
  }, 15_000);
});
