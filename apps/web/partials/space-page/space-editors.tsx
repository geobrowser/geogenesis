import { cookies } from 'next/headers';

import { Cookie } from '~/core/cookie';

import { getEditorsForSpace } from './get-editors-for-space';
import { SpaceEditorsChip } from './space-editors-chip';
import { SpaceEditorsContent } from './space-editors-content';
import { SpaceEditorsMenu } from './space-editors-menu';
import { SpaceMembersPopover } from './space-members-popover';

interface Props {
  spaceId: string;
}

export async function SpaceEditors({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;
  const { isEditor } = await getEditorsForSpace(spaceId, connectedAddress);

  if (isEditor) {
    // @ts-expect-error async JSX function
    return <SpaceEditorsMenu trigger={<SpaceEditorsChip spaceId={spaceId} />} />;
  }

  return (
    <SpaceMembersPopover
      // @ts-expect-error async JSX function
      trigger={<SpaceEditorsChip spaceId={spaceId} />}
      // @ts-expect-error async JSX function
      content={<SpaceEditorsContent spaceId={spaceId} />}
    />
  );
}
