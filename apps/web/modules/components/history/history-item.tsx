import Avatar from 'boring-avatars';
import pluralize from 'pluralize';
import { Text } from '~/modules/design-system/text';
import { Triple } from '~/modules/triple';
import { Action } from '~/modules/types';

interface Props {
  name: string;
  createdBy: {
    id: string;
    name?: string;
    avatarUrl?: string;
  };
  createdAt: number;
  actions: Array<Action>;
}

function getMonthFromDate() {}

export function HistoryItem(props: Props) {
  // @TODO: Make sure the actions are squashed, unique. This component may have changes
  // for an entire space or just for a single entity.
  const uniqueTripleChanges = Triple.fromActions(props.actions, []).length;

  return (
    <div className="px-2 py-3">
      <Text as="h1" variant="metadataMedium" className="mb-2">
        {props.name}
      </Text>
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-between gap-1">
          <div className="overflow-hidden rounded-xs">
            <Avatar size={12} square={true} variant="pixel" name={props.createdBy.id} />
          </div>
          <Text variant="smallButton" color="grey-04">
            {props.createdBy.name ?? props.createdBy.id}
          </Text>
        </div>
        <div className="flex">
          <Text variant="smallButton" color="grey-04">
            {uniqueTripleChanges} {pluralize('edit', uniqueTripleChanges)} ·{' '}
            {new Date(props.createdAt).toLocaleDateString(undefined, {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}{' '}
            ·{' '}
            {new Date(props.createdAt).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </Text>
        </div>
      </div>
    </div>
  );
}
