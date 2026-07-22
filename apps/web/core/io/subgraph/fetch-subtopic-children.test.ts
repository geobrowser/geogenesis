import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SUBTOPIC_RELATION_TYPE_ID } from '~/core/constants';

import { fetchSubtopicChildren } from './fetch-subtopic-children';

const graphqlMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({
      api: 'https://example.com/graphql',
      bundler: '',
      chainId: '19411',
      rpc: '',
    }),
  },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

describe('fetchSubtopicChildren', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('returns subtopic children scoped to the space', async () => {
    graphqlMock.mockImplementation(({ query }: { query: string }) => {
      expect(query).toContain(SUBTOPIC_RELATION_TYPE_ID);
      expect(query).toContain('spaceId: { is: "00000000-0000-0000-0000-000000000999" }');

      return Effect.succeed({
        entity: {
          subtopics: {
            nodes: [
              { id: 'rel-bb', toEntity: { id: '00000000-0000-0000-0000-0000000000bb', name: 'Beta' } },
              { id: 'rel-aa', toEntity: { id: '00000000-0000-0000-0000-0000000000aa', name: 'Alpha' } },
              { id: 'rel-null', toEntity: null },
            ],
          },
        },
      });
    });

    const result = await fetchSubtopicChildren(
      '00000000-0000-0000-0000-0000000000aa',
      '00000000-0000-0000-0000-000000000999'
    );

    expect(result).toEqual([
      { id: '00000000-0000-0000-0000-0000000000aa', name: 'Alpha', relationId: 'rel-aa' },
      { id: '00000000-0000-0000-0000-0000000000bb', name: 'Beta', relationId: 'rel-bb' },
    ]);
  });

  it('rejects invalid entity ids', async () => {
    await expect(fetchSubtopicChildren('not-an-id', '00000000-0000-0000-0000-000000000999')).rejects.toThrow(
      'Invalid entity ID'
    );
  });
});
