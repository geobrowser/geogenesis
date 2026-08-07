import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { entityRespondersQuery, entityResponseCountsQuery, userEntityResponseQuery } from './query-fragments';

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
});
