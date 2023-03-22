import Avatar from 'boring-avatars';
import pluralize from 'pluralize';
import { Action } from '~/modules/action';
import { Text } from '~/modules/design-system/text';
import { Version } from '~/modules/types';
import { formatShortAddress, GeoDate } from '~/modules/utils';

interface Props {
  version: Version;
}

export function HistoryItem({ version }: Props) {
  // We want to group together all changes to the same property into a single
  // change count. i.e., a proposed change may have multiple action taken on
  // the same triple, we want to make sure that only renders as a single change.
  const uniqueTripleChanges = Action.getChangeCount(version.actions);
  const lastEditedDate = GeoDate.fromGeoTime(version.createdAt);

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
  const versionName = version.name ?? `${formatShortAddress(version.createdBy.id)} – ${formattedLastEditedDate}`;

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
          <div className="overflow-hidden rounded-xs">
            <Avatar size={12} square={true} variant="pixel" name={version.createdBy.id} />
          </div>
          <p className="text-smallButton">{version.createdBy.name ?? formatShortAddress(version.createdBy.id)}</p>
        </div>
        <div className="flex">
          <p className="text-smallButton">
            {uniqueTripleChanges} {pluralize('edit', uniqueTripleChanges)} · {formattedLastEditedDate} ·{' '}
            {lastEditedTime}
          </p>
        </div>
      </div>
    </div>
  );
}
