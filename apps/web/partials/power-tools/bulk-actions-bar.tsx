'use client';

import * as React from 'react';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

interface Props {
  selectedCount: number;
  onClearSelection: () => void;
  onAddValues: () => void;
  onRemoveValues: () => void;
  onAddRelations: () => void;
  onRemoveRelations: () => void;
  onAddProperty: () => void;
  onCopyRows: () => void;
  onPasteRows: () => void;
  canPaste: boolean;
}

export function BulkActionsBar({
  selectedCount,
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

  return (
    <div className="border-b border-grey-02 bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        {selectedCount > 0 ? (
          <Text variant="bodyMedium" color="grey-04">
            {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
          </Text>
        ) : (
          <Text variant="bodyMedium" color="grey-04">
            Paste available
          </Text>
        )}
        
        <div className="h-6 w-px bg-grey-02" />
        
        <div className="flex items-center gap-2">
          <button
            onClick={onCopyRows}
            disabled={selectedCount === 0}
            className="relative inline-flex items-center justify-center rounded border font-medium tracking-[-0.17px] shadow-light transition duration-200 ease-in-out focus:outline-none border-grey-02 bg-white text-text shadow-button hover:border-text hover:bg-bg hover:!text-text focus:border-text focus:shadow-inner-text disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-grey-02 disabled:hover:bg-white gap-2 px-3 py-2 text-button leading-[1.125rem]"
            title="Copy selected rows (Ctrl+C)"
          >
            Copy
          </button>

          <button
            onClick={onPasteRows}
            disabled={!canPaste}
            className="relative inline-flex items-center justify-center rounded border font-medium tracking-[-0.17px] shadow-light transition duration-200 ease-in-out focus:outline-none border-grey-02 bg-white text-text shadow-button hover:border-text hover:bg-bg hover:!text-text focus:border-text focus:shadow-inner-text disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-grey-02 disabled:hover:bg-white gap-2 px-3 py-2 text-button leading-[1.125rem]"
            title="Paste rows (Ctrl+V)"
          >
            Paste
          </button>

          {selectedCount > 0 && (
            <>
              <div className="h-6 w-px bg-grey-02" />

              <button
                onClick={onAddValues}
                className="relative inline-flex items-center justify-center rounded border font-medium tracking-[-0.17px] shadow-light transition duration-200 ease-in-out focus:outline-none border-transparent bg-ctaPrimary text-white hover:bg-ctaHover focus:border-ctaHover focus:shadow-inner-ctaHover gap-2 px-3 py-2 text-button leading-[1.125rem]"
              >
                Add Values
              </button>

              <button
                onClick={onAddRelations}
                className="relative inline-flex items-center justify-center rounded border font-medium tracking-[-0.17px] shadow-light transition duration-200 ease-in-out focus:outline-none border-transparent bg-ctaPrimary text-white hover:bg-ctaHover focus:border-ctaHover focus:shadow-inner-ctaHover gap-2 px-3 py-2 text-button leading-[1.125rem]"
              >
                Add Relations
              </button>

              <button
                onClick={onAddProperty}
                className="relative inline-flex items-center justify-center rounded border font-medium tracking-[-0.17px] shadow-light transition duration-200 ease-in-out focus:outline-none border-transparent bg-ctaPrimary text-white hover:bg-ctaHover focus:border-ctaHover focus:shadow-inner-ctaHover gap-2 px-3 py-2 text-button leading-[1.125rem]"
              >
                Add Property
              </button>

              <button
                onClick={onRemoveValues}
                className="relative inline-flex items-center justify-center rounded border font-medium tracking-[-0.17px] shadow-light transition duration-200 ease-in-out focus:outline-none border-grey-02 bg-white text-text shadow-button hover:border-text hover:bg-bg hover:!text-text focus:border-text focus:shadow-inner-text gap-2 px-3 py-2 text-button leading-[1.125rem]"
              >
                Remove Values
              </button>

              <button
                onClick={onRemoveRelations}
                className="relative inline-flex items-center justify-center rounded border font-medium tracking-[-0.17px] shadow-light transition duration-200 ease-in-out focus:outline-none border-grey-02 bg-white text-text shadow-button hover:border-text hover:bg-bg hover:!text-text focus:border-text focus:shadow-inner-text gap-2 px-3 py-2 text-button leading-[1.125rem]"
              >
                Remove Relations
              </button>
            </>
          )}
        </div>
        
        {selectedCount > 0 && (
          <>
            <div className="h-6 w-px bg-grey-02" />

            <button
              onClick={onClearSelection}
              className="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-grey-01"
              title="Clear selection"
            >
              <Close className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}