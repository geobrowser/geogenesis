import Link from 'next/link';

import { OmitStrict, Profile } from '~/core/types';
import { formatShortAddress } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';

interface EditorRowProps {
  user: OmitStrict<Profile, 'coverUrl'>;
}

export function MemberRow({ user }: EditorRowProps) {
  return (
    <Link href={user.profileLink ?? ''} className="flex flex-1 items-center gap-2 p-2">
      <div className="relative h-8 w-8 overflow-hidden rounded-full">
        <Avatar size={32} avatarUrl={user.avatarUrl} value={user.address} />
      </div>
      <p className="text-metadataMedium">{user.name ?? formatShortAddress(user.id)}</p>
    </Link>
  );
}
