import { cookies } from 'next/headers';
import pluralize from 'pluralize';

import { Cookie } from '~/core/cookie';

import { getEditorsForSpace } from './get-editors-for-space';
import { MemberRow } from './space-member-row';

interface Props {
  spaceId: string;
}

export async function SpaceEditorsContent({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;
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
          {totalEditors} {pluralize('editor', totalEditors)}
        </p>
        {isEditor ? (
          <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            {connectedAddress ? 'Leave as editor' : 'Connect wallet'}
          </button>
        ) : (
          <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            {connectedAddress ? 'Request to be an editor' : 'Connect wallet'}
          </button>
        )}
      </div>
    </div>
  );
}
