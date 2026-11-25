import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GraphFilter } from '~/core/graph-explorer/graph-filter';

import { TopicOverview } from './panel-sections';

// The real useTopicClaimsSummary, re-summarising on every count-cache update; only the fetch is stood in.
const SEED: Record<string, [number, number]> = { a: [3, 1], b: [6, 4], c: [5, 0], d: [4, 0] };
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: null, isLoading: false, isRegistered: false }),
}));
vi.mock('~/core/graph-explorer/topic-claims-summary', async () => {
  const actual = await vi.importActual<typeof import('~/core/graph-explorer/topic-claims-summary')>(
    '~/core/graph-explorer/topic-claims-summary'
  );
  return {
    ...actual,
    fetchTopicClaims: async ({ queryClient }: { queryClient: QueryClient }) => {
      const claims = Object.keys(SEED).map(id => ({ id, name: `Claim ${id}`, spaceId: 's' }));
      for (const claim of claims) {
        const [positive, negative] = SEED[claim.id];
        queryClient.setQueryData(actual.claimCountsKey(claim), { positive, negative });
      }
      return { claims, truncated: false, counts: {} };
    },
  };
});
vi.mock('~/core/claims/browse/claim-response-summary', async () => {
  const { useQuery } = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  const { entityResponseCountsQueryKey: key } = await vi.importActual<
    typeof import('~/core/responses/entity-response')
  >('~/core/responses/entity-response');
  return {
    CLAIM_RESPONSE_OBJECT_TYPE: 0,
    useClaimResponseSummary: (entityId: string, spaceId: string) => {
      const { data } = useQuery<{ positive: number; negative: number }>({
        queryKey: key(entityId, spaceId, 0, 'stance'),
        enabled: false,
      });
      return { hasCounts: !!data, isLoading: false, positive: data?.positive ?? 0, negative: data?.negative ?? 0 };
    },
  };
});
// A Disagree vote whose read-back lands in the shared count cache.
vi.mock('~/partials/entity-page/entity-vote-buttons', async () => {
  const { useQueryClient } = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  const { entityResponseCountsQueryKey: key } = await vi.importActual<
    typeof import('~/core/responses/entity-response')
  >('~/core/responses/entity-response');
  return {
    EntityVoteButtons: ({ entityId, spaceId }: { entityId: string; spaceId: string }) => {
      const client = useQueryClient();
      return (
        <button
          type="button"
          aria-label="Disagree"
          onClick={() =>
            client.setQueryData(
              key(entityId, spaceId, 0, 'stance'),
              (old?: { positive: number; negative: number }) => ({
                positive: old?.positive ?? 0,
                negative: (old?.negative ?? 0) + 1,
              })
            )
          }
        />
      );
    },
  };
});

const filter = { kinds: [], spaceSource: 'topic' } as unknown as GraphFilter;
const rows = (name: string) =>
  within(screen.getByRole('region', { name }))
    .getAllByRole('listitem')
    .map(item => item.textContent);

afterEach(cleanup);

describe('TopicOverview over the live summary', () => {
  it('keeps its lists and order while a vote moves a claim, updating the row in place', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TopicOverview topicId="t" filter={filter} topicSpaceId={null} selection={null} nodes={[]} onOpen={vi.fn()} />
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(rows('Widely agreed, most votes')).toEqual(['Claim c100% agree', 'Claim a75% agree', 'Claim d100% agree'])
    );
    expect(rows('The biggest fights')).toEqual(['Claim b60% agree']);
    const agreed = screen.getByRole('region', { name: 'Widely agreed, most votes' });
    const disagree = (row: number) =>
      fireEvent.click(within(within(agreed).getAllByRole('listitem')[row]).getByRole('button', { name: 'Disagree' }));

    // 3/1 agreed becomes 3/2 contested: the row stays in its list and its line and swatch update.
    disagree(1);
    await waitFor(() => expect(rows('Widely agreed, most votes')[1]).toBe('Claim a60% agree'));
    expect(rows('The biggest fights')).toEqual(['Claim b60% agree']);

    // 4/0 becomes 4/2, the most votes in the list: it keeps its place.
    disagree(2);
    disagree(2);
    await waitFor(() =>
      expect(rows('Widely agreed, most votes')).toEqual(['Claim c100% agree', 'Claim a60% agree', 'Claim d67% agree'])
    );
  });
});
