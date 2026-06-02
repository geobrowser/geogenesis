import { cache } from 'react';

import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { getIsMemberOfSpace } from '~/core/io/queries';
import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';

import { Telemetry } from '~/app/api/telemetry';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

import { getCachedSpaceParticipantsPage } from './get-cached-space-participants-page';
import {
  type SpaceParticipantProfile,
  type SpaceParticipantsPage,
} from './fetch-space-participants-page';

export type SpaceMembersBootstrap = {
  isMember: boolean;
  totalMembers: number;
  firstThreeMembers: SpaceParticipantProfile[];
  initialParticipantsPage: SpaceParticipantsPage;
};

function memberListIsComplete(totalMembers: number, loadedMemberCount: number): boolean {
  return totalMembers <= loadedMemberCount;
}

export const getSpaceMembersBootstrap = cache(
  async (spaceId: string, connectedAddress?: string): Promise<SpaceMembersBootstrap> => {
    const space = await cachedFetchSpace(spaceId);

    if (!space) {
      console.error(`Space does not exist: ${spaceId}`);
      notFound();
    }

    const personalSpaceId = connectedAddress ? await getPersonalSpaceId(connectedAddress) : null;
    const normalizedPersonalSpaceId = personalSpaceId?.toLowerCase() ?? null;

    const needsMembershipQuery =
      Boolean(normalizedPersonalSpaceId) &&
      !memberListIsComplete(space.totalMembers, space.members.length);

    const [initialParticipantsPage, isMemberFromQuery] = await Promise.all([
      getCachedSpaceParticipantsPage(spaceId, 'members', 0),
      needsMembershipQuery && normalizedPersonalSpaceId
        ? Effect.runPromise(
            getIsMemberOfSpace(spaceId, normalizedPersonalSpaceId).pipe(
              Effect.withSpan('web.getSpaceMembersBootstrap.isMember'),
              Effect.annotateSpans({ spaceId, personalSpaceId: normalizedPersonalSpaceId }),
              Effect.provide(Telemetry)
            )
          )
        : Promise.resolve(false),
    ]);

    let isMember = isMemberFromQuery;
    if (normalizedPersonalSpaceId && !needsMembershipQuery) {
      isMember = space.members.map(m => m.toLowerCase()).includes(normalizedPersonalSpaceId);
    }

    return {
      isMember,
      totalMembers: initialParticipantsPage.totalCount,
      firstThreeMembers: initialParticipantsPage.participants.slice(0, 3),
      initialParticipantsPage,
    };
  }
);
