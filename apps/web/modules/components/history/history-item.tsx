import pluralize from 'pluralize';
import { Text } from '~/modules/design-system/text';
import { formatShortAddress, GeoDate } from '~/modules/utils';
import { Avatar } from '~/modules/avatar';
import { Profile } from '~/modules/types';

interface Props {
  changeCount: number;
  createdAt: number;
  createdBy: Profile;
  name: string | null;
}

export function HistoryItem({ changeCount, createdAt, createdBy, name }: Props) {
  // We want to group together all changes to the same property into a single
  // change count. i.e., a proposed change may have multiple action taken on
  // the same triple, we want to make sure that only renders as a single change.
  // const uniqueTripleChanges = Action.getChangeCount(
  //   proposal.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
  // );

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

  // Older Proposals from before we added proposal names may not have a name, so we fall back to
  // an address – date format.
  const versionName = name ?? `${formatShortAddress(createdBy.id)} – ${formattedLastEditedDate}`;

  // Names might be very long, so we truncate to make it work with the menu UI
  const truncatedVersionName = versionName.length > 36 ? `${versionName.slice(0, 36)}...` : versionName;

  return (
    <div className="bg-white px-2 py-3 text-grey-04 hover:bg-bg hover:text-text">
      <div className="flex items-center justify-between">
        <Text as="h1" variant="metadataMedium" className="mb-2">
          {truncatedVersionName}
        </Text>
      </div>
      <div className="flex items-center justify-between ">
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
            {changeCount} {pluralize('edit', changeCount)} · {formattedLastEditedDate} · {lastEditedTime}
          </p>
        </div>
      </div>
    </div>
  );
}
