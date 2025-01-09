import { cookies } from 'next/headers';

import * as React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getHasRequestedSpaceMembership } from '~/partials/space-page/get-has-requested-space-membership';

import { getIsMemberForSpace } from './get-is-member-for-space';
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
  const connectedAddress = cookies().get(WALLET_ADDRESS)?.value;
  const [isMember, space, hasRequestedSpaceMembership] = await Promise.all([
    getIsMemberForSpace(spaceId, connectedAddress),
    cachedFetchSpace(spaceId),
    getHasRequestedSpaceMembership(spaceId, connectedAddress),
  ]);

  const isPublicSpace = space?.type === 'PUBLIC';

  if (!space) {
    return null;
  }

  if (isMember) {
    return (
      <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button transition-colors duration-150 focus-within:border-text">
        <SpaceMembersPopover
          trigger={<SpaceMembersChip spaceId={spaceId} />}
          content={
            <React.Suspense>
              <SpaceMembersContent spaceId={spaceId} isPublicSpace={isPublicSpace} />
            </React.Suspense>
          }
        />
        <div className="h-4 w-px bg-divider" />
        <SpaceMembersMenu
          manageMembersComponent={
            <React.Suspense>
              <SpaceMembersDialogServerContainer
                spaceType={space.type}
                spaceId={spaceId}
                votingPluginAddress={
                  space.type === 'PERSONAL' ? space.personalSpaceAdminPluginAddress : space.mainVotingPluginAddress
                }
              />
            </React.Suspense>
          }
          trigger={<ChevronDownSmall color="grey-04" />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button transition-colors duration-150 focus-within:border-text">
      <SpaceMembersPopover
        trigger={<SpaceMembersChip spaceId={spaceId} />}
        content={
          <React.Suspense>
            <SpaceMembersContent spaceId={spaceId} isPublicSpace={isPublicSpace} />
          </React.Suspense>
        }
      />

      {isPublicSpace ? (
        <SpaceMembersJoinButton
          spaceId={spaceId}
          votingPluginAddress={space.mainVotingPluginAddress}
          hasRequestedSpaceMembership={hasRequestedSpaceMembership}
        />
      ) : null}
    </div>
  );
}
