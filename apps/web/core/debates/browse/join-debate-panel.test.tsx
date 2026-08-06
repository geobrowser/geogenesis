import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaim } from '../api';
import { JoinDebatePanel } from './join-debate-panel';

const mocks = vi.hoisted(() => ({
  claims: [] as DebateClaim[],
  joinMutate: vi.fn(),
  leaveMutate: vi.fn(),
  availabilityMutate: vi.fn(),
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateClaims: () => ({ data: { claims: mocks.claims }, isLoading: false, error: null }),
  useDebateActivity: () => ({ data: { available_to_debate: false }, isPending: false }),
  useUpdateDebateAvailability: () => ({ mutate: mocks.availabilityMutate, isPending: false }),
  useJoinDebateQueue: () => ({ mutate: mocks.joinMutate, isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutate: mocks.leaveMutate, isPending: false, error: null }),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingState: () => 'idle',
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: [] }),
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="entity-response-buttons">Entity response buttons</div>,
}));

beforeEach(() => {
  mocks.claims = [];
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('JoinDebatePanel', () => {
  it('prompts for a response without a readiness toggle', () => {
    mocks.claims = [claim({ viewer_response: null })];

    render(<JoinDebatePanel spaceId="space-1" onClose={vi.fn()} />);

    expect(screen.getByText('Respond before joining')).toBeInTheDocument();
    expect(screen.getByTestId('entity-response-buttons')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join debate' })).not.toBeInTheDocument();
  });

  it('renders backend labels and one bodyless join toggle after a response', () => {
    mocks.claims = [
      claim({
        response_kind: 'veracity',
        viewer_response: { position: false, position_label: 'Dispute' },
        online_choices: [choice(true, 'Verified'), choice(false, 'Disputed')],
      }),
    ];

    render(<JoinDebatePanel spaceId="space-1" onClose={vi.fn()} />);

    expect(screen.getByText('Your response: Dispute')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Disputed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verified' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disputed' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Join debate' }));
    expect(mocks.joinMutate).toHaveBeenCalledWith({ claimId: 'claim-1' });
  });

  it('leaves through the same readiness toggle', () => {
    mocks.claims = [claim({ viewer_debate_ready: true })];

    render(<JoinDebatePanel spaceId="space-1" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));
    expect(mocks.leaveMutate).toHaveBeenCalledWith({ claimId: 'claim-1' });
  });
});

function claim(overrides: Partial<DebateClaim> = {}): DebateClaim {
  return {
    id: 'debate-claim-1',
    space_id: 'space-1',
    claim_entity_id: 'claim-1',
    claim: 'Public transit should be free',
    description: null,
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
    readiness_changed_at: null,
    online_choices: [],
    active_match: null,
    active_debate: null,
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

function choice(position: boolean, positionLabel: string) {
  return { position, position_label: positionLabel, participant_count: 0, participants: [] };
}
