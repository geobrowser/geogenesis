import { cookies } from 'next/headers';
import pluralize from 'pluralize';

import { Cookie } from '~/core/cookie';

import { getEditorsForSpace } from './get-editors-for-space';
import { getIsEditorForSpace } from './get-is-editor-for-space';
import { MemberRow } from './space-member-row';
import { SpaceMembersPopoverMemberRequestButton } from './space-members-popover-members-request-button';

interface Props {
  spaceId: string;
}

export async function SpaceMembersContent({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;

  // For now we use editors for both editors and members until we have the new membership
  const [{ allEditors, totalEditors }, isEditor] = await Promise.all([
    getEditorsForSpace(spaceId),
    getIsEditorForSpace(spaceId, connectedAddress),
  ]);

  return (
    <div className="z-10 w-[356px] divide-y divide-grey-02 rounded border border-grey-02 bg-white shadow-lg">
      <div className="max-h-[265px] overflow-hidden overflow-y-auto">
        {allEditors.map(e => (
          <MemberRow key={e.id} editor={e} />
        ))}
      </div>

      <div className="flex items-center justify-between p-2">
        <p className="text-smallButton text-text">
          {totalEditors} {pluralize('member', totalEditors)}
        </p>

        {isEditor ? (
          <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            {connectedAddress ? 'Leave space' : 'Connect wallet'}
          </button>
        ) : (
          <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            {connectedAddress ? <SpaceMembersPopoverMemberRequestButton spaceId={spaceId} /> : 'Connect wallet'}
          </button>
        )}
      </div>
    </div>
  );
}
