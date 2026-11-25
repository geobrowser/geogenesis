import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClaimResponseSummary } from './claim-response-summary';
import { summarizeClaimResponses } from './claim-response-summary';
import { ClaimSplitBar, ClaimSummary, ControversialTag } from './claim-summary';

// The faces and the list each run their own responder query, which is not what this is about. The
// avatars still render something pressable, because where the popover lands is.
vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({
  ClaimResponderAvatars: () => <span data-testid="responder-avatars" />,
}));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  RespondersPopoverContent: () => <div data-testid="responders-list" />,
}));
vi.mock('./claim-side-responders', () => ({ ClaimSideResponders: () => null }));

const ENTITY = 'claim-1';
const SPACE = 'space-1';

function summary(overrides: Partial<ClaimResponseSummary> = {}): ClaimResponseSummary {
  return {
    ...summarizeClaimResponses(0, 0),
    isLoading: false,
    isViewerResponseLoading: false,
    hasCounts: true,
    viewerDirection: null,
    indexedViewerDirection: null,
    viewerSpaceId: null,
    ...overrides,
  };
}

function renderSummary(value: ClaimResponseSummary) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClaimSummary entityId={ENTITY} spaceId={SPACE} responseKind="stance" summary={value} />
    </QueryClientProvider>
  );
}

afterEach(cleanup);

/**
 * The shared renderer, which six surfaces hand a summary to.
 *
 * It takes that summary as a prop rather than reading the hook, so it cannot assume the invariant
 * the hook maintains between `total` and `hasCounts`. This is the last place a fabricated
 * percentage can be caught before it is on screen.
 */
describe('ClaimSummary', () => {
  it('draws the split once the counts are an answer', () => {
    renderSummary(summary({ ...summarizeClaimResponses(17, 3) }));

    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('draws nothing where the counts never answered, whatever the total says', () => {
    // The shape a failed counts query plus one optimistic response used to produce: a total built
    // entirely from the viewer's own uncommitted press, rendered as though it were everyone. The
    // hook no longer produces it — a delta with no baseline is dropped — but a percentage is the
    // most confident thing on the card, so the renderer states the rule rather than inheriting it.
    const { container } = renderSummary(summary({ ...summarizeClaimResponses(1, 0), hasCounts: false }));

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('draws nothing where nobody has answered, which is not a verdict either', () => {
    const { container } = renderSummary(summary());

    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Where the responder list lands, which is the difference between it opening and appearing not to.
 *
 * Radix's default portal puts the popper on `document.body` with no z-index of its own, leaving the
 * list at the content's `z-100` in the root stacking context. That clears an ordinary page and
 * loses to every panel this card is drawn inside — the debates hub is `z-[200]`, so the list opened
 * *behind* it and pressing the faces looked like it did nothing at all.
 *
 * jsdom computes no stacking, so the assertion is the portal container rather than what is on top:
 * `.elevated-popover` is what the stylesheet lifts above those panels, and it is the same check the
 * debate room's audio settings make.
 */
describe('the responder list’s portal', () => {
  it('opens into the elevated portal, above whatever panel the card sits in', async () => {
    renderSummary(summary({ ...summarizeClaimResponses(17, 3) }));

    fireEvent.click(screen.getByTestId('responder-avatars').closest('button') as HTMLElement);

    const list = await screen.findByTestId('responders-list');
    expect(list.closest('[data-radix-popper-content-wrapper]')?.parentElement).toHaveClass('elevated-popover');
  });

  it('leaves the faces pressable at all', async () => {
    // The guard: the assertion above passes vacuously if nothing ever opens.
    renderSummary(summary({ ...summarizeClaimResponses(17, 3) }));

    expect(screen.queryByTestId('responders-list')).toBeNull();
    fireEvent.click(screen.getByTestId('responder-avatars').closest('button') as HTMLElement);

    await waitFor(() => expect(screen.getByTestId('responders-list')).toBeInTheDocument());
  });
});

/**
 * This change is entirely visual, so these pin the two things a later refactor would drop without
 * anything failing: the flame, and the red that is the design's `#ff523a`. There is no behaviour to
 * assert in their place.
 */
// GEO-3841 added a mono tone for the graph explorer; every other host keeps the green/red split.
describe('ClaimSplitBar', () => {
  it('splits green and red on a grey-01 track unless the host asks for mono', () => {
    const { unmount } = render(<ClaimSplitBar percent={70} />);
    const split = screen.getByRole('img', { name: '70% agree, 30% disagree' });
    expect(split).toHaveClass('bg-grey-01');
    expect(Array.from(split.children, child => child.className)).toEqual(['bg-green', 'bg-red-01']);
    unmount();

    render(<ClaimSplitBar percent={70} tone="mono" />);
    const mono = screen.getByRole('img', { name: '70% agree, 30% disagree' });
    expect(mono).toHaveClass('bg-divider');
    expect(Array.from(mono.children, child => child.className)).toEqual(['bg-text']);
  });
});

describe('ControversialTag', () => {
  afterEach(cleanup);

  it('reads as Controversial in the design’s red', () => {
    render(<ControversialTag />);

    // `text-red-01` is `#ff523a`, the colour on the Figma card — named rather than inlined so the
    // token stays the one place it is defined.
    expect(screen.getByText('Controversial')).toHaveClass('text-red-01');
  });

  it('carries the flame, drawn in the same colour as the word', () => {
    const { container } = render(<ControversialTag />);

    const flame = container.querySelector('svg');
    expect(flame).not.toBeNull();
    // `currentColor` rather than a second copy of the hex, so the flame and the word cannot drift
    // apart and a caller recolouring the tag moves both.
    expect(flame?.querySelector('path')).toHaveAttribute('fill', 'currentColor');
  });

  it('hides the flame from assistive tech, which already has the word', () => {
    const { container } = render(<ControversialTag />);

    // Decoration: the label sits right beside it and says the same thing, so an unnamed graphic
    // announced first is only noise.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('sets no background of its own', () => {
    render(<ControversialTag />);

    // It used to be a tinted pill. The design is plain text beside its neighbours, so a surviving
    // `bg-` would be the old treatment left behind.
    expect(screen.getByText('Controversial').className).not.toMatch(/bg-/);
  });

  it('keeps a caller’s className', () => {
    render(<ControversialTag className="ml-2" />);

    expect(screen.getByText('Controversial')).toHaveClass('ml-2');
  });
});

// GEO-3833: the debates app's results row, revealed under the vote pills once the viewer has voted.
describe('ClaimSummary results layout', () => {
  function renderResults(value: ClaimResponseSummary) {
    return render(
      <ClaimSummary entityId={ENTITY} spaceId={SPACE} responseKind="stance" summary={value} layout="results" />
    );
  }

  it('reads "{p}% Agree" and "{n} Votes", grouped the en-US way, with the bar filled to the share', () => {
    const { container } = renderResults(summary({ ...summarizeClaimResponses(1500, 500) }));

    expect(screen.getByText('75% Agree')).toBeInTheDocument();
    expect(screen.getByText('2,000 Votes')).toBeInTheDocument();
    const fill = container.querySelector('[data-claim-results] [role="img"] > div') as HTMLElement;
    expect(fill.style.width).toBe('75%');
    expect(fill).toHaveClass('bg-[#151515]');
  });

  it('says "1 Vote" for a single vote', () => {
    renderResults(summary({ ...summarizeClaimResponses(1, 0) }));

    expect(screen.getByText('100% Agree')).toBeInTheDocument();
    expect(screen.getByText('1 Vote')).toBeInTheDocument();
  });

  it('says the results are loading rather than drawing nothing under a fresh vote', () => {
    renderResults(summary({ isLoading: true, hasCounts: false }));

    expect(screen.getByText('Loading results…')).toBeInTheDocument();
    expect(screen.queryByText(/% Agree/)).toBeNull();
  });

  it('says the results are unavailable where the counts failed', () => {
    renderResults(summary({ hasCounts: false }));

    expect(screen.getByText('Results unavailable')).toBeInTheDocument();
  });

  // A signed-out vote on a claim nobody else has answered: "0% Agree" would contradict the vote.
  it('draws nothing where no vote has been counted yet', () => {
    const { container } = renderResults(summary());

    expect(container).toBeEmptyDOMElement();
  });
});
