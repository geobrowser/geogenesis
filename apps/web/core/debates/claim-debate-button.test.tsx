import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { ReactElement } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { userEntityResponseQueryKey } from '~/core/responses/entity-response';
import type { Entity } from '~/core/types';

import type { DebateClaim } from './api';
import { ClaimDebateButton } from './claim-debate-button';

const mocks = vi.hoisted(() => ({
  debatesEnabled: vi.fn(),
  debateClaims: vi.fn(),
  joinMutate: vi.fn(),
  leaveMutate: vi.fn(),
  viewerResponse: undefined as 'positive' | 'negative' | null | undefined,
}));

vi.mock('~/core/state/feature-flags', () => ({
  useDebatesEnabled: () => mocks.debatesEnabled(),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingState: () => 'idle',
  useEntityResponseIndexingSnapshot: () => ({ status: 'idle', pending: null, runId: null }),
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'profile-space-1', isLoading: false, isRegistered: true }),
}));

vi.mock('~/core/io/queries', () => ({
  getUserEntityResponse: () => Effect.succeed(null),
}));

vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseBatchState: () => ({ managed: false, ready: true }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: undefined }),
}));

vi.mock('./hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: true, accountKey: 'account-1' }),
  useDebateClaims: () => mocks.debateClaims(),
  useDebateActivity: () => ({ data: null }),
  useJoinDebateQueue: () => ({ mutateAsync: mocks.joinMutate, reset: vi.fn(), isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutateAsync: mocks.leaveMutate, isPending: false, error: null }),
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="entity-response-buttons">Entity response buttons</div>,
}));

beforeEach(() => {
  mocks.debatesEnabled.mockReturnValue(true);
  mocks.debateClaims.mockReturnValue({ data: { claims: [] } });
  mocks.joinMutate.mockReset();
  mocks.joinMutate.mockReturnValue(new Promise(() => undefined));
  mocks.leaveMutate.mockReset();
  mocks.leaveMutate.mockReturnValue(new Promise(() => undefined));
  mocks.viewerResponse = undefined;
});

afterEach(() => {
  cleanup();
});

const UNPUBLISHED = [{ isLocal: true, hasBeenPublished: false }] as unknown as Entity['relations'];

function entity(relations: Entity['relations'], types: { id: string }[] = [{ id: CLAIM_TYPE_ID }]): Entity {
  return { id: 'claim-entity-1', types, relations, values: [] } as unknown as Entity;
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

describe('ClaimDebateButton', () => {
  it('renders nothing when the entity is not a Claim', () => {
    renderButton(
      <ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([], [{ id: 'not-a-claim' }])} />
    );

    expect(screen.queryByRole('switch', { name: 'Debate' })).not.toBeInTheDocument();
  });

  it('renders no switch for an unpublished claim without a position', () => {
    renderButton(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity(UNPUBLISHED)} />);

    expect(screen.queryByRole('switch', { name: 'Debate' })).not.toBeInTheDocument();
  });

  it('does not show the Debate switch before a claim response', () => {
    mocks.debateClaims.mockReturnValue({ data: { claims: [debateClaim()] } });
    renderButton(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);

    expect(screen.queryByRole('switch', { name: 'Debate' })).not.toBeInTheDocument();
    expect(screen.queryByText('Respond before debating', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('shows the Debate switch from the canonical response while the debate snapshot hydrates', () => {
    mocks.viewerResponse = 'negative';
    renderButton(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);

    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the inline checked Debate switch and leaves when ready', () => {
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
    renderButton(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);

    const leave = screen.getByRole('switch', { name: 'Debate' });
    expect(leave).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Waiting for someone with the opposite response.')).not.toBeInTheDocument();

    fireEvent.click(leave);
    expect(mocks.leaveMutate).toHaveBeenCalledWith({ claimId: 'claim-entity-1' });
    expect(mocks.joinMutate).not.toHaveBeenCalled();
  });
});

function renderButton(button: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (mocks.viewerResponse !== undefined) {
    queryClient.setQueryData(
      userEntityResponseQueryKey('profile-space-1', 'claim-entity-1', 'space-1', 0, 'stance'),
      mocks.viewerResponse
    );
  }
  return render(<QueryClientProvider client={queryClient}>{button}</QueryClientProvider>);
}
