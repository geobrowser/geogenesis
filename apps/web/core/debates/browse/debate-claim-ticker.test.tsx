import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateParticipant } from '~/core/debates/api';
import type { TickerWindow } from '~/core/debates/claim-ticker';
import type { TimedClaim } from '~/core/debates/claim-timing';

import { DebateClaimTickerCard } from './debate-claim-ticker';

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
