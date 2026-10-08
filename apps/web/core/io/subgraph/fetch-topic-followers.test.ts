import { describe, expect, it } from 'vitest';

import { followerCountForViewer } from '~/core/topics/use-topic-follower-count';

import { readTopicFollowers, topicFollowersQuery } from './fetch-topic-followers';

const TOPIC_A = '0004ff1e-446e-4c22-a5a7-42163b21ef5b';
const TOPIC_B = '64dc796b3b2d41a29f904869d0b9e00a';
const ADA = '73a82967cb12f604f9589ac4bc8024cb';
const MARCUS = 'e1fbf3a014554cef945bdd49613b2a05';

describe('topicFollowersQuery', () => {
  it('counts Interested votes with totals only, one alias per topic, plus the viewer', () => {
    const query = topicFollowersQuery([TOPIC_A, TOPIC_B], true, ADA);

    expect(query).toContain('t0: userVotesConnection');
    expect(query).toContain('t1: userVotesConnection');
    // Dashless, however the caller spelled the id.
    expect(query).toContain('objectId: "0004ff1e446e4c22a5a742163b21ef5b"');
    expect(query).toContain(
      `v0: userVotesConnection(condition: { objectId: "0004ff1e446e4c22a5a742163b21ef5b", userId: "${ADA}"`
    );
    // Totals, never the rows: a feed of popular topics would otherwise download every follower.
    expect(query).not.toContain('nodes');
  });

  it('asks nothing about a viewer who is signed out', () => {
    expect(topicFollowersQuery([TOPIC_A], true)).not.toContain('v0:');
  });

  it('reads Following relations with the flag off', () => {
    const query = topicFollowersQuery([TOPIC_A], false, ADA);

    expect(query).toContain('t0: relationsConnection');
    expect(query).toContain('typeId: { is: "f374b8f2d33148a3a220ba3648992e93" }');
    expect(query).not.toContain('userVotesConnection');
  });
});

describe('readTopicFollowers', () => {
  it('takes the Interested total, and the viewer from their own count', () => {
    expect(readTopicFollowers({ totalCount: 42 }, { totalCount: 1 }, ADA)).toEqual({ count: 42, viewerIndexed: true });
    expect(readTopicFollowers({ totalCount: 42 }, { totalCount: 0 }, ADA)).toEqual({ count: 42, viewerIndexed: false });
  });

  it('counts a personal space once, however many Following rows it has', () => {
    const followers = readTopicFollowers(
      {
        totalCount: 3,
        nodes: [
          { fromEntityId: ADA, spaceId: ADA },
          { fromEntityId: ADA, spaceId: ADA },
          { fromEntityId: MARCUS, spaceId: MARCUS },
        ],
      },
      null,
      ADA
    );

    expect(followers).toEqual({ count: 2, viewerIndexed: true });
  });

  it("ignores a Following relation written from someone else's entity", () => {
    // Anyone can write a relation *from* any entity into a space they control.
    const followers = readTopicFollowers({ totalCount: 1, nodes: [{ fromEntityId: ADA, spaceId: MARCUS }] }, null, ADA);

    expect(followers).toEqual({ count: 0, viewerIndexed: false });
  });

  it("takes the server's total once there are more Following rows than were read", () => {
    const followers = readTopicFollowers({ totalCount: 4200, nodes: [{ fromEntityId: ADA, spaceId: ADA }] }, null);

    expect(followers.count).toBe(4200);
  });

  it('reads a missing connection as no followers', () => {
    expect(readTopicFollowers(null, null, ADA)).toEqual({ count: 0, viewerIndexed: false });
  });
});

describe('followerCountForViewer', () => {
  it('adds the viewer as soon as they follow, before the indexer has them', () => {
    expect(followerCountForViewer({ count: 1, viewerIndexed: false }, true)).toBe(2);
  });

  it('does not count the viewer twice once the indexer catches up', () => {
    expect(followerCountForViewer({ count: 2, viewerIndexed: true }, true)).toBe(2);
  });

  it('drops the viewer as soon as they unfollow, while the indexer still has them', () => {
    expect(followerCountForViewer({ count: 2, viewerIndexed: true }, false)).toBe(1);
  });
});
