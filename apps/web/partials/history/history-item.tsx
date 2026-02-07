import { Profile } from '~/core/types';
import { GeoDate, NavUtils, formatShortAddress } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

interface Props {
  createdAt: number;
  createdBy: Profile;
  name: string | null;
  spaceId: string;
  proposalId: string;
}

export function HistoryItem({ spaceId, proposalId, createdAt, createdBy, name }: Props) {
  const lastEditedDate = GeoDate.fromGeoTime(createdAt);

  const formattedLastEditedDate = new Date(lastEditedDate).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const lastEditedTime = new Date(lastEditedDate).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const versionName = name ?? `${formatShortAddress(createdBy.id)} – ${formattedLastEditedDate}`;

  return (
    <PrefetchLink
      href={NavUtils.toProposal(spaceId, proposalId)}
      className="relative z-10 block w-full bg-white px-2 py-3 text-grey-04 hover:bg-bg hover:text-text"
    >
      <div className="flex items-center justify-between">
        <Text as="h1" variant="metadataMedium" className="mb-2 truncate text-ellipsis !text-sm">
          {versionName}
        </Text>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-between gap-1">
          <div className="relative h-3 w-3 overflow-hidden rounded-full">
            <Avatar
              alt={`Avatar for ${createdBy.name ?? createdBy.id}`}
              avatarUrl={createdBy.avatarUrl}
              value={createdBy.name ?? createdBy.id}
            />
          </div>
          <p className="text-smallButton">{createdBy.name ?? formatShortAddress(createdBy.id)}</p>
        </div>
        <div className="flex">
          <p className="text-smallButton">
            {formattedLastEditedDate} · {lastEditedTime}
          </p>
        </div>
      </div>
    </PrefetchLink>
  );
}

type EntityVersionItemProps = {
  createdAt: string;
  onClick: () => void;
  isFirst?: boolean;
};

export function EntityVersionItem({ createdAt, onClick, isFirst }: EntityVersionItemProps) {
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

  return (
    <button
      onClick={onClick}
      className="relative z-10 block w-full bg-white px-2 py-3 text-left text-grey-04 hover:bg-bg hover:text-text"
    >
      <div className="flex items-center justify-between">
        <Text as="span" variant="metadataMedium" className="mb-1 truncate text-ellipsis !text-sm">
          {isFirst ? 'Latest version' : `Version from ${formattedDate}`}
        </Text>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-smallButton">
          {formattedDate} · {formattedTime}
        </p>
      </div>
    </button>
  );
}
