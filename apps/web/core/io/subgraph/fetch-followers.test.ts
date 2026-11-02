import { describe, expect, it } from 'vitest';

import { followerCountForViewer, followersForViewer } from '~/core/follows/use-follower-count';

import { followersQuery, readFollowers } from './fetch-followers';

const TOPIC_A = '0004ff1e-446e-4c22-a5a7-42163b21ef5b';
const TOPIC_B = '64dc796b3b2d41a29f904869d0b9e00a';
const ADA = '73a82967cb12f604f9589ac4bc8024cb';
const MARCUS = 'e1fbf3a014554cef945bdd49613b2a05';

describe('followersQuery', () => {
  it('reads Interested rows for each topic in one request, one alias each, plus the viewer', () => {
    const query = followersQuery([TOPIC_A, TOPIC_B], ADA);

    expect(query).toContain('t0: userVotesConnection');
    expect(query).toContain('t1: userVotesConnection');
    // Dashless, however the caller spelled the id.
    expect(query).toContain('objectId: "0004ff1e446e4c22a5a742163b21ef5b"');
    expect(query).toContain('nodes { userId spaceId }');
    // The viewer's follow as cast in their own space, and only that.
    expect(query).toContain(`userId: "${ADA}", spaceId: "${ADA}"`);
  });

  it('asks nothing about a viewer who is signed out', () => {
    expect(followersQuery([TOPIC_A])).not.toContain('v0:');
  });

  it('never reads Following relations, the old topic follow', () => {
    const query = followersQuery([TOPIC_A], ADA);

    expect(query).not.toContain('relationsConnection');
    expect(query).toContain('v0: userVotesConnection');
  });
});

describe('readFollowers', () => {
  it('counts a person once, however many Interested votes they hold on the topic', () => {
    // Cast in their own space and again in another: one follower.
    const followers = readFollowers(
      {
        totalCount: 3,
        nodes: [
          { userId: ADA, spaceId: ADA },
          { userId: ADA, spaceId: MARCUS },
          { userId: MARCUS, spaceId: MARCUS },
        ],
      },
      null
    );

    expect(followers.count).toBe(2);
  });

  it("ignores an Interested vote cast into someone else's space", () => {
    // The permissionless action takes any space, so a vote elsewhere could otherwise be stacked.
    const followers = readFollowers({ totalCount: 1, nodes: [{ userId: ADA, spaceId: MARCUS }] }, null);

    expect(followers.count).toBe(0);
  });

  it('reads the viewer from their own-space total', () => {
    expect(readFollowers({ totalCount: 0, nodes: [] }, { totalCount: 1 }).viewerIndexed).toBe(true);
    expect(readFollowers({ totalCount: 0, nodes: [] }, { totalCount: 0 }).viewerIndexed).toBe(false);
  });

  it("takes the server's total once there are more rows than were read", () => {
    const followers = readFollowers({ totalCount: 4200, nodes: [{ userId: ADA, spaceId: ADA }] }, null);

    expect(followers.count).toBe(4200);
  });

  it('reads a missing connection as no followers', () => {
    expect(readFollowers(null, null)).toEqual({ count: 0, viewerIndexed: false, followerIds: [] });
  });
});

describe('followerCountForViewer', () => {
  it('drops a viewer who held Interested in several spaces by exactly one when they unfollow', () => {
    // Copilot's case: the viewer's votes in two spaces must not count, or be subtracted, twice.
    const followers = readFollowers(
      {
        totalCount: 3,
        nodes: [
          { userId: ADA, spaceId: ADA },
          { userId: ADA, spaceId: MARCUS },
          { userId: MARCUS, spaceId: MARCUS },
        ],
      },
      { totalCount: 1 }
    );

    expect(followerCountForViewer(followers, true)).toBe(2);
    expect(followerCountForViewer(followers, false)).toBe(1);
  });

  it('adds the viewer as soon as they follow, before the indexer has them', () => {
    expect(followerCountForViewer({ count: 1, viewerIndexed: false, followerIds: [] }, true)).toBe(2);
  });

  it('does not count the viewer twice once the indexer catches up', () => {
    expect(followerCountForViewer({ count: 2, viewerIndexed: true, followerIds: [] }, true)).toBe(2);
  });

  it('drops the viewer as soon as they unfollow, while the indexer still has them', () => {
    expect(followerCountForViewer({ count: 2, viewerIndexed: true, followerIds: [] }, false)).toBe(1);
  });
});

describe('followersForViewer (GEO-3236)', () => {
  it('lists the viewer first as soon as they follow, before the indexer has them', () => {
    expect(followersForViewer({ count: 1, viewerIndexed: false, followerIds: [MARCUS] }, ADA, true)).toEqual({
      count: 2,
      ids: [ADA, MARCUS],
    });
  });

  it('takes the viewer out as soon as they unfollow, while the indexer still lists them', () => {
    expect(followersForViewer({ count: 2, viewerIndexed: true, followerIds: [ADA, MARCUS] }, ADA, false)).toEqual({
      count: 1,
      ids: [MARCUS],
    });
  });
});
