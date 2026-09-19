import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateParticipant } from '~/core/debates/api';
import type { TickerWindow } from '~/core/debates/claim-ticker';
import type { TimedClaim } from '~/core/debates/claim-timing';

import { DebateClaimTickerCard, DebateClaimTickerStack } from './debate-claim-ticker';

const CLAIM_SPACE = '52c7ae149838b6d47ce0f3b2a5974546';

const mocks = vi.hoisted(() => ({
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
  it('reports focus entering and leaving so the player can open it', () => {
    const onFocusChange = vi.fn();
    renderStack({ onFocusChange });
    // Focus lands on a control inside a card — tabbing to a thumb is how a keyboard reaches this —
    // and React's onFocus bubbles from there to the list.
    const thumb = screen.getByLabelText('Agree');

    fireEvent.focus(thumb);
    expect(onFocusChange).toHaveBeenLastCalledWith(true);

    fireEvent.blur(thumb);
    expect(onFocusChange).toHaveBeenLastCalledWith(false);
  });
});
