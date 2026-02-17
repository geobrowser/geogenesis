import { verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SystemIds } from '@geoprotocol/geo-sdk';

import { OrderDots } from '~/design-system/icons/order-dots';

import { TableBlockBulletedListItem } from './table-block-bulleted-list-item';
import { DndItemsConfig, RenderItemProps, TableBlockDndItems, TableBlockDndItemsProps } from './table-block-dnd-items';

const renderItem = ({ row, isEditing, spaceId, onChangeEntry, onLinkEntry, properties, source, isPlaceholder, autoFocus }: RenderItemProps) => (
  <TableBlockBulletedListItem
    isEditing={isEditing}
    columns={row.columns}
    currentSpaceId={spaceId}
    rowEntityId={row.entityId}
    isPlaceholder={isPlaceholder}
    onChangeEntry={onChangeEntry}
    onLinkEntry={onLinkEntry}
    properties={properties}
    relationId={row.columns[SystemIds.NAME_PROPERTY]?.relationId}
    source={source}
    autoFocus={autoFocus}
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

const bulletedListConfig: DndItemsConfig = {
  sortingStrategy: verticalListSortingStrategy,
  outerClassName: 'flex w-full flex-col',
  itemsClassName: 'flex flex-col',
  sortableItemClassName: 'relative',
  sortableItemInnerClassName: 'flex items-center',
  positionBoxClassName: '-left-[152px] h-full items-center',
  renderItem,
  renderDragOverlay,
};

type TableBlockBulletedListItemsDndProps = Omit<TableBlockDndItemsProps, 'config'>;

const TableBlockBulletedListItemsDnd = (props: TableBlockBulletedListItemsDndProps) => (
  <TableBlockDndItems {...props} config={bulletedListConfig} />
);

export default TableBlockBulletedListItemsDnd;
