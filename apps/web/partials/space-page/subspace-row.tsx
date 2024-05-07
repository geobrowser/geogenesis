import Link from 'next/link';

import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';

import { SpaceToAdd } from './types';

export function SubspaceRow({ subspace }: { subspace: SpaceToAdd }) {
  return (
    <Link
      href={NavUtils.toSpace(subspace.id)}
      className="flex flex-1 items-center gap-2 p-2 transition-colors duration-150 hover:bg-divider"
    >
      <div className="relative h-8 w-8 overflow-hidden rounded-full">
        <Avatar size={32} avatarUrl={subspace.spaceConfig?.image} value={subspace.id} />
      </div>

      <div className="space-y-0.5">
        <p className="text-metadataMedium">{subspace.spaceConfig?.name ?? subspace.id}</p>
        <p className="grey-03 text-footnoteMedium">{subspace.totalMembers}</p>
      </div>
    </Link>
  );
}
