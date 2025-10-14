'use client';

import * as React from 'react';

import { Property } from '~/core/v2.types';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { PowerToolsActionsPopover } from './power-tools-actions-popover';

interface Props {
  selectedCount: number;
  spaceId: string;
  properties: Property[];
  onClearSelection: () => void;
  onAddValues: (propertyId: string, value?: string, entityId?: string) => void;
  onRemoveValues: (propertyId: string, value?: string, entityId?: string) => void;
  onAddRelations: (propertyId: string, value?: string, entityId?: string) => void;
  onRemoveRelations: (propertyId: string, value?: string, entityId?: string) => void;
  onAddProperty: (propertyId: string, propertyName: string) => void;
  onCopyRows: () => void;
  onPasteRows: () => void;
  canPaste: boolean;
}

export function BulkActionsBar({
  selectedCount,
  spaceId,
  properties,
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
  // Show the bar if we have selections OR if paste is available
  if (selectedCount === 0 && !canPaste) {
    return null;
  }

  const handleOperation = (
    operation: 'add-values' | 'add-relations' | 'remove-values' | 'remove-relations',
    propertyId: string,
    value?: string,
    entityId?: string
  ) => {
    switch (operation) {
      case 'add-values':
        onAddValues(propertyId, value, entityId);
        break;
      case 'add-relations':
        onAddRelations(propertyId, value, entityId);
        break;
      case 'remove-values':
        onRemoveValues(propertyId, value, entityId);
        break;
      case 'remove-relations':
        onRemoveRelations(propertyId, value, entityId);
        break;
    }
  };

  return (
    <div className="border-b border-grey-02 bg-white px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {selectedCount > 0 ? (
            <Text variant="body" color="grey-04">
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
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
              properties={properties}
              spaceId={spaceId}
              onOperation={handleOperation}
              onAddProperty={onAddProperty}
              onCopy={onCopyRows}
              onPaste={canPaste ? onPasteRows : undefined}
              canPaste={canPaste}
            />
          )}
        </div>
      </div>
    </div>
  );
}