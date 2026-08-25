import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { EntityVoteButtons } from './entity-vote-buttons';

/**
 * A claim shown outside the space it was published to — a data block row, a ranking entry — used to
 * draw curation arrows while the Debate button sat next to it, because the two read claim-ness from
 * different places. `store.getEntity` filters `relations` to the space asked for but derives `types`
 * from all of them, so scoping the lookup to the collecting space hid the Types relation entirely.
 */
const BLOCK_SPACE = 'cc31e40f74231d530f1b5d0fc1cd94d8';
const CLAIM_SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  entity: null as unknown,
  queryEntityOptions: [] as Record<string, unknown>[],
}));

vi.mock('@geogenesis/auth', () => ({ useGeoLogin: () => ({ login: vi.fn() }) }));

vi.mock('~/core/analytics', () => ({
  downvoted: vi.fn(),
  trackPrivyAuth: vi.fn(),
  upvoted: vi.fn(),
  voteCast: vi.fn(),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: () => ({
    submitResponse: vi.fn(),
    optimisticResponse: undefined,
    isResponseIndexingDelayed: false,
    isConnected: true,
    personalSpaceId: 'profile-1',
  }),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'profile-1', isRegistered: true, isLoading: false }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: null }) }));

vi.mock('~/core/io/queries', () => ({
  getClaimResponseSummaryPage: () => Effect.succeed([]),
  // Two up, one down: a curation score reads "1", a claim percentage reads "67%".
  getEntityResponseCounts: () => Effect.succeed({ positive: 2, negative: 1 }),
  getEntityResponders: () => Effect.succeed([]),
  getSpaces: () => Effect.succeed([]),
  getUserEntityResponse: () => Effect.succeed(null),
}));

vi.mock('~/core/io/subgraph/fetch-profile', () => ({ fetchProfilesBySpaceIds: () => Effect.succeed([]) }));

vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false }),
}));

/**
 * Stands in for `store.getEntity`, including the filtering that caused the bug: `relations` and
 * `values` are narrowed to the space asked for, while the entity itself carries every space's. A
 * mock that ignored `spaceId` would pass whether or not the component scopes its lookup.
 */
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: (options: Record<string, unknown>) => {
    mocks.queryEntityOptions.push(options);

    const entity = mocks.entity as {
      relations: { spaceId: string }[];
      values: { spaceId: string }[];
    } | null;

    if (!entity) return { entity: null, isLoading: false };

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

vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({ ClaimResponderAvatars: () => null }));

/**
 * As `store.getEntity` returns it when no space is given: relations from every space the entity
 * lives in, so the Types relation is present whichever space the caller happens to be rendering.
 */
function claimEntity({ isFactualIn }: { isFactualIn?: string } = {}) {
  return {
    id: 'claim-1',
    name: 'AGI development should be paused.',
    relations: [
      {
        type: { id: SystemIds.TYPES_PROPERTY },
        toEntity: { id: CLAIM_TYPE_ID },
        spaceId: CLAIM_SPACE,
        isDeleted: false,
      },
    ],
    values: isFactualIn
      ? [{ property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID }, spaceId: isFactualIn, value: '1', isDeleted: false }]
      : [],
  };
}

function renderButtons() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<EntityVoteButtons entityId="claim-1" spaceId={BLOCK_SPACE} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  mocks.entity = null;
  mocks.queryEntityOptions.length = 0;
});

afterEach(cleanup);

describe('EntityVoteButtons claim detection across spaces', () => {
  // The reported bug: claims collected into another space rendered the curation arrows.
  it('treats an entity as a claim when its Types relation lives in another space', async () => {
    mocks.entity = claimEntity();
    renderButtons();

    // The claim controls show agreement as a percentage; curation shows a net score.
    expect(await screen.findByText('67%')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  // Scoping the lookup is what hid the relation, so the absence of a space is the fix itself.
  it('does not scope the entity lookup to the space it was asked to respond in', () => {
    mocks.entity = claimEntity();
    renderButtons();

    expect(mocks.queryEntityOptions.at(-1)).not.toHaveProperty('spaceId');
  });

  // An ordinary entity is still an ordinary entity — the widened lookup must not turn everything
  // into a claim.
  it('leaves a non-claim entity on the curation controls', async () => {
    mocks.entity = { id: 'entity-1', name: 'Something else', relations: [], values: [] };
    renderButtons();

    expect(await screen.findByText('1')).toBeInTheDocument();
    expect(screen.queryByText('67%')).not.toBeInTheDocument();
  });

  // Which *kind* of claim response is asked for stays a per-space question: the space passed in is
  // the one being responded in, and "Is factual" is a per-space value.
  it('reads the factual flag from the space it was asked to respond in', async () => {
    mocks.entity = claimEntity({ isFactualIn: BLOCK_SPACE });
    const view = renderButtons();

    await screen.findByText('67%');
    // Veracity draws chevrons, which are the only 16x16 icons among the response controls.
    const icons = [...view.container.querySelectorAll('svg')];
    expect(icons.some(icon => icon.getAttribute('viewBox') === '0 0 16 16')).toBe(true);
  });

  it('ignores a factual flag set in a space other than the one being responded in', async () => {
    mocks.entity = claimEntity({ isFactualIn: CLAIM_SPACE });
    const view = renderButtons();

    await screen.findByText('67%');
    const icons = [...view.container.querySelectorAll('svg')];
    expect(icons.some(icon => icon.getAttribute('viewBox') === '0 0 16 16')).toBe(false);
  });
});
