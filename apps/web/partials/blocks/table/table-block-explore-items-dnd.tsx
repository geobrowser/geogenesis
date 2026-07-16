import { verticalListSortingStrategy } from '@dnd-kit/sortable';

import cx from 'classnames';

import { OrderDots } from '~/design-system/icons/order-dots';

import { DndItemsConfig, RenderItemProps, TableBlockDndItems, TableBlockDndItemsProps } from './table-block-dnd-items';
import { TableBlockExploreItem } from './table-block-explore-item';

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
  <TableBlockExploreItem
    isEditing={isEditing}
    columns={row.columns}
    currentSpaceId={spaceId}
    blockSpaceId={spaceId}
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

const exploreConfig: DndItemsConfig = {
  sortingStrategy: verticalListSortingStrategy,
  outerClassName: (isEditing: boolean) => cx('flex w-full flex-col', isEditing ? 'gap-10' : ''),
  itemsClassName: 'flex flex-col',
  sortableItemClassName: 'relative w-full',
  sortableItemInnerClassName: 'flex w-full min-w-0 items-center [&>article]:w-full [&>article]:min-w-0',
  positionBoxClassName: '-left-[152px] h-full items-center',
  renderItem,
  renderDragOverlay,
};

type TableBlockExploreItemsDndProps = Omit<TableBlockDndItemsProps, 'config'>;

const TableBlockExploreItemsDnd = (props: TableBlockExploreItemsDndProps) => (
  <TableBlockDndItems {...props} config={exploreConfig} />
);

export default TableBlockExploreItemsDnd;
