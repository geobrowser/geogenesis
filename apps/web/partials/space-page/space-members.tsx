import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import { getSpaceEditorsBootstrap } from '~/core/space-members/get-space-editors-bootstrap';
import { getSpaceMembersBootstrap } from '~/core/space-members/get-space-members-bootstrap';
import { SpaceParticipantsCacheSeed } from '~/core/space-members/space-participants-cache-seed';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getHasRequestedSpaceMembership } from '~/partials/space-page/get-has-requested-space-membership';

import { SpaceMembersChip } from './space-members-chip';
import { SpaceMembersDialogServerContainer } from './space-members-dialog-server-container';
import { SpaceMembersJoinButton } from './space-members-join-button';
import { SpaceMembersMenu } from './space-members-menu';
import { SpaceMembersPopover } from './space-members-popover';
import { SpaceMembersContent } from './space-members-popover-content';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

interface Props {
  spaceId: string;
}

export async function SpaceMembers({ spaceId }: Props) {
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  const [membersBootstrap, editorsBootstrap, space, hasRequestedSpaceMembership] = await Promise.all([
    getSpaceMembersBootstrap(spaceId, connectedAddress),
    getSpaceEditorsBootstrap(spaceId, connectedAddress),
    cachedFetchSpace(spaceId),
    getHasRequestedSpaceMembership(spaceId, connectedAddress),
  ]);

  const { isMember, firstThreeMembers, totalMembers, initialParticipantsPage } = membersBootstrap;
  const { isEditor } = editorsBootstrap;
  const isPublicSpace = space?.type === 'DAO';

  if (!space) {
    return null;
  }

  if (space.type === 'PERSONAL') {
    return null;
  }

  const chip = (
    <SpaceMembersChip firstThreeMembers={firstThreeMembers} totalMembers={totalMembers} />
  );

  const popoverContent = (
    <SpaceMembersContent
      spaceId={spaceId}
      isPublicSpace={isPublicSpace}
      isMember={isMember}
      isEditor={isEditor}
      hasRequestedSpaceMembership={hasRequestedSpaceMembership}
      connectedAddress={connectedAddress ?? null}
      initialParticipantsPage={initialParticipantsPage}
    />
  );

  const cacheSeed = (
    <SpaceParticipantsCacheSeed
      spaceId={spaceId}
      kind="members"
      page={initialParticipantsPage}
    />
  );

  // Editors aren't always in the members list, but they already belong to the space — treat
  // them as joined so they don't see (and can't fire) a duplicate membership request.
  if (isMember || isEditor) {
    return (
      <div className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata shadow-button transition-colors duration-150 focus-within:border-text">
        {cacheSeed}
        <SpaceMembersPopover trigger={chip} content={popoverContent} />
        <div className="h-4 w-px bg-divider" />
        <SpaceMembersMenu
          manageMembersComponent={
            <SpaceMembersDialogServerContainer
              spaceId={spaceId}
              isEditor={isEditor}
              initialParticipantsPage={initialParticipantsPage}
            />
          }
          trigger={<ChevronDownSmall color="grey-04" />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata shadow-button transition-colors duration-150 focus-within:border-text">
      {cacheSeed}
      <SpaceMembersPopover trigger={chip} content={popoverContent} />

      {isPublicSpace ? (
        <SpaceMembersJoinButton spaceId={spaceId} hasRequestedSpaceMembership={hasRequestedSpaceMembership} />
      ) : null}
    </div>
  );
}
