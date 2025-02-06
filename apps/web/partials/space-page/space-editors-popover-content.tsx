import { cookies } from 'next/headers';
import pluralize from 'pluralize';

import { WALLET_ADDRESS } from '~/core/cookie';

import { getHasRequestedSpaceEditorship } from '~/partials/space-page/get-has-requested-space-editorship';

import { getEditorsForSpace } from './get-editors-for-space';
import { getIsEditorForSpace } from './get-is-editor-for-space';
import { getIsMemberForSpace } from './get-is-member-for-space';
import { SpaceEditorsPopoverEditorRequestButton } from './space-editors-popover-editor-request-button';
import { MemberRow } from './space-member-row';

interface Props {
  spaceId: string;
}

export async function SpaceEditorsContent({ spaceId }: Props) {
  const connectedAddress = (await cookies()).get(WALLET_ADDRESS)?.value;

  const [{ allEditors, totalEditors, votingPluginAddress }, isEditor, isMember, hasRequestedSpaceEditorship] =
    await Promise.all([
      getEditorsForSpace(spaceId),
      getIsEditorForSpace(spaceId, connectedAddress),
      getIsMemberForSpace(spaceId, connectedAddress),
      getHasRequestedSpaceEditorship(spaceId, connectedAddress),
    ]);

  return (
    <div className="z-10 w-[356px] divide-y divide-grey-02 rounded-lg border border-grey-02 bg-white shadow-lg">
      <div className="max-h-[265px] overflow-hidden overflow-y-auto">
        {allEditors.map(e => (
          <MemberRow key={e.id} user={e} />
        ))}
      </div>

      <div className="flex items-center justify-between p-2">
        <p className="text-smallButton text-text">
          {totalEditors} {pluralize('editor', totalEditors)}
        </p>
        {isEditor ? (
          <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            {connectedAddress ? '' : 'Sign in to join'}
          </button>
        ) : (
          <div className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            {connectedAddress ? (
              <SpaceEditorsPopoverEditorRequestButton
                votingContractAddress={votingPluginAddress}
                isMember={isMember}
                hasRequestedSpaceEditorship={hasRequestedSpaceEditorship}
              />
            ) : (
              'Sign in to join'
            )}
          </div>
        )}
      </div>
    </div>
  );
}
