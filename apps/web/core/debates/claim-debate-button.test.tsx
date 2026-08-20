import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import type { Entity } from '~/core/types';

import type { DebateClaim } from './api';
import { ClaimDebateButton } from './claim-debate-button';

const mocks = vi.hoisted(() => ({
  debateClaims: vi.fn(),
  debateClaimsArgs: [] as { spaceId: string; claimIds: string[] | null; enabled: boolean }[],
  entity: null as unknown,
  queryEntityOptions: [] as Record<string, unknown>[],
  joinMutate: vi.fn(),
  leaveMutate: vi.fn(),
}));

/** Ranked, and where the curated pages' claims are published. */
const CLAIM_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
/** Ranked 0, above every other space — so a "use the home space" rule would divert to it. */
const ROOT_SPACE = 'a19c345ab9866679b001d7d2138d88a1';
/** A personal space, which geo-chat does not index: asked about one, it answers `space_not_found`. */
const PERSONAL_SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';

vi.mock('~/core/state/feature-flags', () => ({}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingState: () => 'idle',
  useEntityResponseIndexingSnapshot: () => ({ status: 'idle', pending: null, runId: null }),
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

/**
 * Stands in for `store.getEntity`, including the filtering the component must not ask for:
 * `relations` and `values` are narrowed to the space requested, while `spaces` is derived from all
 * of them. A mock that ignored `spaceId` would pass whether or not the lookup is scoped, which is
 * how the scoped read that broke this went unnoticed.
 */
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: (options: Record<string, unknown>) => {
    mocks.queryEntityOptions.push(options);

    const entity = mocks.entity as { relations: { spaceId: string }[]; values: { spaceId: string }[] } | null;
    if (!entity) return { entity: undefined, isLoading: false };

    const spaceId = options.spaceId as string | undefined;
    if (!spaceId) return { entity, isLoading: false };

    return {
      entity: {
        ...entity,
        relations: entity.relations.filter(relation => relation.spaceId === spaceId),
        values: entity.values.filter(value => value.spaceId === spaceId),
      },
      isLoading: false,
    };
  },
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
  mocks.entity = null;
  mocks.queryEntityOptions.length = 0;
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
  spaces: string[] = [],
  values: Entity['values'] = []
): Entity {
  return { id: 'claim-entity-1', types, relations, spaces, values } as unknown as Entity;
}

function named(spaceId: string): Entity['values'] {
  return [
    { property: { id: SystemIds.NAME_PROPERTY }, spaceId, value: 'AGI development should be paused.' },
  ] as unknown as Entity['values'];
}

/**
 * A published claim living in one space, as `store.getEntity` returns it to an unscoped read: named
 * in the space it was published to, and carrying that space's relations whichever page is asking.
 */
function claimIn(spaceId: string, extraValues: Entity['values'] = []): Entity {
  return entity(
    [
      { type: { id: CLAIM_TYPE_ID }, spaceId, isLocal: false, hasBeenPublished: true },
    ] as unknown as Entity['relations'],
    [{ id: CLAIM_TYPE_ID }],
    [spaceId],
    [...named(spaceId), ...extraValues]
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
    mocks.entity = entity([], [{ id: 'not-a-claim' }]);
    renderButton('space-1');

    expect(screen.queryByRole('switch', { name: 'Debate' })).not.toBeInTheDocument();
  });

  it('renders a disabled compact switch for an unpublished claim', () => {
    mocks.entity = entity(UNPUBLISHED);
    renderButton('space-1');

    expect(screen.getByRole('switch', { name: 'Debate' })).toBeDisabled();
  });

  it('shows the disabled Debate switch before a claim response', () => {
    mocks.debateClaims.mockReturnValue({ data: { claims: [debateClaim()] } });
    mocks.entity = entity([]);
    renderButton('space-1');

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
    mocks.entity = entity([]);
    renderButton('space-1');

    const leave = screen.getByRole('switch', { name: 'Debate' });
    expect(leave).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Waiting for someone with the opposite response.')).not.toBeInTheDocument();

    fireEvent.click(leave);
    expect(mocks.leaveMutate).toHaveBeenCalledWith({ claimId: 'claim-entity-1' });
    expect(mocks.joinMutate).not.toHaveBeenCalled();
  });

  // Scoping the lookup is what hides the claim's own content from the resolution below, so the
  // absence of a space is the fix itself. The entity page used to hand its scoped entity down here
  // to save a subscription, which had the same effect as asking for the wrong space.
  it('does not scope the entity lookup to the space it was asked about', () => {
    mocks.entity = claimIn(CLAIM_SPACE);
    renderButton(PERSONAL_SPACE);

    expect(mocks.queryEntityOptions.at(-1)).not.toHaveProperty('spaceId');
  });

  // A collection item added without a target space pins none, so a claim curated onto a page in a
  // personal space arrived here as that space — which geo-chat answers with `space_not_found`,
  // leaving the toggle stuck on "Debate readiness is loading" for as long as the page was open.
  it('asks geo-chat about the space the claim lives in, not the one listing it', () => {
    mocks.entity = claimIn(CLAIM_SPACE);
    renderButton(PERSONAL_SPACE);

    expect(mocks.debateClaimsArgs.at(-1)).toMatchObject({
      spaceId: CLAIM_SPACE,
      claimIds: ['claim-entity-1'],
      enabled: true,
    });
    expect(screen.getByRole('switch', { name: 'Debate' })).toBeInTheDocument();
  });

  // The requested space wins whenever the claim holds content there, or every ordinary row would be
  // dragged off to whichever space happens to outrank the one the reader is on. ROOT outranks the
  // claim's own space, so a "always use the home space" rule answers CLAIM_SPACE here.
  it('leaves a claim alone in a space it also holds content in', () => {
    mocks.entity = claimIn(CLAIM_SPACE, [
      { property: { id: 'some-other-property' }, spaceId: ROOT_SPACE, value: 'x' },
    ] as unknown as Entity['values']);
    renderButton(ROOT_SPACE);

    expect(mocks.debateClaimsArgs.at(-1)).toMatchObject({ spaceId: ROOT_SPACE });
  });

  // The other half of reading unscoped, and the one that fails quietly: a lookup scoped to the
  // listing space returns no relations at all for a claim that lives elsewhere, and
  // `isClaimPublishedInSpace` then has no unpublished edit to find and calls the draft published —
  // enabling the toggle on a claim geo-chat has no row for.
  it('still sees an unpublished edit in the resolved space when listed from another', () => {
    const claim = claimIn(CLAIM_SPACE);
    claim.relations = [
      ...claim.relations,
      ...(UNPUBLISHED.map(relation => ({ ...relation, spaceId: CLAIM_SPACE })) as Entity['relations']),
    ];
    mocks.entity = claim;

    renderButton(PERSONAL_SPACE);

    expect(mocks.debateClaimsArgs.at(-1)).toMatchObject({ spaceId: CLAIM_SPACE, claimIds: [] });
    expect(screen.getByRole('switch', { name: 'Debate' })).toBeDisabled();
  });

  // The claim is published in its own space; a draft edit somewhere else is not this space's
  // business, and reading the entity unscoped would otherwise hold the toggle disabled.
  it('judges publication by the space it resolved to', () => {
    const claim = claimIn(CLAIM_SPACE);
    claim.relations = [
      ...claim.relations,
      ...(UNPUBLISHED.map(relation => ({ ...relation, spaceId: PERSONAL_SPACE })) as Entity['relations']),
    ];
    mocks.entity = claim;

    renderButton(PERSONAL_SPACE);

    expect(mocks.debateClaimsArgs.at(-1)).toMatchObject({ spaceId: CLAIM_SPACE, claimIds: ['claim-entity-1'] });
  });
});

function renderButton(spaceId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClaimDebateButton entityId="claim-entity-1" spaceId={spaceId} />
    </QueryClientProvider>
  );
}
