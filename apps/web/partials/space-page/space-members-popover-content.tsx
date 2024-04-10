import { cookies } from 'next/headers';
import pluralize from 'pluralize';

import { WALLET_ADDRESS } from '~/core/cookie';

import { getIsMemberForSpace } from './get-is-member-for-space';
import { getMembersForSpace } from './get-members-for-space';
import { MemberRow } from './space-member-row';
import { SpaceMembersPopoverMemberRequestButton } from './space-members-popover-members-request-button';

interface Props {
  spaceId: string;
}

export async function SpaceMembersContent({ spaceId }: Props) {
  const connectedAddress = cookies().get(WALLET_ADDRESS)?.value;

  // For now we use editors for both editors and members until we have the new membership
  const [{ allMembers, totalMembers, memberPluginAddress }, isEditor] = await Promise.all([
    getMembersForSpace(spaceId),
    getIsMemberForSpace(spaceId, connectedAddress),
  ]);

  console.log('allMembers', allMembers);

  return (
    <div className="z-10 w-[356px] divide-y divide-grey-02 rounded-lg border border-grey-02 bg-white shadow-lg">
      <div className="max-h-[265px] overflow-hidden overflow-y-auto">
        {allMembers.map(e => (
          <MemberRow key={e.id} editor={e} />
        ))}
      </div>

      <div className="flex items-center justify-between p-2">
        <p className="text-smallButton text-text">
          {totalMembers} {pluralize('member', totalMembers)}
        </p>

        {isEditor ? (
          <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            {connectedAddress ? 'Leave space' : 'Connect wallet'}
          </button>
        ) : (
          <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            {connectedAddress ? (
              <SpaceMembersPopoverMemberRequestButton memberContractAddress={memberPluginAddress} />
            ) : (
              'Connect wallet'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
