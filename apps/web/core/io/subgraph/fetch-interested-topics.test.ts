import { describe, expect, it } from 'vitest';

import { interestedTopicsQuery, interestedTopicsQueryKey } from './fetch-interested-topics';

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
