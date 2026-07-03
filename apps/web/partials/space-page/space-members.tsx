import { cookies } from 'next/headers';

import { getSpaceAccessForRequest } from '~/core/access/get-space-access-for-request';
import { WALLET_ADDRESS } from '~/core/cookie';
import { getCachedSpaceParticipantsPage } from '~/core/space-members/get-cached-space-participants-page';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getSpaceMemberRequest } from '~/partials/space-page/get-space-member-request';

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

  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    return null;
  }

  if (space.type === 'PERSONAL') {
    return null;
  }

  const [access, membersPage, memberRequest] = await Promise.all([
    getSpaceAccessForRequest(spaceId, connectedAddress),
    getCachedSpaceParticipantsPage(spaceId, 'members', 0),
    getSpaceMemberRequest(spaceId, connectedAddress),
  ]);

  const { isMember, isEditor } = access;
  const isPublicSpace = space.type === 'DAO';
  const firstThreeMembers = membersPage.participants.slice(0, 3);

  const chip = <SpaceMembersChip firstThreeMembers={firstThreeMembers} totalMembers={membersPage.totalCount} />;

  const popoverContent = (
    <SpaceMembersContent
      spaceId={spaceId}
      isPublicSpace={isPublicSpace}
      isMember={isMember}
      isEditor={isEditor}
      memberRequest={memberRequest}
      connectedAddress={connectedAddress ?? null}
      initialParticipantsPage={membersPage}
    />
  );

  // Editors aren't always in the members list, but they already belong to the space — treat
  // them as joined so they don't see (and can't fire) a duplicate membership request.
  if (isMember || isEditor) {
    return (
      <div className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata shadow-button transition-colors duration-150 focus-within:border-text">
        <SpaceMembersPopover trigger={chip} content={popoverContent} />
        <div className="h-4 w-px bg-divider" />
        <SpaceMembersMenu
          manageMembersComponent={
            <SpaceMembersDialogServerContainer
              spaceId={spaceId}
              isEditor={isEditor}
              initialParticipantsPage={membersPage}
            />
          }
          trigger={<ChevronDownSmall color="grey-04" />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata shadow-button transition-colors duration-150 focus-within:border-text">
      <SpaceMembersPopover trigger={chip} content={popoverContent} />

      {isPublicSpace ? <SpaceMembersJoinButton spaceId={spaceId} memberRequest={memberRequest} /> : null}
    </div>
  );
}
