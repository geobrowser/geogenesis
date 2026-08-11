import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaimSummary, MatchmakingReadiness } from '../api';
import { ClaimReadinessToggle } from './claim-readiness-toggle';

const mocks = vi.hoisted(() => ({
  readinessMutate: vi.fn(),
  readinessError: null as unknown,
}));

vi.mock('./hooks', () => ({
  useClaimReadiness: () => ({ mutate: mocks.readinessMutate, isPending: false, error: mocks.readinessError }),
}));

const claim: DebateClaimSummary = {
  id: 'debate-claim-1',
  space_id: '019fedae-72b6-7ab2-927a-df044d57c566',
  claim_entity_id: '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419',
  claim: 'Chips are better than fries',
  description: null,
};

function readiness(overrides: Partial<MatchmakingReadiness> = {}): MatchmakingReadiness {
  return {
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
    ...overrides,
  };
}

const toggle = () => screen.getByRole('switch', { name: 'Ready to debate this claim' });

beforeEach(() => {
  mocks.readinessMutate.mockReset();
  mocks.readinessError = null;
});

afterEach(cleanup);

describe('ClaimReadinessToggle', () => {
  it('stands the viewer up once they have a response', () => {
    render(<ClaimReadinessToggle claim={claim} readiness={readiness()} hasResponse />);

    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle());

    expect(mocks.readinessMutate).toHaveBeenCalledWith({
      spaceId: claim.space_id,
      claimId: claim.claim_entity_id,
      ready: true,
    });
  });

  it('stands the viewer down again without touching their response', () => {
    render(<ClaimReadinessToggle claim={claim} readiness={readiness({ viewer_debate_ready: true })} hasResponse />);

    fireEvent.click(toggle());

    expect(mocks.readinessMutate).toHaveBeenCalledWith({
      spaceId: claim.space_id,
      claimId: claim.claim_entity_id,
      ready: false,
    });
  });

  // The position is an on-chain response, so readiness cannot be turned on before there is one.
  // The reason is shown rather than left in a `title`, which never appears on touch.
  it('cannot be turned on before the viewer has responded, and says why', () => {
    render(<ClaimReadinessToggle claim={claim} readiness={readiness({ viewer_response: null })} hasResponse={false} />);

    expect(toggle()).toBeDisabled();
    expect(screen.getByText('Respond to this claim to debate it.')).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(mocks.readinessMutate).not.toHaveBeenCalled();
  });

  // geo-chat only learns about a response once it is published and indexed, so a viewer who just
  // responded must be told to wait rather than told they haven't responded.
  it('waits, and says so, while the response is still publishing', () => {
    render(
      <ClaimReadinessToggle
        claim={claim}
        readiness={readiness({ viewer_response: null })}
        hasResponse
        responseIndexing
      />
    );

    expect(toggle()).toBeDisabled();
    expect(screen.getByText('Publishing your response…')).toBeInTheDocument();
    expect(screen.queryByText('Respond to this claim to debate it.')).not.toBeInTheDocument();
  });

  // geo-chat's copy of the response lags this client's, so a viewer who has responded is allowed
  // to try — the server rejects with a reason if it disagrees.
  it('lets a viewer who has responded try even when geo-chat has not caught up', () => {
    render(<ClaimReadinessToggle claim={claim} readiness={readiness({ viewer_response: null })} hasResponse />);

    expect(toggle()).toBeEnabled();
    fireEvent.click(toggle());
    expect(mocks.readinessMutate).toHaveBeenCalled();
  });

  it('surfaces the server reason when readiness is unavailable', () => {
    render(
      <ClaimReadinessToggle
        claim={claim}
        readiness={readiness({ readiness_disabled_reason: 'Your response is still being indexed.' })}
        hasResponse
      />
    );

    expect(toggle()).toBeDisabled();
    expect(screen.getByText('Your response is still being indexed.')).toBeInTheDocument();
  });

  it('blocks readiness on a claim that is already being debated', () => {
    render(<ClaimReadinessToggle claim={claim} readiness={readiness()} hasResponse activeDebate />);

    expect(toggle()).toBeDisabled();
    expect(screen.getByText('This claim is being debated right now.')).toBeInTheDocument();
  });

  it('still lets a ready viewer stand down while a reason is present', () => {
    render(
      <ClaimReadinessToggle
        claim={claim}
        readiness={readiness({ viewer_debate_ready: true, readiness_disabled_reason: 'Cooling down.' })}
        hasResponse
      />
    );

    fireEvent.click(toggle());

    expect(mocks.readinessMutate).toHaveBeenCalledWith({
      spaceId: claim.space_id,
      claimId: claim.claim_entity_id,
      ready: false,
    });
  });

  it('shows a failed readiness change', () => {
    mocks.readinessError = new Error('Response is no longer active.');
    render(<ClaimReadinessToggle claim={claim} readiness={readiness()} hasResponse />);

    expect(screen.getByText('Response is no longer active.')).toBeInTheDocument();
  });
});
