import { colors } from '~/design-system/theme/colors';
import { TableBlockFilter } from '../../../core/state/table-block-store/table-block-store';
import { useEditable } from '~/core/state/editable-store/editable-store';
import { IconButton } from '~/design-system/button';

function PublishedFilterIconFilled() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.12976 0L2.87024 0C1.6588 0 0.947091 1.36185 1.63876 2.35643L4.45525 6.40634C4.48438 6.44823 4.5 6.49804 4.5 6.54907L4.5 10.5C4.5 11.3284 5.17157 12 6 12C6.82843 12 7.5 11.3284 7.5 10.5L7.5 6.54907C7.5 6.49804 7.51562 6.44823 7.54475 6.40634L10.3612 2.35642C11.0529 1.36185 10.3412 0 9.12976 0Z"
        fill={colors.light['text']}
      />
    </svg>
  );
}

export function TableBlockFilterPill({
  filter,
  onDelete,
}: {
  filter: TableBlockFilter & { columnName: string };
  onDelete: () => void;
}) {
  const { editable } = useEditable();
  const value = filter.valueType === 'entity' ? filter.valueName : filter.value;

  return (
    <div className="flex items-center gap-2 rounded bg-divider py-1 pl-2 pr-1 text-metadata">
      {/* @TODO: Use avatar if the filter is not published */}
      <PublishedFilterIconFilled />
      <div className="flex items-center gap-1">
        <span>{filter.columnName} is</span>
        <span>·</span>
        <span>{value}</span>
      </div>
      {editable && <IconButton icon="checkCloseSmall" color="grey-04" onClick={onDelete} />}
    </div>
  );
}
