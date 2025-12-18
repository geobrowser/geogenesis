'use client';

import * as React from 'react';

import { Property } from '~/core/v2.types';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { PowerToolsActionsPopover } from './power-tools-actions-popover';

interface Props {
  selectedCount: number;
  editableSelectedCount: number;
  spaceId: string;
  properties: Property[];
  canUserEdit: boolean;
  onClearSelection: () => void;
  onAddValues: (propertyId: string, value?: string, entityIds?: string[], entityData?: Array<{ id: string; name: string | null }>) => void;
  onRemoveValues: (propertyId: string, value?: string, entityIds?: string[], entityData?: Array<{ id: string; name: string | null }>) => void;
  onAddRelations: (propertyId: string, value?: string, entityIds?: string[], entityData?: Array<{ id: string; name: string | null }>) => void;
  onRemoveRelations: (propertyId: string, value?: string, entityIds?: string[], entityData?: Array<{ id: string; name: string | null }>) => void;
  onAddProperty: (propertyId: string, propertyName: string) => void;
  onCopyRows: () => void;
  onPasteRows: () => void;
  canPaste: boolean;
}

export function BulkActionsBar({
  selectedCount,
  editableSelectedCount,
  spaceId,
  properties,
  canUserEdit,
  onClearSelection,
  onAddValues,
  onRemoveValues,
  onAddRelations,
  onRemoveRelations,
  onAddProperty,
  onCopyRows,
  onPasteRows,
  canPaste,
}: Props) {
  // Show the bar if we have selections OR if paste is available (and user can edit)
  const showPasteOption = canPaste && canUserEdit;
  if (selectedCount === 0 && !showPasteOption) {
    return null;
  }

  const handleOperation = (
    operation: 'add-values' | 'add-relations' | 'remove-values' | 'remove-relations',
    propertyId: string,
    value?: string,
    entityIds?: string[],
    entityData?: Array<{ id: string; name: string | null }>
  ) => {
    switch (operation) {
      case 'add-values':
        onAddValues(propertyId, value, entityIds, entityData);
        break;
      case 'add-relations':
        onAddRelations(propertyId, value, entityIds, entityData);
        break;
      case 'remove-values':
        onRemoveValues(propertyId, value, entityIds, entityData);
        break;
      case 'remove-relations':
        onRemoveRelations(propertyId, value, entityIds, entityData);
        break;
    }
  };

  return (
    <div className="border-b border-grey-02 bg-white px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectedCount > 0 ? (
            <Text variant="body" color="grey-04">
              {selectedCount} selected{editableSelectedCount < selectedCount ? ` (${editableSelectedCount} editable)` : ''}
            </Text>
          ) : (
            <Text variant="body" color="grey-04">
              Paste available
            </Text>
          )}

          {selectedCount > 0 && (
            <>
              <div className="h-6 w-px bg-grey-02" />

              <button
                onClick={onClearSelection}
                className="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-grey-01"
                title="Clear selection"
              >
                <Close />
              </button>
            </>
          )}
        </div>

        {/* Popover menu on the right */}
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <PowerToolsActionsPopover
              selectedCount={selectedCount}
              editableSelectedCount={editableSelectedCount}
              properties={properties}
              spaceId={spaceId}
              canUserEdit={canUserEdit}
              onOperation={handleOperation}
              onAddProperty={onAddProperty}
              onCopy={onCopyRows}
              onPaste={showPasteOption ? onPasteRows : undefined}
              canPaste={showPasteOption}
            />
          )}
        </div>
      </div>
    </div>
  );
}