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

type ProfileLike = { avatarUrl?: string | null };

/**
 * Ids are normalized on both sides. geo-chat and the graph agree on the value but not always on the
 * spelling — one may carry dashes — and `validateSpaceId` is what the profile links beside these
 * avatars already run them through, so a row that can link to a profile can resolve one.
 */
export function participantAvatarUrl(
  participant: ParticipantAvatarSource | null | undefined,
  profilesBySpaceId: Map<string, ProfileLike>
): string | null {
  const spaceId = participant?.profile_space_id ? validateSpaceId(participant.profile_space_id) : null;
  const fromGraph = spaceId ? profilesBySpaceId.get(spaceId)?.avatarUrl : null;

  return fromGraph ?? participant?.avatar_cid ?? null;
}

/**
 * The resolved value goes back into `avatar_cid`, which is the field every consumer already draws.
 * Both spellings reach the same place: `NativeGeoImage` resolves an `ipfs://` value through its
 * gateway chain, which is how the graph's avatars render everywhere else in the app.
 */
export function useParticipantAvatars<T extends ParticipantAvatarSource>(participants: readonly T[]): T[] {
  // Keyed on the ids themselves rather than the array's identity: these lists are rebuilt from a
  // query result on every render while the people in them are not.
  const spaceIdKey = participants
    .map(participant => (participant.profile_space_id ? (validateSpaceId(participant.profile_space_id) ?? '') : ''))
    .join(',');

  const spaceIds = React.useMemo(() => [...new Set(spaceIdKey.split(',').filter(Boolean))], [spaceIdKey]);
  const { profilesBySpaceId } = useProfilesBySpaceIds(spaceIds, spaceIds.length > 0);

  return React.useMemo(
    () =>
      participants.map(participant => {
        const avatar = participantAvatarUrl(participant, profilesBySpaceId);

        // Same object back when nothing changed, so a memoized consumer downstream is not
        // invalidated by a list that merely re-resolved to what it already had.
        return avatar === (participant.avatar_cid ?? null) ? participant : { ...participant, avatar_cid: avatar };
      }),
    [participants, profilesBySpaceId]
  );
}
