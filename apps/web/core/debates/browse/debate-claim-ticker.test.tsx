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

function claim(overrides: Partial<TimedClaim> = {}): TimedClaim {
  return {
    id: 'claim-1',
    text: 'The Supreme Court is no longer providing sufficient checks on executive power',
    spaceId: CLAIM_SPACE,
    blockId: 'block-1',
    publishedTiming: null,
    relationEntityId: 'relation-1',
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
  it('only masks a card that has another below it', () => {
    const { container } = renderCard({ fading: true });
    expect((container.firstElementChild as HTMLElement).style.maskImage).toContain('linear-gradient');

    cleanup();
    const newest = renderCard({ fading: false });
    expect((newest.container.firstElementChild as HTMLElement).style.maskImage).toBe('');
  });

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

  it('does not report an answer for a claim the viewer has not taken a side on', () => {
    const onAnswered = vi.fn();

    renderCard({ onAnswered });

    expect(onAnswered).not.toHaveBeenCalled();
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

  // The corner is empty most of a debate, so without the chip nothing on screen says the backlog
  // exists — and on a touch screen there is no hover to discover it with.
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

  // The open list dissolves into the tile's edge rather than being cut off square — but only when
  // something is actually scrolled above it. jsdom never scrolls, which is the short-backlog case.
  it('does not dissolve its top edge when nothing is scrolled above', () => {
    const { container } = renderStack({ open: true });

    expect((container.firstElementChild as HTMLElement).style.maskImage).toBe('');
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
