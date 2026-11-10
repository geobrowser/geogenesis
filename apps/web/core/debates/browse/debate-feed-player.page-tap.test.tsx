import { act, cleanup, render, waitFor } from '@testing-library/react';

import { Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { tapMayStartBlockedDebate } from './blocked-page-tap';
import { DebateFeedPlayer } from './debate-feed-player';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  refresh: vi.fn(),
  control: vi.fn(),
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
  usePlaybackAnalytics: () => ({ elementRef: { current: null }, control: mocks.control }),
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
/** Muted autoplay allowed outside a tap, as in the in-app browsers that autoplay but keep it muted. */
let mutedAutoplay = false;

beforeEach(() => {
  now = 1_700_000_000_000;
  sig = 0;
  plays.length = 0;
  inTap = false;
  mutedAutoplay = false;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  mocks.lookup.mockReset();
  mocks.refresh.mockReset();
  mocks.control.mockReset();
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
    if (!inTap && !(mutedAutoplay && this.muted))
      return Promise.reject(new DOMException('not allowed', 'NotAllowedError'));
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
function touchEvent(type: string, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: 100, clientY: y }] });
  return event;
}

/** A tap: `click` is a mouse click (or a card control's own press), `touchend` a finger. */
function tap(target: Element, type: 'click' | 'touchend' = 'click') {
  act(() => {
    if (type === 'touchend') target.dispatchEvent(touchEvent('touchstart', 300));
    inTap = true;
    target.dispatchEvent(type === 'touchend' ? touchEvent('touchend', 300) : new Event(type, { bubbles: true }));
    inTap = false;
  });
}

/** The start of a swipe on `target`: touchstart, then a move past the tap slop (or a scroll). */
function beginSwipe(target: Element, { scrollInstead = false } = {}) {
  act(() => {
    target.dispatchEvent(touchEvent('touchstart', 600));
    if (scrollInstead) window.dispatchEvent(new Event('scroll'));
    else target.dispatchEvent(touchEvent('touchmove', 300));
  });
}

/** The finger lifting, which iOS may count as a gesture. */
function endSwipe(target: Element) {
  act(() => {
    inTap = true;
    target.dispatchEvent(touchEvent('touchend', 300));
    inTap = false;
  });
}

function swipe(target: Element, options: { scrollInstead?: boolean } = {}) {
  beginSwipe(target, options);
  endSwipe(target);
}

function outside(html: string) {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.firstElementChild as HTMLElement;
}

// A fresh store per test: the mute preference and the viewer's choice are shared atoms.
const renderPlayer = (active = true) =>
  render(
    <Provider>
      <DebateFeedPlayer debate={debate} active={active} />
    </Provider>
  );

async function blockedPlayer() {
  const view = renderPlayer();
  await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
  canplayAll(view.container);
  return view;
}

const blockedState = (c: HTMLElement) =>
  c.querySelector('[data-debate-autoplay-blocked]')?.getAttribute('data-debate-autoplay-blocked');

// The attribute is committed before the effect that listens for taps has run, so flush effects too.
async function untilBlocked(c: HTMLElement) {
  await waitFor(() => expect(blockedState(c)).toBe('true'), { timeout: 8_000 });
  await act(async () => {});
}

describe('tapMayStartBlockedDebate', () => {
  it.each([
    ['<p>text</p>', true],
    ['<a href="/x"><span>link</span></a>', false],
    ['<button><svg></svg></button>', false],
    ['<div role="button">x</div>', false],
    ['<input />', false],
    ['<a href="/claim" data-entity-side-panel-opener="" data-debate-claim-title=""><span>claim title</span></a>', true],
    ['<a href="/other" data-entity-side-panel-opener=""><span>another entity</span></a>', false],
    ['<div data-entity-side-panel=""><p><span>panel text</span></p></div>', false],
    ['<div role="dialog"><p><span>dialog text</span></p></div>', false],
    ['<div data-radix-portal=""><p><span>portal text</span></p></div>', false],
  ])('%s -> %s', (html, expected) => {
    const element = outside(html);
    expect(tapMayStartBlockedDebate(element.querySelector('span, svg') ?? element)).toBe(expected);
  });
});

// GEO-3602
describe('DebateFeedPlayer, refused autoplay started by a tap anywhere', () => {
  it('starts the refused debate from a tap on plain page content', async () => {
    const view = await blockedPlayer();
    await untilBlocked(view.container);

    tap(outside('<p>Generative AI is making culture less original</p>'), 'touchend');

    expect(plays).toHaveLength(2);
    await waitFor(() => expect(blockedState(view.container)).toBe('false'), { timeout: 8_000 });
  }, 15_000);

  it("starts it from the debate's claim title that opens the side panel", async () => {
    const view = await blockedPlayer();
    await untilBlocked(view.container);

    tap(outside('<a href="/claim" data-entity-side-panel-opener="" data-debate-claim-title="">Claim</a>'), 'touchend');

    expect(plays).toHaveLength(2);
  }, 15_000);

  it("leaves another entity's panel link, the side panel, dialogs and portals alone", async () => {
    const view = await blockedPlayer();
    await untilBlocked(view.container);

    tap(outside('<a href="/other" data-entity-side-panel-opener="">Other</a>'), 'touchend');
    tap(outside('<div data-entity-side-panel=""><p>panel text</p></div>').querySelector('p')!, 'touchend');
    tap(outside('<div role="dialog"><p>dialog text</p></div>').querySelector('p')!, 'touchend');
    tap(outside('<div data-radix-portal=""><p>portal text</p></div>').querySelector('p')!, 'touchend');

    expect(plays).toHaveLength(0);
    expect(blockedState(view.container)).toBe('true');
  }, 15_000);

  it('leaves a mouse click on the page alone', async () => {
    const view = await blockedPlayer();
    await untilBlocked(view.container);

    tap(outside('<p>text</p>'), 'click');

    expect(plays).toHaveLength(0);
    expect(blockedState(view.container)).toBe('true');
  }, 15_000);

  it('leaves a tap on a control or link with its own action alone', async () => {
    const view = await blockedPlayer();
    await untilBlocked(view.container);

    tap(outside('<button type="button">Agree</button>'), 'touchend');
    tap(outside('<a href="/elsewhere">Log in</a>'), 'touchend');

    expect(plays).toHaveLength(0);
    expect(blockedState(view.container)).toBe('true');
  }, 15_000);

  it('does nothing for a card that is not the active one', async () => {
    const view = renderPlayer(false);
    await act(() => new Promise(resolve => setTimeout(resolve, 300)));
    tap(outside('<p>text</p>'), 'touchend');

    expect(plays).toHaveLength(0);
    expect(blockedState(view.container)).not.toBe('true');
  }, 15_000);

  it('does not start it from a scroll', async () => {
    const view = await blockedPlayer();
    await untilBlocked(view.container);

    swipe(outside('<p>text</p>'));

    expect(plays).toHaveLength(0);
    expect(blockedState(view.container)).toBe('true');
  }, 15_000);

  it('starts once per tap, though the tap sends both touchend and click', async () => {
    const view = await blockedPlayer();
    await untilBlocked(view.container);

    const text = outside('<p>text</p>');
    tap(text, 'touchend');
    tap(text, 'click');

    expect(plays).toHaveLength(2);
  }, 15_000);

  it('turns the sound on through the shared preference', async () => {
    const view = await blockedPlayer();
    await untilBlocked(view.container);
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();

    tap(outside('<p>text</p>'), 'touchend');

    await waitFor(() => expect(view.getByRole('button', { name: 'Mute' })).toBeTruthy(), { timeout: 8_000 });
    expect(mocks.control).toHaveBeenCalledWith('unmute', { source: 'page_tap' });
  }, 15_000);
});

describe("DebateFeedPlayer, refused autoplay started by the card's own controls", () => {
  async function mutedBlockedPlayer() {
    const view = await blockedPlayer();
    await untilBlocked(view.container);
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();
    return view;
  }

  it('starts with sound from the play button', async () => {
    const view = await mutedBlockedPlayer();

    tap(view.getByRole('button', { name: 'Play debate' }));

    expect(plays).toHaveLength(2);
    await waitFor(() => expect(view.getByRole('button', { name: 'Mute' })).toBeTruthy(), { timeout: 8_000 });
  }, 15_000);

  it('starts with sound from Unmute, not only turning the sound on', async () => {
    const view = await mutedBlockedPlayer();

    tap(view.getByRole('button', { name: 'Unmute' }));

    expect(plays).toHaveLength(2);
    await waitFor(() => expect(blockedState(view.container)).toBe('false'), { timeout: 8_000 });
    expect(view.getByRole('button', { name: 'Mute' })).toBeTruthy();
  }, 15_000);
});

const playingState = (c: HTMLElement) => c.querySelector('[data-debate-playing]')?.getAttribute('data-debate-playing');

describe('DebateFeedPlayer, muted autoplay given sound by a tap', () => {
  async function mutedPlaying() {
    mutedAutoplay = true;
    const view = renderPlayer();
    await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
    canplayAll(view.container);
    await waitFor(() => expect(playingState(view.container)).toBe('true'), { timeout: 8_000 });
    await act(async () => {});
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();
    return view;
  }
  const videos = (c: HTMLElement) => Array.from(c.querySelectorAll('video'));

  it('unmutes from a tap anywhere, replaying both elements inside the tap', async () => {
    const view = await mutedPlaying();
    plays.length = 0;

    tap(outside('<p>text</p>'), 'touchend');

    // The pause-and-play that unlocks each element for sound happens inside the tap.
    expect(plays).toHaveLength(2);
    await waitFor(() => expect(view.getByRole('button', { name: 'Mute' })).toBeTruthy(), { timeout: 8_000 });
    expect(playingState(view.container)).toBe('true');
  }, 15_000);

  it('turns the sound on when Play follows a pause', async () => {
    const view = await mutedPlaying();
    tap(view.getByRole('button', { name: 'Pause debate' }));
    await waitFor(() => expect(playingState(view.container)).toBe('false'), { timeout: 8_000 });
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();

    tap(view.getByRole('button', { name: 'Play debate' }));

    await waitFor(() => expect(view.getByRole('button', { name: 'Mute' })).toBeTruthy(), { timeout: 8_000 });
    expect(mocks.control).toHaveBeenCalledWith('unmute', { source: 'play' });
  }, 15_000);

  it('leaves a mouse click on blank space alone', async () => {
    const view = await mutedPlaying();
    plays.length = 0;

    tap(outside('<p>text</p>'), 'click');

    expect(plays).toHaveLength(0);
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();
  }, 15_000);

  it('gives one tap to one card when two are active', async () => {
    mutedAutoplay = true;
    const other = {
      ...debate,
      id: 'debate-2',
      recordings: [
        { participant_slot: 1, filename: 'other1.webm', started_at_ms: 1_700_000_000_000 },
        { participant_slot: 2, filename: 'other2.webm', started_at_ms: 1_700_000_000_000 },
      ],
    } as unknown as Debate;
    const view = render(
      <Provider>
        <DebateFeedPlayer debate={debate} active />
        <DebateFeedPlayer debate={other} active />
      </Provider>
    );
    await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(4));
    canplayAll(view.container);
    await waitFor(() => expect(view.container.querySelectorAll('[data-debate-playing="true"]')).toHaveLength(2), {
      timeout: 8_000,
    });
    await act(async () => {});
    plays.length = 0;

    tap(outside('<p>text</p>'), 'touchend');

    expect(plays).toHaveLength(2);
    expect(mocks.control.mock.calls.filter(([name]) => name === 'unmute')).toHaveLength(1);
  }, 15_000);

  it('keeps a chosen Mute through taps and Play', async () => {
    const view = await mutedPlaying();
    tap(view.getByRole('button', { name: 'Unmute' }));
    tap(view.getByRole('button', { name: 'Mute' }));
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();

    tap(outside('<p>text</p>'), 'touchend');
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();

    tap(view.getByRole('button', { name: 'Pause debate' }));
    await waitFor(() => expect(playingState(view.container)).toBe('false'), { timeout: 8_000 });
    tap(view.getByRole('button', { name: 'Play debate' }));
    await waitFor(() => expect(playingState(view.container)).toBe('true'), { timeout: 8_000 });
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();
  }, 15_000);

  it('leaves a scroll alone, so the next card still starts muted', async () => {
    const view = await mutedPlaying();
    plays.length = 0;

    swipe(outside('<p>text</p>'));
    swipe(outside('<p>text</p>'), { scrollInstead: true });

    expect(plays).toHaveLength(0);
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();
    expect(playingState(view.container)).toBe('true');
  }, 15_000);

  it('leaves a swipe alone that the card only started listening to halfway through', async () => {
    // The swipe that brings the next card in: it becomes active and plays before the finger lifts.
    mutedAutoplay = true;
    const view = renderPlayer();
    await waitFor(() => expect(view.container.querySelectorAll('video')).toHaveLength(2));
    const text = outside('<p>text</p>');
    beginSwipe(text);
    canplayAll(view.container);
    await waitFor(() => expect(playingState(view.container)).toBe('true'), { timeout: 8_000 });
    await act(async () => {});
    plays.length = 0;

    endSwipe(text);

    expect(plays).toHaveLength(0);
    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();
  }, 15_000);

  it('leaves a tap on a control or link with its own action alone', async () => {
    const view = await mutedPlaying();

    tap(outside('<button type="button">Agree</button>'), 'touchend');
    tap(outside('<a href="/elsewhere">Log in</a>'), 'touchend');

    expect(view.getByRole('button', { name: 'Unmute' })).toBeTruthy();
    expect(videos(view.container).every(video => video.muted)).toBe(true);
  }, 15_000);
});
