import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { interestedTopicIds } from '~/core/topics/interested';

import { fetchInterestedTopics, interestedTopicsQuery, interestedTopicsQueryKey } from './fetch-interested-topics';

const graphqlMock = vi.hoisted(() => vi.fn());
vi.mock('~/core/environment', () => ({
  Environment: { getConfig: () => ({ api: 'https://example.com/graphql' }) },
}));
vi.mock('./graphql', () => ({ graphql: (...args: unknown[]) => graphqlMock(...args) }));

const VIEWER = '11111111111111111111111111111111';
const TOPIC = '5ef5a5860f274d8e8f6c59ae5b3e89e2';
const ADA_SPACE = '73a82967cb12f604f9589ac4bc8024cb';

describe('Interested topics query', () => {
  it('reads only held Interested (kind 3, type 0) on entities, with the space each was cast in', () => {
    const query = interestedTopicsQuery('personal-space', null);

    expect(query).toContain('userVotesConnection(');
    expect(query).toContain('condition: { userId: "personal-space", voteKind: 3, voteType: 0, objectType: 0 }');
    expect(query).toContain('nodes { objectId spaceId }');
    expect(query).toContain('after: null');
    expect(query).toContain('pageInfo { hasNextPage endCursor }');
  });

  it('passes the cursor for later pages', () => {
    expect(interestedTopicsQuery('personal-space', 'abc')).toContain('after: "abc"');
  });

  it('keys dashed and dashless spellings of a space to one cache entry', () => {
    expect(interestedTopicsQueryKey('11111111-1111-1111-1111-111111111111')).toEqual(
      interestedTopicsQueryKey('11111111111111111111111111111111')
    );
  });
});

describe('fetchInterestedTopics (GEO-3236)', () => {
  it('marks a follow on a personal space as a person, and anything else as a topic', async () => {
    graphqlMock.mockReset();
    graphqlMock.mockImplementation(({ query }: { query: string }) =>
      query.includes('userVotesConnection')
        ? Effect.succeed({
            userVotesConnection: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                { objectId: TOPIC, spaceId: VIEWER },
                { objectId: ADA_SPACE, spaceId: VIEWER },
              ],
            },
          })
        : Effect.succeed({ spaces: [{ id: ADA_SPACE, type: 'PERSONAL' }] })
    );

    const rows = await fetchInterestedTopics(VIEWER);

    expect(rows).toEqual([
      { objectId: TOPIC, spaceId: VIEWER, kind: 'topic' },
      { objectId: ADA_SPACE, spaceId: VIEWER, kind: 'person' },
    ]);
  });
});

describe('interestedTopicIds by kind', () => {
  const rows = [
    { objectId: TOPIC, kind: 'topic' as const },
    { objectId: ADA_SPACE, kind: 'person' as const },
    // Read before follows had kinds: a topic, which is all Interested was then.
    { objectId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  ];

  it('keeps people out of the followed topics, which For you sends as topic ids', () => {
    expect([...interestedTopicIds(rows, 'topic')]).toEqual([TOPIC, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
  });

  it('reads the people on their own, and everything together', () => {
    expect([...interestedTopicIds(rows, 'person')]).toEqual([ADA_SPACE]);
    expect(interestedTopicIds(rows).size).toBe(3);
  });
});
