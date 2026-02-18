import { verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SystemIds } from '@geoprotocol/geo-sdk';
import cx from 'classnames';

import { OrderDots } from '~/design-system/icons/order-dots';

import { DndItemsConfig, RenderItemProps, TableBlockDndItems, TableBlockDndItemsProps } from './table-block-dnd-items';
import { TableBlockListItem } from './table-block-list-item';

const renderItem = ({ row, isEditing, spaceId, onChangeEntry, onLinkEntry, properties, source, isPlaceholder, autoFocus }: RenderItemProps) => (
  <TableBlockListItem
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

const listConfig: DndItemsConfig = {
  sortingStrategy: verticalListSortingStrategy,
  outerClassName: (isEditing: boolean) => cx('flex w-full flex-col', isEditing ? 'gap-10' : 'gap-4'),
  itemsClassName: 'flex flex-col gap-4',
  sortableItemClassName: 'relative',
  sortableItemInnerClassName: 'flex items-center',
  positionBoxClassName: '-left-[152px] h-full items-center',
  renderItem,
  renderDragOverlay,
};

type TableBlockListItemsDndProps = Omit<TableBlockDndItemsProps, 'config'>;

const TableBlockListItemsDnd = (props: TableBlockListItemsDndProps) => (
  <TableBlockDndItems {...props} config={listConfig} />
);

export default TableBlockListItemsDnd;
