import type { ApiProfile } from '~/core/io/rest/schemas/profile';
import { formatShortAddress } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

type EntityVersionItemProps = {
  createdAt: string;
  name: string | null;
  createdBy: ApiProfile | null;
  onClick: () => void;
};

export function EntityVersionItem({ createdAt, name, createdBy, onClick }: EntityVersionItemProps) {
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

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative z-10 block w-full bg-white px-2 py-3 text-left text-grey-04 hover:bg-bg hover:text-text"
    >
      <div className="flex items-center justify-between">
        <Text as="span" variant="metadataMedium" className="mb-1 truncate text-ellipsis !text-sm">
          {versionName}
        </Text>
      </div>
      <div className="flex items-center justify-between">
        {createdBy ? (
          <div className="flex items-center gap-1">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar
                alt={`Avatar for ${createdBy.name ?? createdBy.spaceId}`}
                avatarUrl={createdBy.avatarUrl}
                value={createdBy.name ?? createdBy.spaceId}
              />
            </div>
            <p className="text-smallButton">{createdBy.name ?? formatShortAddress(createdBy.address)}</p>
          </div>
        ) : (
          <div />
        )}
        <p className="text-smallButton">
          {formattedDate} · {formattedTime}
        </p>
      </div>
    </button>
  );
}
