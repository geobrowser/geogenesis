import cx from 'classnames';

import { personProfileOpened } from '~/core/analytics';
import { OmitStrict, Profile } from '~/core/types';
import { formatShortAddress } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

interface EditorRowProps {
  user: OmitStrict<Profile, 'coverUrl'>;
  className?: string;
  analyticsSurface?: string;
}

export function MemberRow({ user, className, analyticsSurface = 'people_list' }: EditorRowProps) {
  return (
    <Link
      href={user.profileLink ?? ''}
      onClick={
        user.profileLink
          ? () => personProfileOpened(user.spaceId, user.id, { interaction_surface: analyticsSurface })
          : undefined
      }
      className={cx('flex flex-1 items-center gap-2 p-2', className)}
    >
      <div className="relative h-8 w-8 overflow-hidden rounded-full">
        <Avatar size={32} avatarUrl={user.avatarUrl} value={user.address} />
      </div>
      <p className="text-metadataMedium">{user.name ?? formatShortAddress(user.id)}</p>
    </Link>
  );
}
