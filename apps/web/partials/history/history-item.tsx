import type { ApiProfile } from '~/core/io/rest/schemas/profile';
import { NavUtils, formatShortAddress } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

type EntityVersionItemProps = {
  createdAt: string;
  name: string | null;
  createdById: string | null;
  createdBy: ApiProfile | null;
  onClick: () => void;
};

export function EntityVersionItem({ createdAt, name, createdById, createdBy, onClick }: EntityVersionItemProps) {
  const date = new Date(createdAt);

  const formattedDate = date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const versionName = name ?? `Version from ${formattedDate}`;

  // Use resolved profile, or fall back to a default constructed from createdById
  const displayName = createdBy?.name ?? (createdById ? formatShortAddress(createdById) : null);
  // Use a stable identifier for avatar generation so the color doesn't change if the user renames
  const avatarId = createdBy?.spaceId ?? createdById;
  // Link the publisher's name to their space when we've resolved which space published the version.
  const spaceHref = createdBy?.spaceId ? NavUtils.toSpace(createdBy.spaceId) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      className="relative z-10 block w-full cursor-pointer bg-white px-2 py-3 text-left text-grey-04 hover:bg-bg hover:text-text"
    >
      <div className="flex items-center justify-between">
        <Text as="span" variant="metadataMedium" className="mb-1 truncate text-sm! text-ellipsis">
          {versionName}
        </Text>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <div className="relative h-3 w-3 overflow-hidden rounded-full">
            <Avatar
              alt={`Avatar for ${avatarId ?? 'unknown'}`}
              avatarUrl={createdBy?.avatarUrl ?? null}
              value={avatarId ?? 'unknown'}
            />
          </div>
          {spaceHref ? (
            <PrefetchLink
              href={spaceHref}
              onClick={event => event.stopPropagation()}
              className="text-smallButton hover:underline"
            >
              {displayName ?? 'Unknown author'}
            </PrefetchLink>
          ) : (
            <p className="text-smallButton">{displayName ?? 'Unknown author'}</p>
          )}
        </div>
        <p className="text-smallButton">
          {formattedDate} · {formattedTime}
        </p>
      </div>
    </div>
  );
}
