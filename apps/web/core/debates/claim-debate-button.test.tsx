import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import type { Entity } from '~/core/types';

import type { DebateClaim } from './api';
import { ClaimDebateButton } from './claim-debate-button';

const mocks = vi.hoisted(() => ({
  debatesEnabled: vi.fn(),
  debateClaims: vi.fn(),
  joinMutate: vi.fn(),
  leaveMutate: vi.fn(),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useDebatesEnabled: () => mocks.debatesEnabled(),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingState: () => 'idle',
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: undefined }),
}));

vi.mock('./hooks', () => ({
  useDebateClaims: () => mocks.debateClaims(),
  useDebateActivity: () => ({ data: null }),
  useJoinDebateQueue: () => ({ mutate: mocks.joinMutate, isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutate: mocks.leaveMutate, isPending: false, error: null }),
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="entity-response-buttons">Entity response buttons</div>,
}));

beforeEach(() => {
  mocks.debatesEnabled.mockReturnValue(true);
  mocks.debateClaims.mockReturnValue({ data: { claims: [] } });
  mocks.joinMutate.mockReset();
  mocks.leaveMutate.mockReset();
});

afterEach(() => {
  cleanup();
});

const UNPUBLISHED = [{ isLocal: true, hasBeenPublished: false }] as unknown as Entity['relations'];

function entity(relations: Entity['relations'], types: { id: string }[] = [{ id: CLAIM_TYPE_ID }]): Entity {
  return { id: 'claim-entity-1', types, relations } as unknown as Entity;
}

function debateClaim(overrides: Partial<DebateClaim> = {}): DebateClaim {
  return {
    id: 'debate-claim-1',
    space_id: 'space-1',
    claim_entity_id: 'claim-entity-1',
    claim: 'A claim',
    description: null,
    response_kind: 'stance',
    viewer_response: null,
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
    readiness_changed_at: null,
    online_choices: [],
    active_match: null,
    active_debate: null,
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:00:00.000Z',
    ...overrides,
  } as unknown as DebateClaim;
}

function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: 'Debate' }));
}

describe('ClaimDebateButton', () => {
  it('renders nothing when the entity is not a Claim', () => {
    render(
      <ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([], [{ id: 'not-a-claim' }])} />
    );

    expect(screen.queryByRole('button', { name: 'Debate' })).not.toBeInTheDocument();
  });

  it('prompts to publish without rendering readiness controls for an unpublished claim', () => {
    render(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity(UNPUBLISHED)} />);
    openPopover();

    expect(screen.getByText('Publish this claim before starting a debate.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join debate/i })).not.toBeInTheDocument();
  });

  it('requires a claim response before showing the readiness toggle', () => {
    mocks.debateClaims.mockReturnValue({ data: { claims: [debateClaim()] } });
    render(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);
    openPopover();

    expect(screen.getByText('Respond before joining')).toBeInTheDocument();
    expect(screen.getByTestId('entity-response-buttons')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join debate' })).not.toBeInTheDocument();
  });

  it('shows one readiness toggle for the backend response and leaves when ready', () => {
    mocks.debateClaims.mockReturnValue({
      data: {
        claims: [
          debateClaim({
            viewer_response: { position: true, position_label: 'Agree' },
            viewer_debate_ready: true,
          }),
        ],
      },
    });
    render(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);
    openPopover();

    expect(screen.getByText('Your response: Agree')).toBeInTheDocument();
    const leave = screen.getByRole('button', { name: 'Leave debate' });
    expect(leave).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: /debate/i })).toHaveLength(2);
    expect(screen.getByText('Waiting for someone with the opposite response.')).toBeInTheDocument();

    fireEvent.click(leave);
    expect(mocks.leaveMutate).toHaveBeenCalledWith({ claimId: 'claim-entity-1' });
    expect(mocks.joinMutate).not.toHaveBeenCalled();
  });
});
