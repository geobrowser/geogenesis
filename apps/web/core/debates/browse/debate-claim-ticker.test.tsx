import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateParticipant } from '~/core/debates/api';
import type { ClaimMarker, TickerWindow } from '~/core/debates/claim-ticker';
import type { TimedClaim } from '~/core/debates/claim-timing';

import {
  ClaimScrubberMarkers,
  DebateClaimTickerCard,
  markerHitWidth,
  useDebateClaimTicker,
} from './debate-claim-ticker';

const CLAIM_SPACE = '52c7ae149838b6d47ce0f3b2a5974546';

const mocks = vi.hoisted(() => ({
  /** What `useDebateTranscriptClaims` hands the hook, for the `useDebateClaimTicker` suite. */
  transcriptClaims: { all: [], blocks: [], byAuthorSpaceId: new Map() } as {
    all: TimedClaim[];
    blocks: Array<{ id: string; authorSpaceId: string | null }>;
    byAuthorSpaceId: Map<string, unknown>;
  },
  /** What the shared position control reports the viewer currently holds — a side, not a string. */
  viewerPosition: null as boolean | null,
  /** The crowd's share of positive responses, or null on a claim nobody has answered. */
  percent: null as number | null,
  responseKind: 'stance' as const,
  respond: vi.fn(),
}));

vi.mock('~/design-system/avatar', () => ({ Avatar: () => <div data-testid="avatar" /> }));

vi.mock('~/core/claims/browse/use-claim-response-state', () => ({
  useClaimResponseState: () => ({
    responseKind: mocks.responseKind,
    isResponseKindResolved: true,
    isViewerResponseResolved: true,
    responseBlockedReason: null,
    summary: { isLoading: false, percent: mocks.percent },
    claim: { id: 'claim-1' },
    positions: [],
    readiness: {},
  }),
}));

vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  PositionRow: ({ onRespond, disabled }: { onRespond: (side: string) => void; disabled?: boolean }) => (
    <button type="button" data-testid="agree" disabled={disabled} onClick={() => onRespond('positive')}>
      Agree
    </button>
  ),
  useClaimPositionControl: () => ({
    viewerPosition: mocks.viewerPosition,
    optimisticPositions: [],
    respond: mocks.respond,
    actionTitle: () => '',
    responseError: null,
    canRespond: true,
  }),
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => vi.fn() }));

// The card's header names its speaker and links to them, which reaches for the side panel and for
// the space behind the profile. Neither is what these tests are about.
const openSidePanel = vi.fn();
const analyticsMocks = vi.hoisted(() => ({ personProfileOpened: vi.fn() }));
vi.mock('~/core/analytics', () => ({ personProfileOpened: analyticsMocks.personProfileOpened }));
vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel, closeSidePanel: vi.fn(), sidePanelTarget: null }),
}));
vi.mock('~/core/hooks/use-space', () => ({
  useSpace: (spaceId?: string) => ({ space: spaceId ? { entity: { id: `page-${spaceId}` } } : null, isLoading: false }),
}));

// `useDebateClaimTicker` reads four shared caches. None of them is what the suite below is about —
// it asks what the hook does with the claims once it has them — so each hands back a fixture.
vi.mock('~/core/debates/use-debate-transcript-claims', () => ({
  useDebateTranscriptClaims: () => ({ claims: mocks.transcriptClaims, isLoading: false }),
}));
vi.mock('~/core/debates/use-claim-timings', () => ({
  // The resolver's published path, which is the only one the fixtures below take: a claim already
  // carrying offsets is timed at full confidence and the transcript is never read. Reproduced
  // rather than stubbed flat so the suite exercises real timings.
  useClaimTimings: () => ({
    timings: new Map(
      mocks.transcriptClaims.all
        .filter(entry => entry.publishedTiming !== null)
        .map(entry => [
          entry.id,
          { ...(entry.publishedTiming as { startMs: number; endMs: number }), confidence: 1, source: 'published' },
        ])
    ),
    isLoading: false,
  }),
}));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntities: () => ({ entities: [] }) }));
vi.mock('~/core/debates/hooks', () => ({ useDebateClaimsBySpaces: () => ({ claims: [] }) }));

function claim(overrides: Partial<TimedClaim> = {}): TimedClaim {
  return {
    id: 'claim-1',
    text: 'The Supreme Court is no longer providing sufficient checks on executive power',
    spaceId: CLAIM_SPACE,
    blockId: 'block-1',
    publishedTiming: null,
    highlightScore: null,
    relevanceScore: null,
    qualityScore: null,
    controversyScore: null,
    relationEntityId: 'relation-1',
    restated: false,
    timing: { startMs: 134_600, endMs: 143_140, confidence: 1, source: 'published' },
    ...overrides,
  };
}

function window(overrides: Partial<TimedClaim> = {}): TickerWindow {
  return { claim: claim(overrides), startMs: 134_600, endMs: 148_140 };
}

const SPEAKER = {
  display_name: 'Peter Feldip',
  profile_space_id: '4582fbbee28a16589154f7e36f1ee3c5',
  avatar_cid: null,
  participant_slot: 1,
} as unknown as DebateParticipant;

function renderCard(props: Partial<React.ComponentProps<typeof DebateClaimTickerCard>> = {}) {
  return render(
    <DebateClaimTickerCard
      window={window()}
      speaker={SPEAKER}
      row={null}
      entity={null}
      onAnswered={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  mocks.viewerPosition = null;
  mocks.percent = null;
  mocks.responseKind = 'stance';
  mocks.respond.mockClear();
});

afterEach(cleanup);

describe('DebateClaimTickerCard', () => {
  it('quotes the claim', () => {
    renderCard();

    expect(screen.getByText(/Supreme Court is no longer providing/)).toBeInTheDocument();
  });

  // The card carries its own attribution now, which is what lets the stack live in one fixed
  // corner instead of over the speaker's tile. Get this wrong and the card misquotes a real person.
  // The same link as the name in the corner of the tile, and the same person.
  it('opens the speaker from the card, the way the tile corner does', () => {
    openSidePanel.mockClear();
    analyticsMocks.personProfileOpened.mockClear();
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Peter Feldip' }));

    expect(openSidePanel).toHaveBeenCalledWith(`page-${SPEAKER.profile_space_id}`, SPEAKER.profile_space_id, false, {
      forceRequestedSpace: true,
    });
    expect(analyticsMocks.personProfileOpened).toHaveBeenCalledWith(
      SPEAKER.profile_space_id,
      `page-${SPEAKER.profile_space_id}`,
      {
        interaction_surface: 'debate_media',
        navigation_mode: 'entity_side_panel',
      }
    );
  });

  // The video behind is one big play/pause button.
  it('does not toggle playback when the speaker is opened', () => {
    const onToggle = vi.fn();
    render(
      <div onClick={onToggle}>
        <DebateClaimTickerCard window={window()} speaker={SPEAKER} row={null} entity={null} onAnswered={vi.fn()} />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Peter Feldip' }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('names the debater who said it', () => {
    renderCard();

    expect(screen.getByText('Peter Feldip')).toBeInTheDocument();
  });

  it('fades with its window rather than holding at full strength', () => {
    const { container } = renderCard({ opacity: 0.4 });

    expect(container.firstElementChild).toHaveStyle({ opacity: '0.4' });
  });

  // The card above the newest one dissolves into the video; the newest sits at full strength. In
  // Figma that is one gradient over the whole stack, reproduced per-card — see `OLDER_CARD_FADE`.
  it('shows the crowd split before the viewer has answered, per the design', () => {
    mocks.percent = 65;

    renderCard();

    expect(screen.getByText('65% agree')).toBeInTheDocument();
  });

  // A case that used to sit here — "reads the share with agree even on a claim geo-chat still calls
  // factual" — is gone, and the type is why. The share verb comes from the kind this hook returns,
  // which is `DebateResponseKind` and so can only be `stance`; geo-chat's own word for it never
  // reaches here. Setting `mocks.responseKind = 'veracity'` no longer compiles, and with the input
  // unrepresentable the case is the one directly above it.

  // A genuine 0% and "nobody has answered" are different statements, and the great majority of
  // claims are the second one.
  it('says nothing about the split on a claim nobody has answered', () => {
    renderCard();

    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  // Small, recessive, and unlabelled on screen — so the accessible name is the only thing telling
  // a screen reader which side is which.
  it('offers both sides as icons that still name themselves', () => {
    renderCard();

    expect(screen.getByLabelText('Agree')).toBeInTheDocument();
    expect(screen.getByLabelText('Disagree')).toBeInTheDocument();
  });

  it('shows which side the viewer took', () => {
    mocks.viewerPosition = true;

    renderCard();

    expect(screen.getByLabelText('Agree')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Disagree')).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the answer up so the card is not asked again on a rewind', () => {
    mocks.viewerPosition = true;
    const onAnswered = vi.fn();

    renderCard({ onAnswered });

    // Reports which way, not just that — the end card tallies the sides.
    expect(onAnswered).toHaveBeenCalledExactlyOnceWith('claim-1', true);
  });

  /**
   * The map has to track the side the viewer *holds*, not the first one they pressed. It used to
   * latch, so switching sides or clearing one left the scorecard tallying an answer nobody holds.
   */
  it('reports a side the viewer changes, and its removal', () => {
    const onAnswered = vi.fn();
    mocks.viewerPosition = true;
    const { rerender } = renderCard({ onAnswered });
    expect(onAnswered).toHaveBeenLastCalledWith('claim-1', true);

    mocks.viewerPosition = false;
    rerender(
      <DebateClaimTickerCard window={window()} speaker={SPEAKER} row={null} entity={null} onAnswered={onAnswered} />
    );
    expect(onAnswered).toHaveBeenLastCalledWith('claim-1', false);

    mocks.viewerPosition = null;
    rerender(
      <DebateClaimTickerCard window={window()} speaker={SPEAKER} row={null} entity={null} onAnswered={onAnswered} />
    );
    expect(onAnswered).toHaveBeenLastCalledWith('claim-1', null);
  });

  // `null` is the report, not silence — it is how a cleared side reaches the map, which drops the
  // entry rather than keeping a stale one. What must never happen is reporting a *side* nobody took.
  it('reports no side for a claim the viewer has not answered', () => {
    const onAnswered = vi.fn();

    renderCard({ onAnswered });

    expect(onAnswered).not.toHaveBeenCalledWith('claim-1', true);
    expect(onAnswered).not.toHaveBeenCalledWith('claim-1', false);
  });

  // The video behind the card is one large play/pause button.
  it('does not toggle playback when the card itself is clicked', () => {
    const onToggle = vi.fn();

    render(
      <button type="button" onClick={onToggle}>
        <DebateClaimTickerCard window={window()} row={null} entity={null} onAnswered={vi.fn()} />
      </button>
    );
    fireEvent.click(screen.getByText(/Supreme Court is no longer providing/));

    expect(onToggle).not.toHaveBeenCalled();
  });

  // A claim the graph reports no space for cannot be linked or responded to, so the panel renders
  // it as plain text. Over the video there is nothing useful to draw at all.
  it('draws nothing for a claim with no space to publish a response to', () => {
    const { container } = renderCard({ window: { ...window({ spaceId: null }) } });

    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * jsdom lays nothing out, so a clamped element reports zero for both heights and the overflow
 * measurement correctly concludes there is nothing to expand. These make it report a fourth line.
 */
function forceClampedOverflow() {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 68 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 51 });
}

describe('the claim text', () => {
  afterEach(() => {
    // @ts-expect-error — dropping the stubs restores jsdom's own zero-height getters.
    delete HTMLElement.prototype.scrollHeight;
    // @ts-expect-error — as above.
    delete HTMLElement.prototype.clientHeight;
  });

  // Most claims fit in three lines, and a control that visibly does nothing is worse than none.
  it('is not a control when the whole claim already fits', () => {
    renderCard();

    expect(screen.queryByTitle('Show the whole claim')).not.toBeInTheDocument();
  });

  it('expands in place when there is more than the clamp shows, and collapses again', () => {
    forceClampedOverflow();
    renderCard();

    const toggle = screen.getByTitle('Show the whole claim');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByTitle('Show less')).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByTitle('Show less'));
    expect(screen.getByTitle('Show the whole claim')).toHaveAttribute('aria-expanded', 'false');
  });

  // The video behind is one large play/pause button, so reading a claim must not stop the debate.
  it('does not toggle playback when expanded', () => {
    forceClampedOverflow();
    const onToggle = vi.fn();

    render(
      <button type="button" onClick={onToggle}>
        <DebateClaimTickerCard window={window()} speaker={SPEAKER} row={null} entity={null} onAnswered={vi.fn()} />
      </button>
    );
    fireEvent.click(screen.getByTitle('Show the whole claim'));

    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('useDebateClaimTicker', () => {
  const DEBATE_SPACE = '52c7ae149838b6d47ce0f3b2a5974546';
  const SPEAKER_SPACE = '4582fbbee28a16589154f7e36f1ee3c5';

  const debate = {
    id: 'debate-1',
    claim: { space_id: DEBATE_SPACE },
    participants: [SPEAKER],
  } as unknown as Parameters<typeof useDebateClaimTicker>[0];

  /** A claim the matcher never has to place, so these tests only exercise the gate. */
  const published = (overrides: Partial<TimedClaim> = {}) =>
    claim({ publishedTiming: { startMs: 134_600, endMs: 143_140 }, ...overrides });

  /** `playheadMs` past every claim's end, so the backlog holds whatever the gate let through. */
  function renderTicker(claims: TimedClaim[], blocks: Array<{ id: string; authorSpaceId: string | null }>) {
    mocks.transcriptClaims = { all: claims, blocks, byAuthorSpaceId: new Map() };
    return renderHook(() => useDebateClaimTicker(debate, { playheadMs: 200_000, timelineMs: 300_000, enabled: true }))
      .result.current;
  }

  it('offers a claim whose speaker and space both resolve', () => {
    const ticker = renderTicker([published()], [{ id: 'block-1', authorSpaceId: SPEAKER_SPACE }]);

    expect(ticker.markers.map(marker => marker.id)).toEqual(['claim-1']);
    expect(ticker.historyBySlot.get(1)).toHaveLength(1);
  });

  // Attribution and the participant list can disagree. The card refuses to park such a claim over
  // whichever face is nearer, so nothing else should point at it either.
  it('offers nothing for a claim whose speaker is not a participant', () => {
    const ticker = renderTicker([published()], [{ id: 'block-1', authorSpaceId: null }]);

    expect(ticker.markers).toEqual([]);
    expect(ticker.historyBySlot.size).toBe(0);
  });

  /**
   * Two claim entities can carry the same text and the same published moment — measured at 11
   * claims in one corpus debate, apparently published twice. Everything downstream then doubles:
   * two identical cards in the backlog, a chip counting both, and two markers at one spot where the
   * later covers the earlier, so the first cannot be reached with a pointer.
   */
  it('shows a claim once when two entities carry the same text at the same moment', () => {
    const ticker = renderTicker(
      [published(), published({ id: 'claim-2' })],
      [{ id: 'block-1', authorSpaceId: SPEAKER_SPACE }]
    );

    expect(ticker.markers.map(m => m.id)).toEqual(['claim-1']);
    expect(ticker.historyBySlot.get(1)).toHaveLength(1);
  });

  // A debater who repeats themselves later has said something new, so both moments keep a card.
  it('keeps both when the same words are said at a different moment', () => {
    const ticker = renderTicker(
      [published(), published({ id: 'claim-2', publishedTiming: { startMs: 200_000, endMs: 204_000 } })],
      [{ id: 'block-1', authorSpaceId: SPEAKER_SPACE }]
    );

    expect(ticker.markers.map(m => m.id).sort()).toEqual(['claim-1', 'claim-2']);
  });

  /**
   * A disabled ticker still reads a warm cache — the feed card and the explore card fetch the same
   * query ungated. The cards and backlog already refused to build from it; the markers did not, so
   * an inactive feed card could draw a hash that seeks to a claim it will never show.
   */
  it('offers nothing at all while switched off', () => {
    mocks.transcriptClaims = {
      all: [published()],
      blocks: [{ id: 'block-1', authorSpaceId: SPEAKER_SPACE }],
      byAuthorSpaceId: new Map(),
    };
    const ticker = renderHook(() =>
      useDebateClaimTicker(debate, { playheadMs: 200_000, timelineMs: 300_000, enabled: false })
    ).result.current;

    expect(ticker.markers).toEqual([]);
    expect(ticker.historyBySlot.size).toBe(0);
  });

  // `DebateClaimTickerCard` returns null without a space — there is nowhere to record an answer.
  it('offers nothing for a claim with no space to answer in', () => {
    const ticker = renderTicker([published({ spaceId: null })], [{ id: 'block-1', authorSpaceId: SPEAKER_SPACE }]);

    expect(ticker.markers).toEqual([]);
    expect(ticker.historyBySlot.size).toBe(0);
  });
});

/**
 * The scrubber hashes are 2px wide and sit above the range input, so their hit area is both the
 * accessibility problem and the thing that can steal a drag or a neighbour's tap. The width is
 * computed per marker rather than set in CSS, so it is worth holding.
 */
describe('markerHitWidth', () => {
  const marker = (id: string, fraction: number): ClaimMarker => ({
    id,
    text: `Claim ${id}`,
    atMs: fraction * 100_000,
    seekMs: fraction * 100_000 + 250,
    fraction,
    count: 1,
  });

  const widths = (markers: ClaimMarker[]) => markers.map((_, index) => markerHitWidth(markers, index));

  // Nothing to crowd it, so it takes the ceiling — which is 12 rather than WCAG's 24 because these
  // sit over the scrub bar, and whatever they cover is a place a drag cannot start.
  it('gives the only marker on the bar the full hit width', () => {
    expect(widths([marker('a', 0.5)])).toEqual(['12px']);
  });

  /**
   * The clamp that stops a wider target covering the next claim: measured over the corpus, 34% of
   * adjacent pairs sit closer than 24px on a phone. Two markers 1% apart can each be 1% wide — they
   * meet, and neither reaches the other's centre — but no wider.
   */
  it('never lets a target reach past its nearest neighbour', () => {
    expect(widths([marker('a', 0.5), marker('b', 0.51)])).toEqual([
      'clamp(2px, 1.000%, 12px)',
      'clamp(2px, 1.000%, 12px)',
    ]);
  });

  // Each marker takes its *nearest* neighbour, not the one before it. The middle marker here is
  // crowded on one side only; the far one is crowded by nothing and hits the ceiling.
  it('measures the nearer of the two neighbours', () => {
    expect(widths([marker('a', 0.1), marker('b', 0.11), marker('c', 0.9)])).toEqual([
      'clamp(2px, 1.000%, 12px)',
      'clamp(2px, 1.000%, 12px)',
      'clamp(2px, 79.000%, 12px)',
    ]);
  });

  /**
   * The floor, on an input `claimMarkers` no longer produces.
   *
   * Two markers on one point overlap exactly — same `left`, same width — so the later covers the
   * earlier and one claim cannot be pressed at all. That is fixed at the producer: coincident
   * claims collapse into a single hash before they get here, and
   * `claim-ticker.test.ts` holds that. This holds the floor anyway, because `markerHitWidth` is
   * exported and pure, and a 2px button that can be pressed beats a 0px one that cannot.
   */
  it('keeps a floor under markers that land on the same moment', () => {
    expect(widths([marker('a', 0.5), marker('b', 0.5)])).toEqual([
      'clamp(2px, 0.000%, 12px)',
      'clamp(2px, 0.000%, 12px)',
    ]);
  });
});

describe('ClaimScrubberMarkers', () => {
  // The hover preview is a Radix tooltip, and Radix measures its arrow with a ResizeObserver that
  // jsdom does not implement. Nothing here asserts on size, so an inert one is enough.
  beforeEach(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  // Radix opens on a `setTimeout` of the delay it was given, so how long that wait is is the only
  // thing separating this preview from the one it replaced. Under a real clock nothing here could
  // tell them apart: `findBy*` polls for a second, which is long enough to swallow the 300ms
  // default and call it instant.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Hover `target` and let exactly `ms` pass — no more, so a longer wait stays unsatisfied. */
  const hoverFor = (target: HTMLElement, ms: number) => {
    fireEvent.pointerMove(target, { pointerType: 'mouse' });
    act(() => void vi.advanceTimersByTime(ms));
  };

  const marker = (id: string, fraction: number): ClaimMarker => ({
    id,
    text: `Claim ${id}`,
    atMs: fraction * 100_000,
    seekMs: fraction * 100_000 + 250,
    fraction,
    count: 1,
  });

  it('seeks into the claim window rather than to the hash it draws', () => {
    const onSeek = vi.fn();
    render(<ClaimScrubberMarkers markers={[marker('a', 0.5)]} onSeek={onSeek} />);

    fireEvent.click(screen.getByLabelText('Jump to: Claim a'));

    expect(onSeek).toHaveBeenCalledWith(50_250);
  });

  // The hash is drawn by a pseudo-element so the target can grow around it without the mark
  // growing too. Nothing here can read a pseudo-element, so this holds the button itself empty.
  it('draws its hash without a child element the target could inherit size from', () => {
    const { container } = render(<ClaimScrubberMarkers markers={[marker('a', 0.5)]} onSeek={vi.fn()} />);

    expect(container.querySelector('button')?.children).toHaveLength(0);
  });

  /**
   * The preview used to be a `title`, and a native tooltip waits a second or more before it
   * appears — long enough on a scrubber that viewers read the preview as missing rather than slow.
   * That wait is the browser's and cannot be shortened, so the fix was to stop using `title` at
   * all. Both halves of that are held here: the attribute gone, since one left behind would bring
   * the slow preview back alongside the fast one, and the replacement opening on the hover itself.
   *
   * Zero elapsed milliseconds is the whole point. Radix schedules the open on a timer even at a
   * delay of zero, so the hover alone leaves nothing on screen and draining the queue is what
   * stands in for the browser's next tick. A tooltip that wanted 300ms would still be waiting.
   */
  it('previews a claim on the hover itself, with no native title left to lag behind it', () => {
    render(<ClaimScrubberMarkers markers={[marker('a', 0.5)]} onSeek={vi.fn()} />);

    const target = screen.getByLabelText('Jump to: Claim a');
    expect(target).not.toHaveAttribute('title');

    hoverFor(target, 0);

    expect(screen.getByRole('tooltip')).toHaveTextContent('Claim a');
  });

  // A hash stands for whatever ended in its segment, and the card only ever shows one of them.
  // The preview says how many are behind it so a click on a crowded hash is not a surprise.
  it('says how many claims share a hash', () => {
    render(<ClaimScrubberMarkers markers={[{ ...marker('a', 0.5), count: 3 }]} onSeek={vi.fn()} />);

    hoverFor(screen.getByLabelText('Jump to 3 claims, showing: Claim a'), 0);

    expect(screen.getByRole('tooltip')).toHaveTextContent('Claim a (+2 more)');
  });
});
