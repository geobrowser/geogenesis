import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import { getSpaceEditorsBootstrap } from '~/core/space-members/get-space-editors-bootstrap';
import { getSpaceMembersBootstrap } from '~/core/space-members/get-space-members-bootstrap';
import { SpaceParticipantsCacheSeed } from '~/core/space-members/space-participants-cache-seed';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getHasRequestedSpaceEditorship } from './get-has-requested-space-editorship';
import { SpaceEditorsChip } from './space-editors-chip';
import { SpaceEditorsDialogServerContainer } from './space-editors-dialog-server-container';
import { SpaceEditorsContent } from './space-editors-popover-content';
import { SpaceMembersMenu } from './space-members-menu';
import { SpaceMembersPopover } from './space-members-popover';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

interface Props {
  spaceId: string;
}

export async function SpaceEditors({ spaceId }: Props) {
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;
  const [editorsBootstrap, membersBootstrap, hasRequestedSpaceEditorship, space] = await Promise.all([
    getSpaceEditorsBootstrap(spaceId, connectedAddress),
    getSpaceMembersBootstrap(spaceId, connectedAddress),
    getHasRequestedSpaceEditorship(spaceId, connectedAddress),
    cachedFetchSpace(spaceId),
  ]);

  const { isEditor, firstThreeEditors, totalEditors, initialParticipantsPage: initialEditorsPage } =
    editorsBootstrap;
  const { isMember } = membersBootstrap;

  if (!space) {
    return null;
  }

  if (space.type === 'PERSONAL') {
    return null;
  }

  const chip = (
    <SpaceEditorsChip firstThreeEditors={firstThreeEditors} totalEditors={totalEditors} />
  );

  const editorsCacheSeed = (
    <SpaceParticipantsCacheSeed
      spaceId={spaceId}
      kind="editors"
      page={initialEditorsPage}
    />
  );

  const membersCacheSeed = (
    <SpaceParticipantsCacheSeed
      spaceId={spaceId}
      kind="members"
      page={membersBootstrap.initialParticipantsPage}
    />
  );

  const popoverContent = (
    <SpaceEditorsContent
      spaceId={spaceId}
      isEditor={isEditor}
      isMember={isMember}
      hasRequestedSpaceEditorship={hasRequestedSpaceEditorship}
      connectedAddress={connectedAddress ?? null}
      initialParticipantsPage={initialEditorsPage}
    />
  );

  if (isEditor) {
    return (
      <div className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata shadow-button transition-colors duration-150 focus-within:border-text">
        {editorsCacheSeed}
        {membersCacheSeed}
        <SpaceMembersPopover trigger={chip} content={popoverContent} />
        <div className="h-4 w-px bg-divider" />

        <SpaceMembersMenu
          trigger={<ChevronDownSmall color="grey-04" />}
          manageMembersComponent={
            <SpaceEditorsDialogServerContainer
              spaceId={spaceId}
              initialParticipantsPage={initialEditorsPage}
            />
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata shadow-button transition-colors duration-150 focus-within:border-text">
      {editorsCacheSeed}
      {membersCacheSeed}
      <SpaceMembersPopover trigger={chip} content={popoverContent} />
    </div>
  );
}
