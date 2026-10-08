import { describe, expect, it } from 'vitest';

import { followerCountForViewer } from '~/core/topics/use-topic-follower-count';

import { readTopicFollowers, topicFollowersQuery } from './fetch-topic-followers';

const TOPIC_A = '0004ff1e-446e-4c22-a5a7-42163b21ef5b';
const TOPIC_B = '64dc796b3b2d41a29f904869d0b9e00a';
const ADA = '73a82967cb12f604f9589ac4bc8024cb';
const MARCUS = 'e1fbf3a014554cef945bdd49613b2a05';

describe('topicFollowersQuery', () => {
  it('asks for every topic in one request, one alias each', () => {
    const query = topicFollowersQuery([TOPIC_A, TOPIC_B], false);

    expect(query).toContain('t0: relationsConnection');
    expect(query).toContain('t1: relationsConnection');
    // Dashless, so the alias matches however the caller spelled the id.
    expect(query).toContain('"0004ff1e446e4c22a5a742163b21ef5b"');
    expect(query).toContain('typeId: { is: "f374b8f2d33148a3a220ba3648992e93" }');
  });

  it('reads Interested votes instead of relations with the flag on', () => {
    const query = topicFollowersQuery([TOPIC_A], true);

    expect(query).toContain('t0: userVotesConnection');
    expect(query).toContain('voteKind: 3, voteType: 0, objectType: 0');
    expect(query).not.toContain('relationsConnection');
  });
});

describe('readTopicFollowers', () => {
  it('counts a personal space once, however many rows it has', () => {
    const followers = readTopicFollowers(
      {
        totalCount: 3,
        nodes: [
          { fromEntityId: ADA, spaceId: ADA },
          { fromEntityId: ADA, spaceId: ADA },
          { fromEntityId: MARCUS, spaceId: MARCUS },
        ],
      },
      false
    );

    expect(followers).toEqual({ followerIds: [ADA, MARCUS], count: 2 });
  });

  it("ignores a Following relation written from someone else's entity", () => {
    // Anyone can write a relation *from* any entity into a space they control.
    const followers = readTopicFollowers({ totalCount: 1, nodes: [{ fromEntityId: ADA, spaceId: MARCUS }] }, false);

    expect(followers).toEqual({ followerIds: [], count: 0 });
  });

  it('counts Interested voters by user', () => {
    const followers = readTopicFollowers({ totalCount: 2, nodes: [{ userId: ADA }, { userId: MARCUS }] }, true);

    expect(followers).toEqual({ followerIds: [ADA, MARCUS], count: 2 });
  });

  it("takes the server's total once there are more rows than were read", () => {
    const followers = readTopicFollowers({ totalCount: 4200, nodes: [{ userId: ADA }] }, true);

    expect(followers.count).toBe(4200);
  });

  it('reads a missing connection as no followers', () => {
    expect(readTopicFollowers(null, true)).toEqual({ followerIds: [], count: 0 });
  });
});

describe('followerCountForViewer', () => {
  it('adds the viewer as soon as they follow, before the indexer has them', () => {
    expect(followerCountForViewer({ followerIds: [MARCUS], count: 1 }, ADA, true)).toBe(2);
  });

  it('does not count the viewer twice once the indexer catches up', () => {
    expect(followerCountForViewer({ followerIds: [ADA, MARCUS], count: 2 }, ADA, true)).toBe(2);
  });

  it('drops the viewer as soon as they unfollow, while the indexer still has them', () => {
    expect(followerCountForViewer({ followerIds: [ADA, MARCUS], count: 2 }, ADA, false)).toBe(1);
  });
});
