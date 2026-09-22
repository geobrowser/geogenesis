import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClaimResponseSummary } from './claim-response-summary';
import { summarizeClaimResponses } from './claim-response-summary';
import { ClaimVerdict } from './claim-verdict';

// The sides render their own responder query and popover, neither of which this module decides.
vi.mock('./claim-summary', () => ({
  ClaimSides: () => <div data-testid="claim-sides" />,
  ClaimSplitBar: () => <div data-testid="claim-split-bar" />,
}));

const ENTITY = 'claim-1';
const SPACE = 'space-1';

/** The hook's shape, so a test says only what it is about. */
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

function renderVerdict(value: ClaimResponseSummary) {
  return render(<ClaimVerdict entityId={ENTITY} spaceId={SPACE} responseKind="veracity" summary={value} />);
}

afterEach(cleanup);

describe('ClaimVerdict', () => {
  it('invites a first response on a claim the server says nobody has answered', () => {
    renderVerdict(summary());

    expect(screen.getByText('No responses yet')).toBeInTheDocument();
  });

  it('reports the share once there are responses', () => {
    renderVerdict(summary({ ...summarizeClaimResponses(17, 3) }));

    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('20 responses')).toBeInTheDocument();
    expect(screen.queryByText('No responses yet')).toBeNull();
  });

  // `total: 0` has three causes and only one of them is "nobody has answered". This module is the
  // one place that turns that zero into a statement about the claim, so it is the one place the
  // difference matters: a reader told "No responses yet" about a claim with two hundred of them has
  // been handed a wrong verdict rather than a missing one, with nothing on screen to say so.
  it('says nothing at all when the counts never answered', () => {
    // What a failed count query leaves behind: nothing loading any more, and no data.
    renderVerdict(summary({ hasCounts: false }));

    expect(screen.queryByText('No responses yet')).toBeNull();
    expect(screen.queryByTestId('claim-split-bar')).toBeNull();
  });

  it('says nothing while the summary is still being held back', () => {
    // The claim page reaches this on every load: the summary waits for the vocabulary, so until the
    // entity lands the hook has asked nothing and reports a zero that stands for nothing. Loading
    // is already false by then, so the skeleton above does not cover it.
    renderVerdict(summary({ hasCounts: false, isLoading: false }));

    expect(screen.queryByText('No responses yet')).toBeNull();
  });

  it('draws a skeleton while the counts are still on their way', () => {
    const { container } = renderVerdict(summary({ isLoading: true, hasCounts: false }));

    expect(screen.queryByText('No responses yet')).toBeNull();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  // The claim page's Agree/Disagree renders in this card. Taking a side doesn't wait on a count, so
  // the controls stay reachable in every state the numbers can be in.
  describe('with children', () => {
    function renderWithControls(value: ClaimResponseSummary) {
      return render(
        <ClaimVerdict entityId={ENTITY} spaceId={SPACE} responseKind="veracity" summary={value}>
          <div data-testid="controls" />
        </ClaimVerdict>
      );
    }

    it('renders them in the same card as the split', () => {
      renderWithControls(summary({ ...summarizeClaimResponses(17, 3) }));

      const card = screen.getByRole('region', { name: 'Response summary' });
      expect(card).toContainElement(screen.getByTestId('claim-split-bar'));
      expect(card).toContainElement(screen.getByTestId('controls'));
    });

    it('renders them under the invitation on an unanswered claim', () => {
      renderWithControls(summary());

      expect(screen.getByText('No responses yet')).toBeInTheDocument();
      expect(screen.getByTestId('controls')).toBeInTheDocument();
    });

    it('still renders them when the counts never answered', () => {
      renderWithControls(summary({ hasCounts: false }));

      expect(screen.queryByText('No responses yet')).toBeNull();
      expect(screen.getByTestId('controls')).toBeInTheDocument();
    });

    it('still renders them while the counts load', () => {
      const { container } = renderWithControls(summary({ isLoading: true, hasCounts: false }));

      expect(container.querySelector('.animate-pulse')).not.toBeNull();
      expect(screen.getByTestId('controls')).toBeInTheDocument();
    });
  });
});
