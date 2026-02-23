'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { useVirtualizer } from '@tanstack/react-virtual';

import * as React from 'react';

import { Source } from '~/core/blocks/data/source';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useSpaceAwareValue } from '~/core/sync/use-store';
import { Property } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Text } from '~/design-system/text';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { EditableEntityTableCell } from '~/partials/entity-page/editable-entity-table-cell';
import { EntityTableCell } from '~/partials/entities-page/entity-table-cell';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';

import { PowerToolsRow } from './types';
import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';

interface Props {
  rows: PowerToolsRow[];
  properties: Property[];
  spaceId: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  onOpenEntityPanel?: (entityId: string, spaceId: string) => void;
  source: Source;
}

const ROW_HEIGHT_ESTIMATE = 56;
const HEADER_HEIGHT = 44;

function NameCell({
  row,
  property,
  spaceId,
  isEditing,
  isRowEditable,
  onChangeEntry,
  onLinkEntry,
  onOpenEntityPanel,
  source,
}: {
  row: PowerToolsRow;
  property: Property;
  spaceId: string;
  isEditing: boolean;
  isRowEditable: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  onOpenEntityPanel?: (entityId: string, spaceId: string) => void;
  source: Source;
}) {
  const nameValue = useSpaceAwareValue({
    entityId: row.entityId,
    propertyId: SystemIds.NAME_PROPERTY,
    spaceId: row.spaceId,
  });

  const name = nameValue?.value ?? null;

  if (isEditing && isRowEditable) {
    return (
      <EditableEntityTableCell
        entityId={row.entityId}
        spaceId={row.spaceId}
        property={property}
        isPlaceholderRow={Boolean(row.placeholder)}
        name={name}
        currentSpaceId={spaceId}
        collectionId={row.collectionId}
        relationId={row.relationId}
        toSpaceId={row.toSpaceId}
        verified={row.verified}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        source={source}
        autoFocus={false}
      />
    );
  }

  const href = NavUtils.toEntity(row.toSpaceId ?? row.spaceId, row.entityId);
  const handleOpen = (event: React.MouseEvent) => {
    if (!onOpenEntityPanel) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
      return;
    }
    event.preventDefault();
    onOpenEntityPanel(row.entityId, row.toSpaceId ?? row.spaceId);
  };

  if (source.type === 'COLLECTION') {
    return (
      <CollectionMetadata
        view="TABLE"
        isEditing={false}
        name={name}
        currentSpaceId={spaceId}
        entityId={row.entityId}
        spaceId={row.spaceId}
        collectionId={row.collectionId}
        relationId={row.relationId}
        verified={row.verified}
        onLinkEntry={onLinkEntry}
      >
        <Link
          entityId={row.entityId}
          spaceId={row.spaceId}
          href={href}
          className="break-words text-tableCell text-ctaHover hover:underline"
          onClick={handleOpen}
        >
          {name || row.entityId}
        </Link>
      </CollectionMetadata>
    );
  }

  return (
    <Link
      entityId={row.entityId}
      href={href}
      className="break-words text-tableCell text-ctaHover hover:underline"
      onClick={handleOpen}
    >
      {name || row.entityId}
    </Link>
  );

}

function PowerToolsCell({
  row,
  property,
  spaceId,
  isEditing,
  isRowEditable,
  onChangeEntry,
  onLinkEntry,
  onOpenEntityPanel,
  source,
}: {
  row: PowerToolsRow;
  property: Property;
  spaceId: string;
  isEditing: boolean;
  isRowEditable: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  onOpenEntityPanel?: (entityId: string, spaceId: string) => void;
  source: Source;
}) {
  if (row.placeholder && property.id !== SystemIds.NAME_PROPERTY && !isEditing) {
    return <Text variant="body" color="grey-04">—</Text>;
  }

  if (property.id === SystemIds.NAME_PROPERTY) {
    return (
      <NameCell
        row={row}
        property={property}
        spaceId={spaceId}
        isEditing={isEditing}
        isRowEditable={isRowEditable}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        onOpenEntityPanel={onOpenEntityPanel}
        source={source}
      />
    );
  }

  if (isEditing && isRowEditable) {
    return (
      <EditableEntityTableCell
        entityId={row.entityId}
        spaceId={row.spaceId}
        property={property}
        isPlaceholderRow={Boolean(row.placeholder)}
        name={null}
        currentSpaceId={spaceId}
        collectionId={row.collectionId}
        relationId={row.relationId}
        toSpaceId={row.toSpaceId}
        verified={row.verified}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        source={source}
        autoFocus={false}
      />
    );
  }

  return (
    <EntityTableCell
      entityId={row.entityId}
      spaceId={row.spaceId}
      property={property}
      isExpanded={true}
      name={null}
      href={NavUtils.toEntity(row.toSpaceId ?? row.spaceId, row.entityId)}
      currentSpaceId={spaceId}
      collectionId={row.collectionId}
      relationId={row.relationId}
      verified={row.verified}
      onLinkEntry={onLinkEntry}
      source={source}
    />
  );
}

export function PowerToolsTable({
  rows,
  properties,
  spaceId,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onChangeEntry,
  onLinkEntry,
  onOpenEntityPanel,
  source,
}: Props) {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const isEditing = useUserIsEditing(spaceId);
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = React.useState<string | null>(null);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(0);

  React.useEffect(() => {
    setColumnWidths(prev => {
      const widths: Record<string, number> = {};
      for (const prop of properties) {
        if (!prev[prop.id]) {
          const renderableType = prop.renderableTypeStrict ?? prop.dataType;
          const isDateColumn = renderableType === 'TIME' || renderableType === 'DATE' || renderableType === 'DATETIME';
          widths[prop.id] = isDateColumn ? 320 : 200;
        }
      }
      if (Object.keys(widths).length === 0) return prev;
      return { ...prev, ...widths };
    });
  }, [properties]);

  const handleMouseDown = (event: React.MouseEvent, propertyId: string) => {
    event.preventDefault();
    setIsResizing(propertyId);
    startXRef.current = event.clientX;
    startWidthRef.current = columnWidths[propertyId] || 200;
  };

  React.useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const diff = event.clientX - startXRef.current;
      const newWidth = Math.max(120, startWidthRef.current + diff);
      setColumnWidths(prev => ({
        ...prev,
        [isResizing]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setIsResizing(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 6,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const columnLayout = React.useMemo(() => {
    let offset = 0;
    const layout = properties.map(property => {
      const width = columnWidths[property.id] || 200;
      const left = offset;
      offset += width;
      return { property, left, width };
    });
    const template = layout.map(col => `${col.width}px`).join(' ');
    return {
      totalWidth: offset,
      template,
      columns: layout,
    };
  }, [properties, columnWidths]);

  React.useEffect(() => {
    const lastItem = virtualRows[virtualRows.length - 1];
    if (!lastItem) return;

    if (lastItem.index >= rows.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualRows, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div ref={tableRef} className="h-full w-full overflow-auto">
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div
          className="grid border-b border-grey-02 bg-grey-01"
          style={{
            height: HEADER_HEIGHT,
            minWidth: columnLayout.totalWidth,
            gridTemplateColumns: columnLayout.template,
          }}
        >
          {columnLayout.columns.map(({ property }) => {
            return (
              <div
                key={property.id}
                className="relative flex h-full items-center border-r border-grey-02 bg-grey-01 px-3"
              >
                <Text variant="metadata" className="truncate">
                  {property.name || property.id}
                </Text>
                <div
                  className="absolute right-0 top-0 h-full w-3 cursor-col-resize hover:bg-blue-04/50"
                  onMouseDown={event => handleMouseDown(event, property.id)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          minHeight: '100%',
          position: 'relative',
          minWidth: columnLayout.totalWidth,
        }}
      >
        {virtualRows.map(virtualRow => {
          const row = rows[virtualRow.index];
          const rowId = row.entityId;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={node => rowVirtualizer.measureElement(node)}
              className={`absolute left-0 top-0 border-b border-grey-02 ${
                row.placeholder ? 'bg-grey-01' : !isEditing ? 'bg-grey-01/50' : 'hover:bg-grey-01'
              }`}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                width: '100%',
                zIndex: 1,
              }}
            >
              <div
                className="grid"
                style={{
                  minWidth: columnLayout.totalWidth,
                  gridTemplateColumns: columnLayout.template,
                }}
              >
                {columnLayout.columns.map(({ property }) => {
                  return (
                    <div
                      key={`${rowId}-${property.id}`}
                      className="border-r border-grey-02 px-4 py-2"
                    >
                      <div className="flex w-full items-start gap-2 overflow-visible">
                        <PowerToolsCell
                          row={row}
                          property={property}
                          spaceId={spaceId}
                          isEditing={isEditing}
                          isRowEditable={isEditing}
                          onChangeEntry={onChangeEntry}
                          onLinkEntry={onLinkEntry}
                          onOpenEntityPanel={onOpenEntityPanel}
                          source={source}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
