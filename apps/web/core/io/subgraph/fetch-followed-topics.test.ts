import { describe, expect, it } from 'vitest';

import { FOLLOWING_PROPERTY } from '~/core/topics/ontology';

import { followedTopicsQuery, followedTopicsQueryKey } from './fetch-followed-topics';

describe('followed topics query', () => {
  it('scopes reads to follows authored by the personal space in its own space', () => {
    const query = followedTopicsQuery('personal-space', null);

    expect(query).toContain(`typeId: { is: "${FOLLOWING_PROPERTY}" }`);
    expect(query).toContain('fromEntityId: { is: "personal-space" }');
    expect(query).toContain('spaceId: { is: "personal-space" }');
    expect(query).toContain('after: null');
    expect(query).toContain('pageInfo { hasNextPage endCursor }');
  });

  it('passes the cursor for later pages', () => {
    expect(followedTopicsQuery('personal-space', 'abc')).toContain('after: "abc"');
  });

  it('keys dashed and dashless spellings of a space to one cache entry', () => {
    expect(followedTopicsQueryKey('11111111-1111-1111-1111-111111111111')).toEqual(
      followedTopicsQueryKey('11111111111111111111111111111111')
    );
  });
});
