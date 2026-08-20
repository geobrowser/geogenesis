import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { ReactElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import type { Entity } from '~/core/types';

import type { DebateClaim } from './api';
import { ClaimDebateButton } from './claim-debate-button';

const mocks = vi.hoisted(() => ({
  debateClaims: vi.fn(),
  debateClaimsArgs: [] as { spaceId: string; claimIds: string[] | null; enabled: boolean }[],
  joinMutate: vi.fn(),
  leaveMutate: vi.fn(),
}));

/** Ranked, and where the curated pages' claims are published. */
const CLAIM_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
/** A personal space, which geo-chat does not index: asked about one, it answers `space_not_found`. */
const PERSONAL_SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';

vi.mock('~/core/state/feature-flags', () => ({}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingState: () => 'idle',
  useEntityResponseIndexingSnapshot: () => ({ status: 'idle', pending: null, runId: null }),
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: undefined }),
}));

vi.mock('./hooks', () => ({
  // Mirrors the real key factory: the readiness machine refetches these families before it
  // retries a `claim_response_required`.
  debateQueryKeys: {
    matchmakingClaimsRoot: (accountKey: string | null) =>
      ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
    matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
    rematchRoot: (accountKey: string | null) => ['debates', 'account', accountKey, 'rematch'] as const,
  },
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-1' }),
  useDebateClaims: (spaceId: string, claimIds: string[] | null, enabled: boolean) => {
    mocks.debateClaimsArgs.push({ spaceId, claimIds, enabled });
    return mocks.debateClaims();
  },
  useDebateActivity: () => ({ data: null }),
  useJoinDebateQueue: () => ({ mutateAsync: mocks.joinMutate, reset: vi.fn(), isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutateAsync: mocks.leaveMutate, isPending: false, error: null }),
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="entity-response-buttons">Entity response buttons</div>,
}));

beforeEach(() => {
  mocks.debateClaimsArgs.length = 0;
  mocks.debateClaims.mockReturnValue({ data: { claims: [] } });
  mocks.joinMutate.mockReset();
  mocks.joinMutate.mockReturnValue(new Promise(() => undefined));
  mocks.leaveMutate.mockReset();
  mocks.leaveMutate.mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
  cleanup();
});

const UNPUBLISHED = [{ isLocal: true, hasBeenPublished: false }] as unknown as Entity['relations'];

function entity(
  relations: Entity['relations'],
  types: { id: string }[] = [{ id: CLAIM_TYPE_ID }],
  spaces: string[] = []
): Entity {
  return { id: 'claim-entity-1', types, relations, spaces } as unknown as Entity;
}

/** A published claim living in one space, as a curated page in another space lists it. */
function claimIn(spaceId: string): Entity {
  return entity(
    [
      { type: { id: CLAIM_TYPE_ID }, spaceId, isLocal: false, hasBeenPublished: true },
    ] as unknown as Entity['relations'],
    [{ id: CLAIM_TYPE_ID }],
    [spaceId]
  );
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

  it('renders a disabled compact switch for an unpublished claim', () => {
    renderButton(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity(UNPUBLISHED)} />);

    expect(screen.getByRole('switch', { name: 'Debate' })).toBeDisabled();
  });

  it('shows the disabled Debate switch before a claim response', () => {
    mocks.debateClaims.mockReturnValue({ data: { claims: [debateClaim()] } });
    renderButton(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);

    expect(screen.getByRole('switch', { name: 'Debate' })).toBeDisabled();
    expect(screen.queryByText('Respond before debating', { selector: 'p' })).not.toBeInTheDocument();
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

  // A collection item added without a target space pins none, so a claim curated onto a page in a
  // personal space arrived here as that space — which geo-chat answers with `space_not_found`,
  // leaving the toggle stuck on "Debate readiness is loading" for as long as the page was open.
  it('asks geo-chat about the space the claim lives in, not the one listing it', () => {
    renderButton(
      <ClaimDebateButton entityId="claim-entity-1" spaceId={PERSONAL_SPACE} entity={claimIn(CLAIM_SPACE)} />
    );

    expect(mocks.debateClaimsArgs.at(-1)).toMatchObject({ spaceId: CLAIM_SPACE, claimIds: ['claim-entity-1'] });
  });

  it('leaves a claim listed from its own space alone', () => {
    renderButton(<ClaimDebateButton entityId="claim-entity-1" spaceId={CLAIM_SPACE} entity={claimIn(CLAIM_SPACE)} />);

    expect(mocks.debateClaimsArgs.at(-1)).toMatchObject({ spaceId: CLAIM_SPACE });
  });

  // The claim is published in its own space; a draft edit somewhere else is not this space's
  // business, and reading the entity unscoped would otherwise hold the toggle disabled.
  it('judges publication by the space it resolved to', () => {
    const claim = claimIn(CLAIM_SPACE);
    claim.relations = [
      ...claim.relations,
      ...(UNPUBLISHED.map(relation => ({ ...relation, spaceId: PERSONAL_SPACE })) as Entity['relations']),
    ];

    renderButton(<ClaimDebateButton entityId="claim-entity-1" spaceId={PERSONAL_SPACE} entity={claim} />);

    expect(mocks.debateClaimsArgs.at(-1)).toMatchObject({ spaceId: CLAIM_SPACE, claimIds: ['claim-entity-1'] });
  });
});

function renderButton(button: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{button}</QueryClientProvider>);
}
