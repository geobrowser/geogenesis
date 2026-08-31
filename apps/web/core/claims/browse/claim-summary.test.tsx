import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClaimResponseSummary } from './claim-response-summary';
import { summarizeClaimResponses } from './claim-response-summary';
import { ClaimSummary } from './claim-summary';

// The faces and their popovers each run their own responder query, which is not what this is about.
vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({ ClaimResponderAvatars: () => null }));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({ RespondersPopoverContent: () => null }));
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
