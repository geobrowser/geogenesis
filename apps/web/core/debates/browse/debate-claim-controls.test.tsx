import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateClaimControls } from './debate-claim-controls';

// Its tiers and bar have their own suite; here it only has to be placed.
vi.mock('~/core/claims/browse/claim-summary', () => ({
  ClaimSummary: ({ summary }: { summary: { isLoading: boolean } }) => (
    <div data-testid="claim-summary" data-loading={String(summary.isLoading)} />
  ),
}));

// A signed-out viewer whose Agree is held on this device only.
const response = {
  responseKind: 'stance',
  summary: { isLoading: false },
  control: {
    optimisticPositions: [],
    viewerPosition: null,
    respond: () => {},
    canRespond: true,
    isResponseSubmitting: false,
    actionTitle: () => '',
    localVoteSide: true,
    responseError: null,
  },
} as unknown as React.ComponentProps<typeof DebateClaimControls>['response'];

const renderControls = (props: Partial<React.ComponentProps<typeof DebateClaimControls>> = {}) =>
  render(
    <DebateClaimControls
      claimId="claim"
      spaceId="space"
      response={response}
      summaryLayout="results"
      look="app"
      {...props}
    />
  );

afterEach(cleanup);

describe('DebateClaimControls "Not counted yet" note', () => {
  it('draws the note and its Save under the results on the app card', () => {
    renderControls();

    expect(screen.getByText(/^Not counted yet/)).toHaveClass('text-grey-04');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('text-text');
  });
});

describe('DebateClaimControls results row', () => {
  // A device vote is known before the claim's entity lands, and until then the counts hook is held
  // back, which reports "not loading, no counts" — the shape of a failed read.
  it('reads as loading while the host says the claim is still being read', () => {
    renderControls({ resultsPending: true });

    expect(screen.getByTestId('claim-summary')).toHaveAttribute('data-loading', 'true');
  });

  it('passes the counts through otherwise', () => {
    renderControls();

    expect(screen.getByTestId('claim-summary')).toHaveAttribute('data-loading', 'false');
  });
});
