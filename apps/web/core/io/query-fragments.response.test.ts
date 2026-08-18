import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import {
  claimResponseSummariesQuery,
  entityRespondersQuery,
  entityResponseCountsQuery,
  userEntityResponseQuery,
} from './query-fragments';

describe('entity response query fragments', () => {
  it('reads counts for one exact object, space, and vote kind', () => {
    const query = print(entityResponseCountsQuery);

    expect(query).toContain('votesCountByObjectIdAndObjectTypeAndSpaceIdAndVoteKind');
    expect(query).toContain('spaceId: $spaceId');
    expect(query).toContain('voteKind: $voteKind');
    expect(query).toContain('positive');
    expect(query).toContain('negative');
  });

  it('reads the current user response for one exact kind', () => {
    const query = print(userEntityResponseQuery);

    expect(query).toContain('userVoteByUserIdAndObjectIdAndObjectTypeAndSpaceIdAndVoteKind');
    expect(query).toContain('spaceId: $spaceId');
    expect(query).toContain('voteKind: $voteKind');
  });

  it('scopes responders by space and vote kind', () => {
    const query = print(entityRespondersQuery);

    expect(query).toContain('condition:');
    expect(query).toContain('spaceId: $spaceId');
    expect(query).toContain('voteKind: $voteKind');
  });

  it('reads one deterministic page of response summaries for exact claim and kind filters', () => {
    const query = print(claimResponseSummariesQuery);

    expect(query).toContain('query ClaimResponseSummaries($filter: UserVoteFilter!, $first: Int!, $offset: Int!)');
    expect(query).toContain('filter: $filter');
    expect(query).toContain('first: $first');
    expect(query).toContain('offset: $offset');
    expect(query).toContain('orderBy: [OBJECT_ID_ASC, VOTE_KIND_ASC, USER_ID_ASC]');
    expect(query).toContain('userId');
    expect(query).toContain('objectId');
    expect(query).toContain('voteType');
    expect(query).toContain('voteKind');
  });
});
