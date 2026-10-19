import * as Effect from 'effect/Effect';
import { type DocumentNode, print } from 'graphql';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { graphql } from './graphql-client';
import { getDebateVoteEntities } from './queries';

vi.mock('./graphql-client', () => ({
  graphql: vi.fn(),
}));

const graphqlMock = graphql as unknown as Mock;

const DEBATE_ID = '00000000000000000000000000000d0e';
const SPACE_ID = '00000000000000000000000000000003';

function voteId(index: number) {
  return index.toString(16).padStart(32, '0');
}

function voteNode(id: string) {
  return {
    id,
    name: null,
    description: null,
    spaceIds: [SPACE_ID],
    types: [],
    valuesList: [],
    relationsList: [],
    createdAt: '2026-10-19T12:00:00.000Z',
    updatedAt: '2026-10-19T12:00:00.000Z',
  };
}

function operationName(query: DocumentNode) {
  return print(query).match(/query (\w+)/)?.[1];
}

/**
 * The graph as it behaves: offsets past 1000 are rejected, and `entities` without `first` returns
 * at most 100 rows. Answers both the old offset-paged backlinks list and the cursor connection.
 */
function fakeGraph(backlinkSourceIds: string[]) {
  graphqlMock.mockImplementation(({ query, decoder, variables }) => {
    const name = operationName(query);

    if (name === 'DebateVoteBacklinksPage') {
      if (variables.offset !== undefined) {
        if (variables.offset > 1000) {
          return Effect.fail(
            new Error(`Pagination argument "offset" cannot exceed 1000; received ${variables.offset}`)
          );
        }
        const rows = backlinkSourceIds.slice(variables.offset, variables.offset + variables.first);
        return Effect.succeed(decoder({ entity: { backlinksList: rows.map(id => ({ fromEntity: { id } })) } }));
      }
      const start = variables.after ? Number(variables.after) : 0;
      const end = start + variables.first;
      return Effect.succeed(
        decoder({
          entity: {
            backlinks: {
              pageInfo: { hasNextPage: end < backlinkSourceIds.length, endCursor: String(end) },
              nodes: backlinkSourceIds.slice(start, end).map(id => ({ fromEntity: { id } })),
            },
          },
        })
      );
    }

    if (name === 'EntitiesBatchForDebateVotes') {
      const ids: string[] = variables.filter.id.in;
      return Effect.succeed(decoder({ entities: ids.slice(0, 100).map(voteNode) }));
    }

    throw new Error(`Unexpected query ${name}`);
  });
}

describe('getDebateVoteEntities', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('loads every vote on a debate with more than 2,000 of them', async () => {
    const votes = Array.from({ length: 2_500 }, (_, index) => voteId(index + 1));
    // A vote linking from a second space shows up twice in the backlinks.
    fakeGraph([...votes.slice(0, 1_200), votes[0]!, ...votes.slice(1_200)]);

    const entities = await Effect.runPromise(getDebateVoteEntities(DEBATE_ID));

    expect(entities).toHaveLength(2_500);
    expect(new Set(entities.map(entity => entity.id))).toEqual(new Set(votes));
  });

  it('asks the backlinks connection for vote sources with cursors', async () => {
    fakeGraph([voteId(1)]);

    await Effect.runPromise(getDebateVoteEntities(DEBATE_ID));

    const page = graphqlMock.mock.calls[0]?.[0];
    expect(page.variables).toMatchObject({ id: DEBATE_ID, first: 1000, after: undefined });
    expect(print(page.query)).toContain('backlinks(');
    expect(print(page.query)).not.toContain('offset');
  });
});
