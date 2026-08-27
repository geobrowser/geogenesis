import { cookies } from 'next/headers';

import { getSpaceAccessForRequest } from '~/core/access/get-space-access-for-request';
import { WALLET_ADDRESS } from '~/core/cookie';
import { getCachedSpaceParticipantsPage } from '~/core/space-members/get-cached-space-participants-page';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getSpaceEditorRequest } from './get-space-editor-request';
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

  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    return null;
  }

  if (space.type === 'PERSONAL') {
    return null;
  }

  const [access, editorsPage, editorRequest] = await Promise.all([
    getSpaceAccessForRequest(spaceId, connectedAddress),
    getCachedSpaceParticipantsPage(spaceId, 'editors', 0),
    getSpaceEditorRequest(spaceId, connectedAddress),
  ]);

  const { isEditor, isMember } = access;
  const firstThreeEditors = editorsPage.participants.slice(0, 3);

  const chip = <SpaceEditorsChip firstThreeEditors={firstThreeEditors} totalEditors={editorsPage.totalCount} />;

  const popoverContent = (
    <SpaceEditorsContent
      spaceId={spaceId}
      isEditor={isEditor}
      isMember={isMember}
      editorRequest={editorRequest}
      connectedAddress={connectedAddress ?? null}
      initialParticipantsPage={editorsPage}
    />
  );

  if (isEditor) {
    return (
      <div className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata shadow-button transition-colors duration-150 focus-within:border-text">
        <SpaceMembersPopover trigger={chip} content={popoverContent} />
        <div className="h-4 w-px bg-divider" />

        <SpaceMembersMenu
          trigger={<ChevronDownSmall color="grey-04" />}
          manageMembersComponent={
            <SpaceEditorsDialogServerContainer spaceId={spaceId} initialParticipantsPage={editorsPage} />
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata shadow-button transition-colors duration-150 focus-within:border-text">
      <SpaceMembersPopover trigger={chip} content={popoverContent} />
    </div>
  );
}
