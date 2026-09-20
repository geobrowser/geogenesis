import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateParticipant } from '~/core/debates/api';
import type { ClaimMarker, TickerWindow } from '~/core/debates/claim-ticker';
import type { TimedClaim } from '~/core/debates/claim-timing';

import {
  ClaimScrubberMarkers,
  DebateClaimTickerCard,
  DebateClaimTickerStack,
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
  responseKind: 'stance' as 'stance' | 'veracity',
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
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Peter Feldip' }));

    expect(openSidePanel).toHaveBeenCalledWith(`page-${SPEAKER.profile_space_id}`, SPEAKER.profile_space_id, false);
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

  // "65% agree" on "the SEC sued Coinbase" is the wrong sentence; the share takes the same verb
  // the rest of the app uses for the claim's own vocabulary.
  it("reads the share with the claim's own vocabulary verb", () => {
    mocks.percent = 65;
    mocks.responseKind = 'veracity';

    renderCard();

    expect(screen.getByText('65% verify')).toBeInTheDocument();
  });

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

describe('DebateClaimTickerStack', () => {
  const resting = [{ window: window(), opacity: 1 }];
  const history = [
    { window: window({ id: 'older', text: 'Congress has ceded its war powers over decades' }), opacity: 1 },
    { window: window(), opacity: 1 },
  ];

  function renderStack(props: Partial<React.ComponentProps<typeof DebateClaimTickerStack>> = {}) {
    return render(
      <DebateClaimTickerStack
        cards={resting}
        history={history}
        participantByClaimId={new Map([['claim-1', SPEAKER]])}
        rowsByClaimId={new Map()}
        entitiesByClaimId={new Map()}
        onAnswered={vi.fn()}
        {...props}
      />
    );
  }

  it('shows only the live cards while closed, not the whole backlog', () => {
    renderStack();

    expect(screen.queryByText(/Congress has ceded/)).not.toBeInTheDocument();
  });

  // The point of the corner is that the backlog is one movement away — no pause, no panel.
  it('shows everything said so far when opened', () => {
    renderStack({ open: true });

    expect(screen.getByText(/Congress has ceded/)).toBeInTheDocument();
  });

  // Opening is the player's call, not the stack's: a card is on screen for a few seconds at a
  // time, so a hover target made of the cards would usually not be there to hover.
  it('still draws the backlog when no card is live', () => {
    renderStack({ cards: [], open: true });

    expect(screen.getByText(/Congress has ceded/)).toBeInTheDocument();
  });

  // A caller that gives it no way to be pressed is hover-only, and an empty corner is correct there.
  it('draws nothing at all when closed, nothing live, and there is no chip to press', () => {
    const { container } = renderStack({ cards: [] });

    expect(container).toBeEmptyDOMElement();
  });

  // The way in where there is no hover. Whether it is *drawn* is a media query — `no-hover:flex`,
  // which jsdom does not evaluate — so what is checked here is that it exists and counts correctly.
  it('rests on a chip naming how many claims are behind the playhead', () => {
    renderStack({ cards: [], onTogglePinned: vi.fn() });

    expect(screen.getByRole('button', { name: 'Show the 2 claims said so far' })).toHaveTextContent('2 claims');
  });

  it('presses through to the caller, which owns whether the corner is open', () => {
    const onTogglePinned = vi.fn();
    renderStack({ cards: [], onTogglePinned });

    fireEvent.click(screen.getByRole('button', { name: /Show the 2 claims/ }));

    expect(onTogglePinned).toHaveBeenCalledOnce();
  });

  // A pointer closes the corner by leaving the tile. A tap has nowhere to go, so the way in has to
  // double as the way out — and only in that case, or a mouse user gets a control they never need.
  it('offers a way back out only when the chip is what opened it', () => {
    renderStack({ open: true, pinned: true, onTogglePinned: vi.fn() });
    expect(screen.getByRole('button', { name: 'Hide the claims said so far' })).toBeInTheDocument();

    cleanup();
    renderStack({ open: true, onTogglePinned: vi.fn() });
    expect(screen.queryByRole('button', { name: /Hide the claims/ })).not.toBeInTheDocument();
  });

  /**
   * The chip sits under the card in the column, so one that stayed up while a claim was live held
   * the card 43px higher than it needed to be — the difference, on a phone tile, between a card
   * under the speaker's chin and a card across their face. It has nothing to announce in that
   * moment either: the claim it would point at is already on screen.
   */
  it('gives way to a live claim so the card can sit at the bottom', () => {
    renderStack({ onTogglePinned: vi.fn() });

    expect(screen.getByText(/Supreme Court/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /claims said so far/ })).not.toBeInTheDocument();
  });

  // Still the way back out of an opened backlog, live card or not.
  it('keeps the chip while the backlog is open', () => {
    renderStack({ open: true, pinned: true, onTogglePinned: vi.fn() });

    expect(screen.getByRole('button', { name: 'Hide the claims said so far' })).toBeInTheDocument();
  });

  /**
   * The open list dissolves into the tile's edge rather than being cut off square, and it may not
   * do that with a mask on the box.
   *
   * A `mask-image` makes its element a Backdrop Root, which leaves `backdrop-filter` on anything
   * inside with nothing to sample — masking this box flattened the glass on every card in the list
   * until it was scrolled back to the very top, where the mask came off again. The ramp goes on the
   * cards, whose own masks do not blind their own backdrop-filter.
   */
  it('dissolves its top edge without masking the box the glass cards sit in', () => {
    const { container } = renderStack({ open: true });
    const list = container.firstElementChild!.firstElementChild as HTMLElement;

    expect(list.style.maskImage).toBe('');
    expect(list.style.webkitMaskImage).toBe('');
  });

  /**
   * The ramp's two stops, in px.
   *
   * Read off `--claim-ramp` rather than `mask-image`: the ramp is written to a custom property so
   * the card's stylesheet can refuse it on a device with no pointer, where the fade is in the way.
   */
  const ramp = (card: HTMLElement) => card.style.getPropertyValue('--claim-ramp');
  const rampStops = (card: HTMLElement) => [...ramp(card).matchAll(/(-?[\d.]+)px/g)].map(m => Number(m[1]));

  /** Three deep, so the ramp has a card above it, one across it, and one below its reach. */
  const deepHistory = [
    { window: window({ id: 'oldest', text: 'Congress has ceded its war powers over decades' }), opacity: 1 },
    { window: window({ id: 'older', text: 'The court has expanded executive deference' }), opacity: 1 },
    { window: window(), opacity: 1 },
  ];

  /** jsdom lays nothing out, so the list's geometry is stated outright. */
  function layOut(list: HTMLElement) {
    const cards = [...list.children] as HTMLElement[];
    cards.forEach((card, index) => {
      Object.defineProperty(card, 'offsetTop', { configurable: true, value: index * 100 });
      Object.defineProperty(card, 'offsetHeight', { configurable: true, value: 90 });
    });
    return cards;
  }

  const listOf = (container: HTMLElement) => container.firstElementChild!.firstElementChild as HTMLElement;

  /**
   * One ramp for the whole list, anchored to its top edge — the construction the Figma frame uses,
   * where a single 209×168 mask is positioned per card rather than each card getting its own.
   *
   * The stops are the frame's: clear for 4.65px, fully opaque at 71.5px.
   */
  it('anchors one ramp to the top of the list rather than to each card', () => {
    const { container } = renderStack({ open: true, history: deepHistory });
    const list = listOf(container);
    const cards = layOut(list);

    fireEvent.scroll(list, { target: { scrollTop: 100 } });

    // The second card's top is exactly at the edge, so it carries the ramp from its own origin.
    expect(rampStops(cards[1])).toEqual([4.65, 71.5]);
    // The first has travelled wholly above the edge, where the list's overflow already hides it.
    expect(ramp(cards[0])).toBe('none');
    // The third starts below the ramp's reach and is drawn whole.
    expect(ramp(cards[2])).toBe('none');
  });

  // The ramp stays with the edge while the cards move under it.
  it('shifts the ramp as the list scrolls under it', () => {
    const { container } = renderStack({ open: true, history: deepHistory });
    const list = listOf(container);
    const cards = layOut(list);

    fireEvent.scroll(list, { target: { scrollTop: 150 } });

    // Same card, now 50px above the edge: the whole ramp slides down it by that much.
    expect(rampStops(cards[1])).toEqual([54.65, 121.5]);
  });

  /**
   * Preston, from the preview: "if you scroll all the way to the top we should take off the blur
   * mask". The ramp is there to say there is more above — at the top there is not, and dissolving
   * the oldest claim is the one moment it works against the reader who scrolled back to find it.
   */
  it('takes the ramp off once the list is scrolled to the very top', () => {
    const { container } = renderStack({ open: true, history: deepHistory });
    const list = listOf(container);
    const cards = layOut(list);

    fireEvent.scroll(list, { target: { scrollTop: 100 } });
    expect(ramp(cards[1])).not.toBe('none');

    fireEvent.scroll(list, { target: { scrollTop: 0 } });

    for (const card of cards) expect(ramp(card)).toBe('none');
  });

  // The ramp is written to the nodes, and the newest card survives the close.
  it('takes the ramp off again when the corner closes', () => {
    const { container, rerender } = renderStack({ open: true, history: deepHistory });
    const list = listOf(container);
    const cards = layOut(list);

    fireEvent.scroll(list, { target: { scrollTop: 100 } });
    expect(ramp(cards[1])).not.toBe('none');

    rerender(
      <DebateClaimTickerStack
        cards={resting}
        history={history}
        participantByClaimId={new Map([['claim-1', SPEAKER]])}
        rowsByClaimId={new Map()}
        entitiesByClaimId={new Map()}
        onAnswered={vi.fn()}
      />
    );

    for (const card of [...list.children] as HTMLElement[]) expect(ramp(card)).toBe('none');
  });

  // The gaps between cards are holes in the list, and the video behind is one big play/pause
  // button. A thumb aiming at a card and missing by a few px should not stop the debate.
  it('does not toggle playback when a gap between cards is clicked', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <div onClick={onToggle}>
        <DebateClaimTickerStack
          cards={resting}
          history={history}
          open
          participantByClaimId={new Map([['claim-1', SPEAKER]])}
          rowsByClaimId={new Map()}
          entitiesByClaimId={new Map()}
          onAnswered={vi.fn()}
        />
      </div>
    );

    // The scrolling list itself — the element the cards sit in, and the only part of the corner
    // that takes pointer events across the gaps between them.
    fireEvent.click(container.firstElementChild!.firstElementChild!.firstElementChild!);

    expect(onToggle).not.toHaveBeenCalled();
  });

  /**
   * A reader who has scrolled back is reading. The debate keeps talking while they do, and the list
   * used to jump to the newest claim every time one arrived — which took the sentence they were
   * halfway through off the screen and read as the list closing and starting over.
   */
  it('leaves a reader where they are when a new claim arrives', () => {
    const { container, rerender } = renderStack({ open: true });
    const list = container.firstElementChild!.firstElementChild as HTMLElement;

    // jsdom lays nothing out, so the scroll geometry is stated outright: a list twice its own
    // height, scrolled to the top of it.
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 400 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 200 });
    fireEvent.scroll(list, { target: { scrollTop: 0 } });

    rerender(
      <DebateClaimTickerStack
        cards={resting}
        history={[...history, { window: window({ id: 'newest', text: 'And one more thing' }), opacity: 1 }]}
        open
        participantByClaimId={new Map([['claim-1', SPEAKER]])}
        rowsByClaimId={new Map()}
        entitiesByClaimId={new Map()}
        onAnswered={vi.fn()}
      />
    );

    expect(list.scrollTop).toBe(0);
    // Still added, and at the bottom — it is only the view that stays put.
    expect(screen.getByText(/And one more thing/)).toBeInTheDocument();
  });

  // The other half of the same bargain: someone watching the newest claim keeps watching it.
  it('follows the newest claim for a reader already at the bottom', () => {
    const { container, rerender } = renderStack({ open: true });
    const list = container.firstElementChild!.firstElementChild as HTMLElement;

    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 400 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 200 });
    fireEvent.scroll(list, { target: { scrollTop: 200 } });

    rerender(
      <DebateClaimTickerStack
        cards={resting}
        history={[...history, { window: window({ id: 'newest', text: 'And one more thing' }), opacity: 1 }]}
        open
        participantByClaimId={new Map([['claim-1', SPEAKER]])}
        rowsByClaimId={new Map()}
        entitiesByClaimId={new Map()}
        onAnswered={vi.fn()}
      />
    );

    expect(list.scrollTop).toBe(400);
  });

  // Hover is not available to a keyboard, and the backlog is content rather than decoration, so
  // focus reaching the stack has to open it the way the pointer does.
  it('reports focus entering and leaving so the player can open it', async () => {
    const onFocusChange = vi.fn();
    const { container } = renderStack({ onFocusChange });

    // A keyboard reaches this stack by landing on the first control inside a card, and React's
    // onFocus bubbles from there to the list. Which control that is belongs to the card's own
    // layout, so this asserts only that focus arrived somewhere inside.
    await userEvent.tab();
    const focused = document.activeElement as HTMLElement;
    expect(container.firstElementChild?.contains(focused)).toBe(true);
    expect(onFocusChange).toHaveBeenLastCalledWith(true);

    fireEvent.blur(focused);
    expect(onFocusChange).toHaveBeenLastCalledWith(false);
  });

  /**
   * A click inside a live card is not a request for the backlog.
   *
   * The player opens the backlog on focus, and draws it narrower than a live card. Any focus
   * counting meant clicking the expand toggle on a clamped claim swapped the card for the list
   * mid-read, and re-laid the claim out at the list's width — so the reader asked for the rest of
   * the sentence in front of them and got it in a different column.
   */
  it('does not report focus when a click lands inside it', async () => {
    forceClampedOverflow();
    const onFocusChange = vi.fn();
    renderStack({ onFocusChange });

    await userEvent.click(screen.getByTitle('Show the whole claim'));

    expect(screen.getByTitle('Show less')).toHaveAttribute('aria-expanded', 'true');
    expect(onFocusChange).not.toHaveBeenCalledWith(true);
  });

  /**
   * The chip is a sibling of the scroll box, so a boundary drawn around the box alone reported
   * focus *gone* the moment a keyboard tabbed from the last card out to the chip. The player then
   * closed the backlog, `showChip` went false with a live card present, and the chip unmounted
   * mid-tab — dropping focus to the body, with the one control that reopens the list now missing.
   */
  it('keeps reporting focus when a keyboard tabs from a card out to the chip', async () => {
    const onFocusChange = vi.fn();
    renderStack({ onFocusChange, open: true, pinned: true, onTogglePinned: vi.fn() });
    const user = userEvent.setup();

    // Into the stack, then on until the chip has it. The cards' own controls come first.
    const chip = screen.getByRole('button', { name: /claims said so far|Hide the claims/i });
    for (let i = 0; i < 12 && document.activeElement !== chip; i += 1) await user.tab();

    expect(chip).toHaveFocus();
    expect(onFocusChange).toHaveBeenLastCalledWith(true);
    expect(onFocusChange).not.toHaveBeenCalledWith(false);
  });

  // Same for the thumbs, which is the other thing a pointer comes to a live card to do.
  it('does not report focus when a thumb is clicked', async () => {
    const onFocusChange = vi.fn();
    renderStack({ onFocusChange });

    await userEvent.click(screen.getByLabelText('Agree'));

    expect(onFocusChange).not.toHaveBeenCalledWith(true);
  });
});

/**
 * One gate decides what the ticker will offer, and all three offers read from it.
 *
 * A claim needs a speaker the participant list recognises and a space to answer in before a card
 * can be drawn for it. The card layer has always enforced that; the scrubber and the chip did not,
 * so both pointed at claims that could never appear. These assert the three agree.
 */
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
    expect(ticker.cardsBySlot.size).toBe(0);
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
    expect(ticker.cardsBySlot.size).toBe(0);
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

  // Two claims ending on the same millisecond would otherwise compute a zero-width button, which
  // cannot be pressed or focused at all — the floor keeps it as wide as the hash it draws.
  it('keeps a floor under markers that land on the same moment', () => {
    expect(widths([marker('a', 0.5), marker('b', 0.5)])).toEqual([
      'clamp(2px, 0.000%, 12px)',
      'clamp(2px, 0.000%, 12px)',
    ]);
  });
});

describe('ClaimScrubberMarkers', () => {
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
});
