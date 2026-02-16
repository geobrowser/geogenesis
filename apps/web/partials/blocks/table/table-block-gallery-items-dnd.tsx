import { rectSortingStrategy } from '@dnd-kit/sortable';
import { SystemIds } from '@geoprotocol/geo-sdk';

import { TableBlockGalleryItem } from './table-block-gallery-item';
import { DndItemsConfig, RenderItemProps, TableBlockDndItems, TableBlockDndItemsProps } from './table-block-dnd-items';

const renderItem = ({ row, isEditing, spaceId, onChangeEntry, onLinkEntry, properties, source, isPlaceholder, autoFocus }: RenderItemProps) => (
  <TableBlockGalleryItem
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
  <div className="" style={{ cursor: 'grabbing' }}>
    {renderItem(props)}
  </div>
);

const galleryConfig: DndItemsConfig = {
  sortingStrategy: rectSortingStrategy,
  itemsClassName: 'grid grid-cols-3 gap-x-4 gap-y-10 sm:grid-cols-2',
  sortableItemClassName: 'relative inline-block',
  sortableItemInnerClassName: '',
  positionBoxClassName: '-right-[58px] top-4 z-50 flex-col-reverse items-center',
  positionBoxIconClassName: ' p-[6px] rounded bg-white',
  renderItem,
  renderDragOverlay,
};

type TableBlockGalleryItemsDndProps = Omit<TableBlockDndItemsProps, 'config'>;

const TableBlockGalleryItemsDnd = (props: TableBlockGalleryItemsDndProps) => (
  <TableBlockDndItems {...props} config={galleryConfig} />
);

export default TableBlockGalleryItemsDnd;
