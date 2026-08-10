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
  space_id: 'space-1',
  claim_entity_id: 'claim-1',
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

beforeEach(() => {
  mocks.readinessMutate.mockReset();
  mocks.readinessError = null;
});

afterEach(cleanup);

describe('ClaimReadinessToggle', () => {
  it('stands the viewer up once they have a response', () => {
    render(<ClaimReadinessToggle claim={claim} readiness={readiness()} />);
    const toggle = screen.getByRole('switch', { name: 'Ready to debate this claim' });

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);

    expect(mocks.readinessMutate).toHaveBeenCalledWith({ spaceId: 'space-1', claimId: 'claim-1', ready: true });
  });

  it('stands the viewer down again without touching their response', () => {
    render(<ClaimReadinessToggle claim={claim} readiness={readiness({ viewer_debate_ready: true })} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Ready to debate this claim' }));

    expect(mocks.readinessMutate).toHaveBeenCalledWith({ spaceId: 'space-1', claimId: 'claim-1', ready: false });
  });

  // The position is an on-chain response, so readiness cannot be turned on before one is indexed.
  // The reason is shown rather than left in a `title`, which never appears on touch.
  it('cannot be turned on without an indexed response, and says why', () => {
    render(<ClaimReadinessToggle claim={claim} readiness={readiness({ viewer_response: null })} />);
    const toggle = screen.getByRole('switch', { name: 'Ready to debate this claim' });

    expect(toggle).toBeDisabled();
    expect(screen.getByText('Respond to this claim to debate it.')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(mocks.readinessMutate).not.toHaveBeenCalled();
  });

  it('surfaces the server reason when readiness is unavailable', () => {
    render(
      <ClaimReadinessToggle
        claim={claim}
        readiness={readiness({ readiness_disabled_reason: 'Your response is still being indexed.' })}
      />
    );

    expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).toBeDisabled();
    expect(screen.getByText('Your response is still being indexed.')).toBeInTheDocument();
  });

  it('blocks readiness on a claim that is already being debated', () => {
    render(<ClaimReadinessToggle claim={claim} readiness={readiness()} activeDebate />);

    expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).toBeDisabled();
    expect(screen.getByText('This claim is being debated right now.')).toBeInTheDocument();
  });

  it('still lets a ready viewer stand down while a reason is present', () => {
    render(
      <ClaimReadinessToggle
        claim={claim}
        readiness={readiness({ viewer_debate_ready: true, readiness_disabled_reason: 'Cooling down.' })}
      />
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Ready to debate this claim' }));

    expect(mocks.readinessMutate).toHaveBeenCalledWith({ spaceId: 'space-1', claimId: 'claim-1', ready: false });
  });

  it('shows a failed readiness change', () => {
    mocks.readinessError = new Error('Response is no longer active.');
    render(<ClaimReadinessToggle claim={claim} readiness={readiness()} />);

    expect(screen.getByText('Response is no longer active.')).toBeInTheDocument();
  });
});
