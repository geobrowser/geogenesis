import { cookies } from 'next/headers';
import pluralize from 'pluralize';

import { Cookie } from '~/core/cookie';

import { getEditorsForSpace } from './get-editors-for-space';
import { MemberRow } from './space-member-row';

interface Props {
  spaceId: string;
}

export async function SpaceMembersContent({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;

  // For now we use editors for both editors and members until we have the new membership
  const { firstThreeEditors, totalEditors, isEditor } = await getEditorsForSpace(spaceId, connectedAddress);

  return (
    <div className="z-10 w-[356px] divide-y divide-grey-02 rounded border border-grey-02 bg-white shadow-lg">
      <div>
        {firstThreeEditors.map(e => (
          <MemberRow key={e.id} editor={e} />
        ))}
      </div>

      <div className="flex items-center justify-between p-2">
        <p className="text-smallButton text-text">
          {totalEditors} {pluralize('member', totalEditors)}
        </p>

        {!isEditor && (
          <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            Request to join
          </button>
        )}
      </div>
    </div>
  );
}
