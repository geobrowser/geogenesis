import Avatar from 'boring-avatars';
import pluralize from 'pluralize';
import { Text } from '~/modules/design-system/text';
import { Triple } from '~/modules/triple';
import { Version } from '~/modules/types';

interface Props {
  version: Version;
}

export function HistoryItem({ version }: Props) {
  // @TODO: Make sure the actions are squashed, unique. This component may have changes
  // for an entire space or just for a single entity.
  const uniqueTripleChanges = Triple.fromActions(version.actions, []).length;
  const truncatedVersionName = version.name.length > 36 ? `${version.name.slice(0, 36)}...` : version.name;

  return (
    <div className="cursor-pointer bg-white px-2 py-3 text-grey-04 hover:bg-bg hover:text-text">
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
          <p className="text-smallButton">{version.createdBy.name ?? version.createdBy.id}</p>
        </div>
        <div className="flex">
          <p className="text-smallButton">
            {uniqueTripleChanges} {pluralize('edit', uniqueTripleChanges)} ·{' '}
            {new Date(version.createdAt).toLocaleDateString(undefined, {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}{' '}
            ·{' '}
            {new Date(version.createdAt).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
