import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateClaimControls } from './debate-claim-controls';

// Its tiers and bar have their own suite; here it only has to be placed.
vi.mock('~/core/claims/browse/claim-summary', () => ({
  ClaimSummary: ({ tone, summary }: { tone?: string; summary: { isLoading: boolean } }) => (
    <div data-testid="claim-summary" data-tone={tone} data-loading={String(summary.isLoading)} />
  ),
}));

// A signed-out viewer whose Agree is held on this device only.
const response = {
  responseKind: 'stance',
  isResponseKindResolved: true,
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

const renderControls = (look: 'app' | 'app-dark') =>
  render(
    <DebateClaimControls claimId="claim" spaceId="space" response={response} summaryLayout="results" look={look} />
  );

afterEach(cleanup);

describe('DebateClaimControls "Not counted yet" note', () => {
  it('draws the note and its Save in the light tone on the app card', () => {
    renderControls('app');

    expect(screen.getByText(/^Not counted yet/)).toHaveClass('text-grey-04');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('text-text');
  });

  // GEO-3833: on the dark full screen a near-black Save would vanish into the #191919 surface.
  it('draws the note and its Save in white on the dark look, like the results above it', () => {
    renderControls('app-dark');

    expect(screen.getByTestId('claim-summary')).toHaveAttribute('data-tone', 'dark');
    expect(screen.getByText(/^Not counted yet/)).toHaveClass('text-white/70');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('text-white');
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveClass('text-text');
  });
});

describe('DebateClaimControls results row', () => {
  // A device vote is known before the claim's entity lands, and until then the counts hook is held
  // back, which reports "not loading, no counts" — the shape of a failed read.
  it('reads as loading, not unavailable, while the claim is still resolving', () => {
    render(
      <DebateClaimControls
        claimId="claim"
        spaceId="space"
        response={{ ...response, isResponseKindResolved: false }}
        summaryLayout="results"
        look="app"
      />
    );

    expect(screen.getByTestId('claim-summary')).toHaveAttribute('data-loading', 'true');
  });

  it('passes the counts through once the claim has resolved', () => {
    renderControls('app');

    expect(screen.getByTestId('claim-summary')).toHaveAttribute('data-loading', 'false');
  });
});
