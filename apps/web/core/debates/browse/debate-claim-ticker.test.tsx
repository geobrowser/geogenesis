import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TickerWindow } from '~/core/debates/claim-ticker';
import type { TimedClaim } from '~/core/debates/claim-timing';

import { DebateClaimTickerCard } from './debate-claim-ticker';

const CLAIM_SPACE = '52c7ae149838b6d47ce0f3b2a5974546';

const mocks = vi.hoisted(() => ({
  /** What the shared position control reports the viewer currently holds. */
  viewerPosition: null as string | null,
  respond: vi.fn(),
}));

vi.mock('~/core/claims/browse/claim-summary', () => ({
  ClaimSummary: () => <div data-testid="crowd-split" />,
}));

vi.mock('~/core/claims/browse/use-claim-response-state', () => ({
  useClaimResponseState: () => ({
    responseKind: 'stance',
    isResponseKindResolved: true,
    isViewerResponseResolved: true,
    responseBlockedReason: null,
    summary: { isLoading: false },
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

function renderCard(props: Partial<React.ComponentProps<typeof DebateClaimTickerCard>> = {}) {
  return render(
    <DebateClaimTickerCard window={window()} row={null} entity={null} onAnswered={vi.fn()} {...props} />
  );
}

beforeEach(() => {
  mocks.viewerPosition = null;
  mocks.respond.mockClear();
});

afterEach(cleanup);

describe('DebateClaimTickerCard', () => {
  it('quotes the claim', () => {
    renderCard();

    expect(screen.getByText(/Supreme Court is no longer providing/)).toBeInTheDocument();
  });

  // It sits in the debater's own corner, above their name, so repeating the name on the card is
  // noise in the smallest space on the screen.
  it('does not repeat the speaker, who is named directly below it', () => {
    renderCard();

    expect(screen.queryByText(/just said/)).not.toBeInTheDocument();
  });

  it('fades with its window rather than holding at full strength', () => {
    const { container } = renderCard({ opacity: 0.4 });

    expect(container.firstElementChild).toHaveStyle({ opacity: '0.4' });
  });

  // Showing the split first biases the answer, which makes the tally a measure of itself. It is
  // also the payoff for answering, so it has to be withheld to be worth anything.
  it('withholds the crowd split until the viewer has taken a side', () => {
    renderCard();

    expect(screen.queryByTestId('crowd-split')).not.toBeInTheDocument();
  });

  it('reveals the crowd split once the viewer has answered', () => {
    mocks.viewerPosition = 'positive';

    renderCard();

    expect(screen.getByTestId('crowd-split')).toBeInTheDocument();
  });

  it('reports the answer up so the card is not asked again on a rewind', () => {
    mocks.viewerPosition = 'positive';
    const onAnswered = vi.fn();

    renderCard({ onAnswered });

    expect(onAnswered).toHaveBeenCalledExactlyOnceWith('claim-1');
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
