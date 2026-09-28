import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HIDDEN_FROM_PROFILE_PROPERTY } from '~/core/profile/profile-debate-visibility';

import { fetchPersonDebates } from './fetch-person-debates';

const graphqlMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: { getConfig: () => ({ api: 'https://example.com/graphql' }) },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

describe('fetchPersonDebates', () => {
  beforeEach(() => graphqlMock.mockReset());

  it('annotates participated debates with hide rows authored in this personal space', async () => {
    graphqlMock.mockReturnValue(
      Effect.succeed({
        supported: {
          nodes: [
            {
              typeId: 'supported',
              spaceId: 'debate-space',
              fromEntity: { id: 'debate-1', name: 'Debate one', createdAt: '20' },
            },
          ],
        },
        opposed: {
          nodes: [
            {
              typeId: 'opposed',
              spaceId: 'debate-space',
              fromEntity: { id: 'debate-2', name: 'Debate two', createdAt: '10' },
            },
          ],
        },
        hidden: {
          nodes: [
            { id: 'hide-1', spaceId: 'space-1', toEntityId: 'debate-1' },
            { id: 'hide-2', spaceId: 'space-1', toEntityId: 'DEBATE-1' },
          ],
        },
      })
    );

    const debates = await fetchPersonDebates('space-1');
    const query = (graphqlMock.mock.calls[0]?.[0] as { query: string }).query;

    expect(query).toContain(HIDDEN_FROM_PROFILE_PROPERTY);
    expect(query).toContain('fromEntityId: { is: "space-1" }');
    expect(query).toContain('spaceId: { is: "space-1" }');
    expect(debates.map(debate => debate.id)).toEqual(['debate-1', 'debate-2']);
    expect(debates[0]?.hiddenRelations.map(relation => relation.id)).toEqual(['hide-1', 'hide-2']);
    expect(debates[1]?.hiddenRelations).toEqual([]);
  });
});
