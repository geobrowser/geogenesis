import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateClaimControls } from './debate-claim-controls';

// Its tiers and bar have their own suite; here it only has to be placed.
vi.mock('~/core/claims/browse/claim-summary', () => ({
  ClaimSummary: ({ tone }: { tone?: string }) => <div data-testid="claim-summary" data-tone={tone} />,
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
