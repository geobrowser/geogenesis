import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClaimResponseSummary } from './claim-response-summary';
import { summarizeClaimResponses } from './claim-response-summary';
import { ClaimSummary } from './claim-summary';

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
    viewerSpaceId: null,
    ...overrides,
  };
}

function renderSummary(value: ClaimResponseSummary) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClaimSummary entityId={ENTITY} spaceId={SPACE} responseKind="veracity" summary={value} />
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
