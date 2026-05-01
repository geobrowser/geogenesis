import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getHasRequestedSpaceEditorship } from './get-has-requested-space-editorship';
import { getIsEditorForSpace } from './get-is-editor-for-space';
import { getIsMemberForSpace } from './get-is-member-for-space';
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
  const [isEditor, isMember, hasRequestedSpaceEditorship, space] = await Promise.all([
    getIsEditorForSpace(spaceId, connectedAddress),
    getIsMemberForSpace(spaceId, connectedAddress),
    getHasRequestedSpaceEditorship(spaceId, connectedAddress),
    cachedFetchSpace(spaceId),
  ]);

  if (!space) {
    return null;
  }

  if (space.type === 'PERSONAL') {
    return null;
  }

  const popoverContent = (
    <SpaceEditorsContent
      spaceId={spaceId}
      isEditor={isEditor}
      isMember={isMember}
      hasRequestedSpaceEditorship={hasRequestedSpaceEditorship}
      connectedAddress={connectedAddress ?? null}
    />
  );

  if (isEditor) {
    return (
      <div className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata shadow-button transition-colors duration-150 focus-within:border-text">
        <SpaceMembersPopover trigger={<SpaceEditorsChip spaceId={spaceId} />} content={popoverContent} />
        <div className="h-4 w-px bg-divider" />

        <SpaceMembersMenu
          trigger={<ChevronDownSmall color="grey-04" />}
          manageMembersComponent={<SpaceEditorsDialogServerContainer spaceId={spaceId} />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata shadow-button transition-colors duration-150 focus-within:border-text">
      <SpaceMembersPopover trigger={<SpaceEditorsChip spaceId={spaceId} />} content={popoverContent} />
    </div>
  );
}
