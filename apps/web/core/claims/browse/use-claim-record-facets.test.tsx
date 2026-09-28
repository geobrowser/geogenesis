import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { claimRecordFilters } from './claim-record-query';
import { useClaimRecordFacets } from './use-claim-record-facets';

const mocks = vi.hoisted(() => ({ graphql: vi.fn(), getEntityNames: vi.fn() }));

vi.mock('~/core/io/graphql-client', () => ({ graphql: mocks.graphql }));
vi.mock('~/core/io/queries', () => ({ getEntityNames: mocks.getEntityNames }));

const CLAIM = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_SPACE = 'cccccccccccccccccccccccccccccccc';
const SOURCE_TOPIC = 'dddddddddddddddddddddddddddddddd';
const SELECTED_TOPIC = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const FACET_TOPIC = 'ffffffffffffffffffffffffffffffff';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.graphql.mockReset();
  mocks.getEntityNames.mockReset();
  mocks.graphql.mockImplementation(({ decoder, variables }) => {
    const isTopic = variables.groupBy[0] === 'TO_ENTITY_ID';
    return Effect.succeed(
      decoder({
        relationsConnection: {
          groupedAggregates: [
            {
              keys: [isTopic ? FACET_TOPIC : SPACE],
              distinctCount: { fromEntityId: isTopic ? '3' : '7' },
            },
          ],
        },
      })
    );
  });
  mocks.getEntityNames.mockReturnValue(Effect.succeed([{ id: FACET_TOPIC, name: 'A corpus topic' }]));
});

describe('useClaimRecordFacets', () => {
  it('asks separate full-corpus space and topic aggregates for Related claims', async () => {
    const { result } = renderHook(
      () =>
        useClaimRecordFacets({
          kind: 'claims',
          claimId: CLAIM,
          allSpaceIds: [SPACE, OTHER_SPACE],
          selectedSpaceIds: [SPACE],
          sourceTopicIds: [SOURCE_TOPIC],
          selectedTopicIds: [SELECTED_TOPIC],
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.facetsSettled).toBe(true));
    await waitFor(() => expect(result.current.claimTopics[0]?.name).toBe('A corpus topic'));

    expect(result.current.claimSpaces).toEqual([{ id: SPACE, count: 7 }]);
    expect(result.current.claimTopics).toEqual([{ id: FACET_TOPIC, count: 3, name: 'A corpus topic' }]);

    const calls = mocks.graphql.mock.calls.map(([options]) => options);
    const spaceCall = calls.find(options => options.variables.groupBy[0] === 'SPACE_ID');
    const topicCall = calls.find(options => options.variables.groupBy[0] === 'TO_ENTITY_ID');
    expect(spaceCall.variables.filter).toEqual(
      claimRecordFilters({
        claimId: CLAIM,
        spaceIds: [SPACE, OTHER_SPACE],
        topicIds: [SOURCE_TOPIC],
        filterTopicIds: [SELECTED_TOPIC],
      }).claimRelations
    );
    expect(topicCall.variables.filter).toEqual(
      claimRecordFilters({
        claimId: CLAIM,
        spaceIds: [SPACE],
        topicIds: [SOURCE_TOPIC],
        filterTopicIds: [SELECTED_TOPIC],
      }).claimTopicRelations
    );
  });

  it('asks only for the complete Debates space facet', async () => {
    const { result } = renderHook(
      () =>
        useClaimRecordFacets({
          kind: 'debates',
          claimId: CLAIM,
          allSpaceIds: [SPACE, OTHER_SPACE],
          selectedSpaceIds: [SPACE],
          sourceTopicIds: [SOURCE_TOPIC],
          selectedTopicIds: [],
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.facetsSettled).toBe(true));

    expect(result.current.debateSpaces).toEqual([{ id: SPACE, count: 7 }]);
    expect(mocks.graphql).toHaveBeenCalledTimes(1);
    expect(mocks.graphql.mock.calls[0][0].variables).toEqual({
      filter: claimRecordFilters({
        claimId: CLAIM,
        spaceIds: [SPACE, OTHER_SPACE],
        topicIds: [SOURCE_TOPIC],
        filterTopicIds: [],
      }).debateRelations,
      groupBy: ['SPACE_ID'],
    });
    expect(mocks.getEntityNames).not.toHaveBeenCalled();
  });
});
