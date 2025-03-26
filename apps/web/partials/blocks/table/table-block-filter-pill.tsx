import { Filter } from '~/core/blocks/data/filters';
import { useEditable } from '~/core/state/editable-store';

import { IconButton } from '~/design-system/button';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { colors } from '~/design-system/theme/colors';

function PublishedFilterIconFilled() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.73511 0.5H9.26489C10.0543 0.5 10.5325 1.37186 10.1081 2.03755L7.76692 5.71008C7.51097 6.11158 7.375 6.57782 7.375 7.05396V10.125C7.375 10.8844 6.75939 11.5 6 11.5C5.24061 11.5 4.625 10.8844 4.625 10.125V7.05396C4.625 6.57782 4.48903 6.11158 4.23308 5.71008L1.89187 2.03755C1.46751 1.37186 1.94565 0.5 2.73511 0.5Z"
        fill={colors['light'].text}
        stroke={colors['light'].text}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TableBlockFilterPill({
  filter,
  onDelete,
}: {
  filter: Filter & { propertyName: string };
  onDelete: () => void;
}) {
  const { editable } = useEditable();
  const value = filter.valueType === 'RELATION' ? filter.valueName : filter.value;

  return (
    <div className="flex h-6 items-center gap-2 rounded bg-divider py-1 pl-2 pr-1 text-metadata">
      {/* @TODO: Use avatar if the filter is not published */}
      <PublishedFilterIconFilled />
      <div className="flex items-center gap-1">
        <span>{filter.propertyName} is</span>
        <span>·</span>
        <span>{value}</span>
      </div>
      {editable && <IconButton icon={<CheckCloseSmall />} color="grey-04" onClick={onDelete} />}
    </div>
  );
}
