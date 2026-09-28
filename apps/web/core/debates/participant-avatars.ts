'use client';

import * as React from 'react';

import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { validateSpaceId } from '~/core/io/rest/validation';

/**
 * Avatars for the people geo-chat tells us about.
 *
 * Every geo-chat row naming a person carries an `avatar_cid`, and the debates panes render it
 * directly. That field is a snapshot geo-chat took of the profile, not the profile: upload an
 * avatar after geo-chat first learned about you and the snapshot stays null, so the People tab
 * drew a generated placeholder for someone whose photo the app renders correctly on their own
 * profile page two panes away (GEO-2841).
 *
 * The graph is the source of truth — `/profile/space/:spaceId` answers with the avatar the profile
 * page itself draws — and every non-debates surface already reads it through `useProfilesBySpaceIds`.
 * This is that lookup, keyed off the `profile_space_id` these rows already carry for their profile
 * links.
 *
 * Applied in the data hooks rather than in the components that draw the faces. The rows fan out to
 * a dozen surfaces — a dialog, a live call, three tabs of the hub — and resolving per surface would
 * put a profile fetch inside presentational leaves, repeat the lookup once per rendered face, and
 * still miss whichever surface was added next. Enriching where the rows enter the app fixes every
 * consumer at once and leaves them untouched.
 *
 * The snapshot stays as the fallback rather than being dropped. It is right far more often than it
 * is wrong, it is in hand on first paint, and the graph lookup is a round trip — so falling back
 * means a correct avatar never blanks while the profile resolves, and a person the graph cannot
 * resolve keeps whatever geo-chat had for them.
 */
export type ParticipantAvatarSource = {
  profile_space_id?: string | null;
  avatar_cid?: string | null;
};

type ProfileLike = { profileLink?: string | null; avatarUrl?: string | null };

/**
 * Ids are normalized on both sides. geo-chat and the graph agree on the value but not always on the
 * spelling — one may carry dashes — and `validateSpaceId` is what the profile links beside these
 * avatars already run them through, so a row that can link to a profile can resolve one.
 *
 * Three outcomes, not two, because "the graph says no avatar" and "the graph could not answer" are
 * different facts that arrive looking alike. The batch loader never rejects: a failed request, a
 * decode failure and an id the API returned nothing for all come back as `defaultProfile`, which
 * carries nulls in every field. Treating every resolved null as authoritative would therefore blank
 * a perfectly good snapshot on any upstream blip.
 *
 * `profileLink` is what separates them. `apiProfileToProfile` always sets it and `defaultProfile`
 * never does — where a *name* is merely usually present, so keying on that left a nameless account
 * stuck on its old snapshot after removing an avatar. A profile the API answered for is a real
 * answer, so its avatar is trusted including its absence, which is what lets a removal propagate
 * here. Anything else falls back.
 *
 * This holds only because the cache behind it holds one kind of value. `profileBySpaceIdQueryKey`
 * has three writers, and `useGeoProfile` used to seed it from the *address* endpoint, which
 * collapses a real-but-empty profile into `defaultProfile` — a found profile wearing a
 * not-found shape, which this would then read as absent. That seed is now skipped at the source.
 * A reader cannot defend itself against a lossy write; the write had to stop.
 */
export function participantAvatarUrl(
  participant: ParticipantAvatarSource | null | undefined,
  profilesBySpaceId: Map<string, ProfileLike>
): string | null {
  const spaceId = participant?.profile_space_id ? validateSpaceId(participant.profile_space_id) : null;
  const profile = spaceId ? profilesBySpaceId.get(spaceId) : undefined;

  if (profile?.avatarUrl) return profile.avatarUrl;
  if (profile?.profileLink) return null;

  return participant?.avatar_cid ?? null;
}

/** Preserves each call site's own participant type; see `useParticipantAvatars`. */
export type ParticipantAvatarMapper = <T extends ParticipantAvatarSource>(participant: T) => T;

/**
 * Applies the mapper to a row's `participants`, tolerating its absence.
 *
 * Every payload here types `participants` as present, and geo-chat does not always send it — a
 * partially seeded debate arrives without one, and mapping it unguarded throws the moment the query
 * resolves. Leaving each call site to remember that is a rule that gets forgotten: it already was
 * once here, on a line a reformat had moved out from under the edit that was meant to guard it.
 * This is the rule written down once instead.
 */
export function withRowParticipantAvatars<T extends { participants?: ParticipantAvatarSource[] }>(
  row: T,
  withAvatar: ParticipantAvatarMapper
): T {
  return row.participants ? { ...row, participants: row.participants.map(withAvatar) } : row;
}

/**
 * A mapper that puts the best-known avatar on a row, for the whole list resolved in one batch.
 *
 * Hands back a function rather than a parallel array so callers apply it wherever the rows actually
 * sit — two named parties on a request, a participant list nested under each side of a claim —
 * without pairing anything back up by index.
 *
 * The resolved value goes back into `avatar_cid`, which is the field every consumer already draws.
 * Both spellings reach the same place: `NativeGeoImage` resolves an `ipfs://` value through its
 * gateway chain, which is how the graph's avatars render everywhere else in the app.
 */
export function useParticipantAvatars(
  participants: readonly ParticipantAvatarSource[],
  /**
   * The parent query's own `enabled`. Passed on rather than assumed, because a disabled parent is
   * not merely idle — `DebatesHubButton` mounts `useDebateRequests(false)` on every page purely to
   * read the badge count out of a cache someone else fills. Firing a profile lookup for every party
   * it happens to find there would put requests on the wire from the one caller that deliberately
   * makes none. `useProfilesBySpaceIds` still serves what is already cached while disabled, so a
   * surface that has resolved these faces once keeps drawing them.
   */
  enabled = true
): ParticipantAvatarMapper {
  // Keyed on the ids themselves rather than the array's identity: these lists are rebuilt from a
  // query result on every render while the people in them are not.
  const spaceIdKey = participants
    .map(participant => (participant.profile_space_id ? (validateSpaceId(participant.profile_space_id) ?? '') : ''))
    .join(',');

  const spaceIds = React.useMemo(() => [...new Set(spaceIdKey.split(',').filter(Boolean))], [spaceIdKey]);
  const { profilesBySpaceId } = useProfilesBySpaceIds(spaceIds, enabled && spaceIds.length > 0);

  // Generic in the *returned* function rather than the hook, so one call can resolve a payload that
  // names people in more than one shape — an activity carries a challenge's two parties and a
  // debate's participants, and they are different types describing the same faces.
  return React.useCallback(
    <T extends ParticipantAvatarSource>(participant: T) => {
      const avatar = participantAvatarUrl(participant, profilesBySpaceId);

      // The same object back when nothing changed, so a memoized consumer downstream is not
      // invalidated by a list that merely re-resolved to what it already had.
      return avatar === (participant.avatar_cid ?? null) ? participant : { ...participant, avatar_cid: avatar };
    },
    [profilesBySpaceId]
  );
}
