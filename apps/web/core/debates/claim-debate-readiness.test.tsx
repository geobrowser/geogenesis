import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaim } from './api';
import { ClaimDebateReadiness } from './claim-debate-readiness';

const mocks = vi.hoisted(() => ({
  joinMutate: vi.fn(),
  leaveMutate: vi.fn(),
}));

vi.mock('./hooks', () => ({
  useJoinDebateQueue: () => ({ mutate: mocks.joinMutate, isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutate: mocks.leaveMutate, isPending: false, error: null }),
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="entity-response-buttons">Entity response buttons</div>,
}));

beforeEach(() => {
  mocks.joinMutate.mockReset();
  mocks.leaveMutate.mockReset();
});

afterEach(cleanup);

describe('ClaimDebateReadiness', () => {
  it('prompts for a response without rendering an inert readiness toggle', () => {
    renderReadiness(claim({ viewer_response: null }));

    expect(screen.getByText('Respond before joining')).toBeInTheDocument();
    expect(screen.getByTestId('entity-response-buttons')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join debate/i })).not.toBeInTheDocument();
  });

  it('renders one readiness toggle after a response and joins without a position body', () => {
    renderReadiness(
      claim({
        viewer_response: { position: false, position_label: 'Disagree' },
      })
    );

    expect(screen.getByText('Your response: Disagree')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Join debate' });
    expect(screen.getAllByRole('button')).toHaveLength(1);

    fireEvent.click(toggle);

    expect(mocks.joinMutate).toHaveBeenCalledWith({ claimId: 'claim-1' });
  });

  it('leaves readiness through the same toggle', () => {
    renderReadiness(claim({ viewer_debate_ready: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    expect(mocks.leaveMutate).toHaveBeenCalledWith({ claimId: 'claim-1' });
    expect(mocks.joinMutate).not.toHaveBeenCalled();
  });

  it.each([
    ['stance', 'Agree', 'Disagree'],
    ['veracity', 'Verify', 'Dispute'],
  ] as const)('falls back to %s response labels', (responseKind, positiveLabel, negativeLabel) => {
    renderReadiness(
      claim({
        response_kind: responseKind,
        online_choices: [choice(true, ''), choice(false, '')],
      })
    );

    expect(screen.getByText(positiveLabel)).toBeInTheDocument();
    expect(screen.getByText(negativeLabel)).toBeInTheDocument();
  });

  it('shows the backend readiness-disabled reason after a refetch', () => {
    renderReadiness(claim({ readiness_disabled_reason: 'Your response changed, so debate readiness was removed.' }));

    expect(screen.getByText('Your response changed, so debate readiness was removed.')).toBeInTheDocument();
  });

  it('turns backend lifecycle codes into actionable readiness messages', () => {
    renderReadiness(claim({ readiness_disabled_reason: 'claim_response_kind_changed' }));

    expect(screen.getByText('This claim’s response type changed. Respond and join again.')).toBeInTheDocument();
  });
});

function renderReadiness(debateClaim: DebateClaim) {
  return render(
    <ClaimDebateReadiness
      debateClaim={debateClaim}
      entityId="claim-1"
      spaceId="space-1"
      canToggle
      textVariant="metadata"
    />
  );
}

function claim(overrides: Partial<DebateClaim> = {}): DebateClaim {
  return {
    id: 'debate-claim-1',
    space_id: 'space-1',
    claim_entity_id: 'claim-1',
    claim: 'A claim',
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
  return {
    position,
    position_label: positionLabel,
    participant_count: 0,
    participants: [],
  };
}
