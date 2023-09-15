import { cookies } from 'next/headers';
import pluralize from 'pluralize';

import { Cookie } from '~/core/cookie';
import { Profile } from '~/core/types';
import { OmitStrict } from '~/core/types';

import { Avatar } from '~/design-system/avatar';

import { getEditorsForSpace } from './get-editors-for-space';

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
          <EditorRow key={e.id} editor={e} />
        ))}
      </div>

      <div className="flex items-center justify-between p-2">
        <p className="text-smallButton text-text">
          {totalEditors} {pluralize('editor', totalEditors)}
        </p>
        {!isEditor && (
          <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            Request to be an editor
          </button>
        )}
      </div>
    </div>
  );
}

interface EditorRowProps {
  editor: OmitStrict<Profile, 'coverUrl'>;
}

function EditorRow({ editor }: EditorRowProps) {
  return (
    <div className="flex items-center gap-2 p-2">
      <div className="relative h-8 w-8 overflow-hidden rounded-full">
        <Avatar size={32} avatarUrl={editor.avatarUrl} value={editor.name ?? ''} />
      </div>
      <p className="text-metadataMedium">{editor.name}</p>
    </div>
  );
}
