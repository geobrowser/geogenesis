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

  // e.g. Mar 12, 2023
  const formattedLastEditedDate = new Date(lastEditedDate).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // e.g. 13:41
  const lastEditedTime = new Date(lastEditedDate).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Older versions from before we added proposal names may not have a name, so we fall back to
  // an address – date format.
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
