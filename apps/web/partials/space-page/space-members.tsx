import { cookies } from 'next/headers';

import { Cookie } from '~/core/cookie';

import { getEditorsForSpace } from './get-editors-for-space';
import { SpaceMembersChip } from './space-members-chip';
import { SpaceMembersContent } from './space-members-content';
import { SpaceMembersMenu } from './space-members-menu';
import { SpaceMembersPopover } from './space-members-popover';

interface Props {
  spaceId: string;
}

export async function SpaceMembers({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;
  const { isEditor } = await getEditorsForSpace(spaceId, connectedAddress);

  if (isEditor) {
    // @ts-expect-error async JSX function
    return <SpaceMembersMenu trigger={<SpaceMembersChip spaceId={spaceId} />} />;
  }

  return (
    <SpaceMembersPopover
      // @ts-expect-error async JSX function
      trigger={<SpaceMembersChip spaceId={spaceId} />}
      // @ts-expect-error async JSX function
      content={<SpaceMembersContent spaceId={spaceId} />}
    />
  );
}
