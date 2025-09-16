'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import cx from 'classnames';

import * as React from 'react';

import { NavUtils } from '~/core/utils/utils';
import { Cell as CellType, Property, Row, Relation } from '~/core/v2.types';
import { useRelations } from '~/core/sync/use-store';
import { useName } from '~/core/state/entity-page-store/entity-store';

import { LinkableRelationChip } from '~/design-system/chip';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

interface Props {
  rows: Row[];
  properties: Property[];
  propertiesSchema: Record<string, Property> | null;
  spaceId: string;
  hasMore: boolean;
  loadMore: () => void;
  selectedRows: Set<string>;
  onSelectRow: (entityId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onSelectRange?: (startIndex: number, endIndex: number, selected: boolean) => void;
}

// Component to render a single relation chip
function RelationChip({ 
  relation, 
  spaceId 
}: { 
  relation: Relation; 
  spaceId: string;
}) {
  const relationId = relation.id;
  const relationValue = relation.toEntity.id;
  
  // Use the useName hook to get the actual entity name
  const entityName = useName(relationValue);
  const displayName = entityName || relation.toEntity.name || relation.toEntity.value || 'Untitled';

  return (
    <LinkableRelationChip
      isEditing={false}
      currentSpaceId={spaceId}
      entityId={relationValue}
      spaceId={relation.spaceId || spaceId}
      relationId={relationId}
      relationEntityId={relation.entityId} // Use the relation's entityId field to link to the relation entity
    >
      {displayName}
    </LinkableRelationChip>
  );
}

// Component to render relation cells with chips
function RelationCell({ 
  entityId, 
  property, 
  spaceId 
}: { 
  entityId: string; 
  property: Property; 
  spaceId: string;
}) {
  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === property.id && !r.isDeleted,
  });

  return (
    <div className="flex flex-wrap gap-1">
      {relations.map(relation => (
        <RelationChip 
          key={relation.toEntity.value || relation.id}
          relation={relation}
          spaceId={spaceId}
        />
      ))}
    </div>
  );
}

export function PowerToolsTable({
  rows,
  properties,
  propertiesSchema,
  spaceId,
  hasMore,
  loadMore,
  selectedRows,
  onSelectRow,
  onSelectAll,
  onSelectRange,
}: Props) {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = React.useState<number | null>(null);
  
  // Calculate selection state
  const allRowsSelected = rows.length > 0 && rows.every(row => selectedRows.has(row.entityId));
  const someRowsSelected = rows.some(row => selectedRows.has(row.entityId));
  
  const handleSelectAll = (checked: boolean) => {
    onSelectAll(checked);
  };
  
  const handleRowSelect = (entityId: string, checked: boolean, rowIndex?: number, event?: React.MouseEvent) => {
    // Handle keyboard shortcuts
    if (event && rowIndex !== undefined && onSelectRange) {
      const isShiftClick = event.shiftKey;
      const isMetaOrCtrlClick = event.metaKey || event.ctrlKey;
      
      if (isShiftClick && lastSelectedIndex !== null) {
        // Range selection
        const startIndex = Math.min(lastSelectedIndex, rowIndex);
        const endIndex = Math.max(lastSelectedIndex, rowIndex);
        onSelectRange(startIndex, endIndex, true);
        return;
      } else if (isMetaOrCtrlClick) {
        // Multi-selection (toggle)
        onSelectRow(entityId, !selectedRows.has(entityId));
        setLastSelectedIndex(rowIndex);
        return;
      }
    }
    
    // Normal selection
    onSelectRow(entityId, checked);
    if (rowIndex !== undefined) {
      setLastSelectedIndex(rowIndex);
    }
  };

  // Infinite scroll handler
  React.useEffect(() => {
    const handleScroll = () => {
      if (!tableRef.current || !hasMore || isLoadingMore) return;

      const { scrollTop, scrollHeight, clientHeight } = tableRef.current;
      
      // Load more when user scrolls to within 200px of bottom
      if (scrollHeight - scrollTop - clientHeight < 200) {
        setIsLoadingMore(true);
        loadMore();
        // Reset loading state after a short delay
        setTimeout(() => setIsLoadingMore(false), 500);
      }
    };

    const currentRef = tableRef.current;
    if (currentRef) {
      currentRef.addEventListener('scroll', handleScroll);
      return () => currentRef.removeEventListener('scroll', handleScroll);
    }
  }, [hasMore, loadMore, isLoadingMore]);

  // Get all unique property IDs from all rows
  const allPropertyIds = React.useMemo(() => {
    const propertySet = new Set<string>();
    
    // Always include Name property
    propertySet.add(SystemIds.NAME_PROPERTY);
    
    // Add all properties from schema
    if (propertiesSchema) {
      Object.keys(propertiesSchema).forEach(id => propertySet.add(id));
    }
    
    // Add any additional properties found in rows
    rows.forEach(row => {
      Object.keys(row.columns).forEach(id => propertySet.add(id));
    });
    
    return Array.from(propertySet);
  }, [rows, propertiesSchema]);

  const renderCell = (cell: CellType | undefined, propertyId: string, entityId: string) => {
    if (!cell) {
      return <td className="border-b border-grey-02 p-[10px] text-sm" />;
    }

    const property = propertiesSchema?.[propertyId];

    // Special handling for Name property
    if (propertyId === SystemIds.NAME_PROPERTY && cell.entityId) {
      return (
        <td className="border-b border-grey-02 p-[10px] text-sm">
          <Link
            href={NavUtils.toEntity(spaceId, cell.entityId)}
            className="text-blue-04 hover:underline"
          >
            {cell.name || cell.value || 'Untitled'}
          </Link>
        </td>
      );
    }

    // Handle relations with chips
    if (property?.dataType === 'RELATION') {
      return (
        <td className="border-b border-grey-02 p-[10px] text-sm relative">
          <RelationCell 
            entityId={entityId} 
            property={property} 
            spaceId={spaceId} 
          />
        </td>
      );
    }

    // Handle single relation from cell data
    if (cell.relation) {
      return (
        <td className="border-b border-grey-02 p-[10px] text-sm">
          <LinkableRelationChip
            isEditing={false}
            currentSpaceId={spaceId}
            entityId={cell.relation.id}
            spaceId={spaceId}
            relationId={undefined}
          >
            {cell.relation.name || 'Untitled'}
          </LinkableRelationChip>
        </td>
      );
    }

    // Handle regular values
    return (
      <td className="border-b border-grey-02 p-[10px] text-sm">
        {cell.value || cell.name || ''}
      </td>
    );
  };

  return (
    <div ref={tableRef} className="h-full overflow-auto">
      <div className="rounded-lg border border-grey-02 p-0">
        <div className="overflow-x-auto rounded-lg">
          <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
            <thead>
              <tr>
                <th className="group relative border-b border-grey-02 p-[10px] text-left min-w-[60px]">
                  <div className="flex h-full w-full items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allRowsSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someRowsSelected && !allRowsSelected;
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-grey-03 text-blue-04 focus:ring-blue-04"
                    />
                  </div>
                </th>
                {allPropertyIds.map(propertyId => {
                  const property = propertiesSchema?.[propertyId];
                  const displayName = property?.name || 
                    (propertyId === SystemIds.NAME_PROPERTY ? 'Name' : propertyId);
                  
                  return (
                    <th
                      key={propertyId}
                      className="group relative border-b border-grey-02 p-[10px] text-left min-w-[250px]"
                    >
                      <div className="flex h-full w-full items-center gap-[10px]">
                        <Text variant="smallTitle">{displayName}</Text>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const isSelected = selectedRows.has(row.entityId);
                return (
                  <tr 
                    key={`${row.entityId}-${rowIndex}`}
                    className={isSelected ? 'bg-blue-01 hover:bg-blue-01' : 'hover:bg-bg'}
                  >
                    <td className="border-b border-grey-02 p-[10px] text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleRowSelect(row.entityId, e.target.checked, rowIndex, e.nativeEvent as React.MouseEvent)}
                        onClick={(e) => {
                          // Prevent the default onChange behavior for keyboard shortcuts
                          if (e.shiftKey || e.metaKey || e.ctrlKey) {
                            e.preventDefault();
                            handleRowSelect(row.entityId, e.currentTarget.checked, rowIndex, e);
                          }
                        }}
                        className="rounded border-grey-03 text-blue-04 focus:ring-blue-04"
                      />
                    </td>
                    {allPropertyIds.map(propertyId => (
                      <React.Fragment key={`${row.entityId}-${propertyId}`}>
                        {renderCell(row.columns[propertyId], propertyId, row.entityId)}
                      </React.Fragment>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Loading indicator for infinite scroll */}
      {hasMore && (
        <div className="flex justify-center p-4">
          <Text variant="bodyMedium" color="grey-04">
            {isLoadingMore ? 'Loading more rows...' : 'Scroll to load more'}
          </Text>
        </div>
      )}
      
      {!hasMore && rows.length > 0 && (
        <div className="flex justify-center p-4">
          <Text variant="bodyMedium" color="grey-04">
            All {rows.length} rows loaded
          </Text>
        </div>
      )}
    </div>
  );
}