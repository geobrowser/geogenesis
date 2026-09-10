import { describe, expect, it } from 'vitest';

import { participantAvatarUrl } from './participant-avatars';

const SPACE = 'd077b06b40ed4eb994bfa71c3f6d1146';
const DASHED = 'd077b06b-40ed-4eb9-94bf-a71c3f6d1146';
const GRAPH = 'ipfs://QmGraphAvatar';
const SNAPSHOT = 'ipfs://QmGeoChatSnapshot';

/** A profile the graph actually answered for: it has a name, so its avatar is a real answer. */
const profiles = (entries: Array<[string, string | null]>) =>
  new Map(entries.map(([id, avatarUrl]) => [id, { name: 'Someone', avatarUrl }]));

/** What `fetchProfileBySpaceId` returns when the lookup fails or the space is unknown. */
const defaultProfiles = (ids: string[]) => new Map(ids.map(id => [id, { name: null, avatarUrl: null }]));

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

  // Review of GEO-2841. The graph is the source of truth in both directions: a profile that
  // resolved with a name has really told us this person has no avatar, so an avatar removed there
  // has to clear here too rather than leaving the old face up behind a snapshot forever.
  it('clears the avatar when a resolved profile has none', () => {
    const person = { profile_space_id: SPACE, avatar_cid: SNAPSHOT };

    expect(participantAvatarUrl(person, profiles([[SPACE, null]]))).toBeNull();
  });

  // But a failed lookup is not an answer. `fetchProfileBySpaceId` never rejects — a network error
  // and an unknown space both arrive as `defaultProfile`, with a null name and a null avatar — so
  // trusting every resolved null would blank a good snapshot on any upstream blip.
  it('keeps the snapshot when the lookup failed and returned a default profile', () => {
    const person = { profile_space_id: SPACE, avatar_cid: SNAPSHOT };

    expect(participantAvatarUrl(person, defaultProfiles([SPACE]))).toBe(SNAPSHOT);
  });

  // A real profile can carry an avatar without a name; the avatar still wins.
  it('uses a resolved avatar even when the profile has no name', () => {
    const person = { profile_space_id: SPACE, avatar_cid: SNAPSHOT };
    const nameless = new Map([[SPACE, { name: null, avatarUrl: GRAPH }]]);

    expect(participantAvatarUrl(person, nameless)).toBe(GRAPH);
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
