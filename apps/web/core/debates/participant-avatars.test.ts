import { describe, expect, it } from 'vitest';

import { participantAvatarUrl } from './participant-avatars';

const SPACE = 'd077b06b40ed4eb994bfa71c3f6d1146';
const DASHED = 'd077b06b-40ed-4eb9-94bf-a71c3f6d1146';
const GRAPH = 'ipfs://QmGraphAvatar';
const SNAPSHOT = 'ipfs://QmGeoChatSnapshot';

const profiles = (entries: Array<[string, string | null]>) =>
  new Map(entries.map(([id, avatarUrl]) => [id, { avatarUrl }]));

describe('participantAvatarUrl', () => {
  // The reported bug: geo-chat never learned about an avatar uploaded after it first saw the
  // person, so the People tab drew a placeholder for a face the profile page renders fine.
  it('uses the graph avatar when geo-chat has no snapshot', () => {
    const person = { profile_space_id: SPACE, avatar_cid: null };

    expect(participantAvatarUrl(person, profiles([[SPACE, GRAPH]]))).toBe(GRAPH);
  });

  // The graph is the source of truth, so it also wins a disagreement — that is what makes a
  // changed avatar propagate rather than staying pinned to whatever geo-chat cached.
  it('prefers the graph avatar over a stale snapshot', () => {
    const person = { profile_space_id: SPACE, avatar_cid: SNAPSHOT };

    expect(participantAvatarUrl(person, profiles([[SPACE, GRAPH]]))).toBe(GRAPH);
  });

  // Falling back rather than blanking is the whole reason the snapshot is kept: the graph lookup
  // is a round trip, and a correct avatar must not disappear while it is in flight.
  it('falls back to the snapshot while the profile is unresolved', () => {
    const person = { profile_space_id: SPACE, avatar_cid: SNAPSHOT };

    expect(participantAvatarUrl(person, profiles([]))).toBe(SNAPSHOT);
  });

  it('falls back to the snapshot when the graph resolved no avatar', () => {
    const person = { profile_space_id: SPACE, avatar_cid: SNAPSHOT };

    expect(participantAvatarUrl(person, profiles([[SPACE, null]]))).toBe(SNAPSHOT);
  });

  // geo-chat and the graph agree on the id but not always on its spelling.
  it('matches a dashed space id against the normalized profile map', () => {
    const person = { profile_space_id: DASHED, avatar_cid: null };

    expect(participantAvatarUrl(person, profiles([[SPACE, GRAPH]]))).toBe(GRAPH);
  });

  it('returns null when neither source has anything, so Avatar draws its generated fallback', () => {
    expect(participantAvatarUrl({ profile_space_id: SPACE, avatar_cid: null }, profiles([]))).toBeNull();
  });

  // A party slot can be empty, and a live-call row can render before its participant arrives.
  it('tolerates a missing participant', () => {
    expect(participantAvatarUrl(null, profiles([[SPACE, GRAPH]]))).toBeNull();
    expect(participantAvatarUrl(undefined, profiles([[SPACE, GRAPH]]))).toBeNull();
  });

  it('still uses the snapshot when the row carries no space id to resolve', () => {
    expect(participantAvatarUrl({ profile_space_id: null, avatar_cid: SNAPSHOT }, profiles([]))).toBe(SNAPSHOT);
  });

  // An unparseable id must not key into the map — `validateSpaceId` returns null and the snapshot
  // stands, rather than a lookup on a bad key quietly returning someone else's face.
  it('ignores a malformed space id', () => {
    expect(participantAvatarUrl({ profile_space_id: 'not-a-space', avatar_cid: SNAPSHOT }, profiles([]))).toBe(
      SNAPSHOT
    );
  });
});
