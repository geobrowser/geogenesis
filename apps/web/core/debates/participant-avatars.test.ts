import { describe, expect, it } from 'vitest';

import { participantAvatarUrl, withRowParticipantAvatars } from './participant-avatars';

const SPACE = 'd077b06b40ed4eb994bfa71c3f6d1146';
const DASHED = 'd077b06b-40ed-4eb9-94bf-a71c3f6d1146';
const GRAPH = 'ipfs://QmGraphAvatar';
const SNAPSHOT = 'ipfs://QmGeoChatSnapshot';

/** A profile the API answered for. `apiProfileToProfile` always sets `profileLink`. */
const profiles = (entries: Array<[string, string | null]>) =>
  new Map(entries.map(([id, avatarUrl]) => [id, { profileLink: `/space/${id}`, avatarUrl }]));

/** What the batch loader substitutes when the request fails, decodes badly, or returns no row. */
const defaultProfiles = (ids: string[]) => new Map(ids.map(id => [id, { profileLink: null, avatarUrl: null }]));

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
    const nameless = new Map([[SPACE, { profileLink: `/space/${SPACE}`, avatarUrl: GRAPH }]]);

    expect(participantAvatarUrl(person, nameless)).toBe(GRAPH);
  });

  // Second review of GEO-2841. The batch loader maps a returned profile as-is — it does not collapse
  // a nameless one into a default the way the single-id path does — so a name is not a reliable
  // "found" signal. Keying on it left an account with no display name showing its old snapshot
  // forever once the avatar was removed. `profileLink` is set by the mapper and never by the
  // default, which is what makes it the honest one.
  it('clears the avatar for a resolved profile that has no name either', () => {
    const person = { profile_space_id: SPACE, avatar_cid: SNAPSHOT };
    const namelessAndAvatarless = new Map([[SPACE, { profileLink: `/space/${SPACE}`, avatarUrl: null }]]);

    expect(participantAvatarUrl(person, namelessAndAvatarless)).toBeNull();
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

/**
 * The crash this helper exists to make impossible. `participants` is typed as present on every
 * payload that carries it, and geo-chat does not always send one — a partially seeded debate
 * arrives without it, and the browse feed threw on `.map` as soon as the query resolved.
 */
describe('withRowParticipantAvatars', () => {
  const identity = <T>(participant: T) => participant;

  it('leaves a row whose participants are missing exactly as it found it', () => {
    const row = { id: 'debate-1' } as { id: string; participants?: never[] };

    expect(() => withRowParticipantAvatars(row, identity)).not.toThrow();
    expect(withRowParticipantAvatars(row, identity)).toBe(row);
  });

  it('maps the participants when there are some', () => {
    const row = { id: 'debate-1', participants: [{ profile_space_id: SPACE, avatar_cid: null }] };
    const stamp = <T extends { avatar_cid?: string | null }>(participant: T) => ({ ...participant, avatar_cid: GRAPH });

    expect(withRowParticipantAvatars(row, stamp).participants).toEqual([
      { profile_space_id: SPACE, avatar_cid: GRAPH },
    ]);
  });

  // An empty list is a real answer, not a missing one, and must not be confused with absence.
  it('keeps an empty participant list empty', () => {
    const row = { id: 'debate-1', participants: [] };

    expect(withRowParticipantAvatars(row, identity).participants).toEqual([]);
  });
});
