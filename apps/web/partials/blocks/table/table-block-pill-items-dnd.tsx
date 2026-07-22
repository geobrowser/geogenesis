import { rectSortingStrategy } from '@dnd-kit/sortable';

import { OrderDots } from '~/design-system/icons/order-dots';

import { DndItemsConfig, RenderItemProps, TableBlockDndItems, TableBlockDndItemsProps } from './table-block-dnd-items';
import { TableBlockPillItem } from './table-block-pill-item';

const renderItem = ({
  row,
  isEditing,
  spaceId,
  onChangeEntry,
  onLinkEntry,
  source,
  isPlaceholder,
  autoFocus,
  placeholderFocusKey,
  collectionTypeFilters,
}: RenderItemProps) => (
  <TableBlockPillItem
    isEditing={isEditing}
    columns={row.columns}
    currentSpaceId={spaceId}
    rowEntityId={row.entityId}
    isPlaceholder={isPlaceholder}
    onChangeEntry={onChangeEntry}
    onLinkEntry={onLinkEntry}
    source={source}
    autoFocus={autoFocus}
    focusRequestKey={placeholderFocusKey}
    collectionTypeFilters={collectionTypeFilters}
  />
);

const renderDragOverlay = (props: RenderItemProps) => (
  <div className="relative" style={{ cursor: 'grabbing' }}>
    <div className="absolute -left-5 flex h-full items-center justify-center">
      <OrderDots color="#B6B6B6" />
    </div>
    {renderItem(props)}
  </div>
);

const pillConfig: DndItemsConfig = {
  sortingStrategy: rectSortingStrategy,
  outerClassName: 'flex w-full flex-col',
  itemsClassName: 'flex flex-wrap items-center gap-2',
  sortableItemClassName: 'relative min-w-0 max-w-full',
  sortableItemInnerClassName: 'flex min-w-0 max-w-full items-center',
  positionBoxClassName: '-left-[152px] h-full items-center',
  renderItem,
  renderDragOverlay,
};

type TableBlockPillItemsDndProps = Omit<TableBlockDndItemsProps, 'config'>;

const TableBlockPillItemsDnd = (props: TableBlockPillItemsDndProps) => (
  <TableBlockDndItems {...props} config={pillConfig} />
);

export default TableBlockPillItemsDnd;
