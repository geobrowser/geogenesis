'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as React from 'react';

import { Property } from '~/core/v2.types';

import { SystemIds } from '@graphprotocol/grc-20';

import { ChevronLeft } from '~/design-system/icons/chevron-left';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Edit } from '~/design-system/icons/edit';
import { MenuItem } from '~/design-system/menu';
import { SelectEntity } from '~/design-system/select-entity';
import { Text } from '~/design-system/text';

type ViewState = 'main' | 'add' | 'remove' | 'add-property';
type OperationType = 'add-values' | 'add-relations' | 'remove-values' | 'remove-relations';

interface Props {
  selectedCount: number;
  properties: Property[];
  spaceId: string;
  onOperation: (operation: OperationType, propertyId: string, value?: string, entityId?: string) => void;
  onAddProperty?: (propertyId: string, propertyName: string) => void;
  onCopy?: () => void;
  onPaste?: () => void;
  canPaste?: boolean;
}

export function PowerToolsActionsPopover({
  selectedCount,
  properties,
  spaceId,
  onOperation,
  onAddProperty,
  onCopy,
  onPaste,
  canPaste = false,
}: Props) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [currentView, setCurrentView] = React.useState<ViewState>('main');
  const [selectedPropertyId, setSelectedPropertyId] = React.useState('');
  const [inputValue, setInputValue] = React.useState('');
  const [selectedEntityId, setSelectedEntityId] = React.useState('');
  const [currentOperation, setCurrentOperation] = React.useState<OperationType | null>(null);

  // Reset state when closing
  React.useEffect(() => {
    if (!isOpen) {
      setCurrentView('main');
      setSelectedPropertyId('');
      setInputValue('');
      setSelectedEntityId('');
      setCurrentOperation(null);
    }
  }, [isOpen]);

  const handleBack = () => {
    if (currentView === 'add' || currentView === 'remove' || currentView === 'add-property') {
      setCurrentView('main');
      setSelectedPropertyId('');
      setInputValue('');
      setSelectedEntityId('');
      setCurrentOperation(null);
    }
  };

  const handleAddClick = () => {
    setCurrentView('add');
  };

  const handleRemoveClick = () => {
    setCurrentView('remove');
  };

  const handleAddPropertyClick = () => {
    setCurrentView('add-property');
  };

  const handleConfirm = () => {
    if (!selectedPropertyId || !currentOperation) return;

    const selectedProperty = properties.find(p => p.id === selectedPropertyId);
    const isRelationProperty = selectedProperty?.dataType === 'RELATION';

    if (currentOperation === 'add-relations' || currentOperation === 'add-values') {
      const value = isRelationProperty ? selectedEntityId : inputValue;
      const entityId = isRelationProperty ? selectedEntityId : undefined;

      if (isRelationProperty && !selectedEntityId) return;

      onOperation(currentOperation, selectedPropertyId, value, entityId);
    } else {
      // Remove operations
      const value = isRelationProperty ? selectedEntityId : inputValue;
      const entityId = isRelationProperty ? selectedEntityId : undefined;

      onOperation(currentOperation, selectedPropertyId, value, entityId);
    }

    setIsOpen(false);
  };

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const isRelationProperty = selectedProperty?.dataType === 'RELATION';

  const canConfirm = selectedPropertyId.length > 0 &&
    (currentOperation?.includes('add') && isRelationProperty ? selectedEntityId.length > 0 : true);

  return (
    <Dropdown.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dropdown.Trigger asChild>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01"
          title="Edit selected items"
        >
          {isOpen ? <Close color="grey-04" /> : <Edit color="grey-04" />}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          className="z-[1001] block min-w-[280px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
          align="end"
        >
          {/* Main view */}
          {currentView === 'main' && (
            <>
              <div className="border-b border-grey-02 px-4 py-3">
                <Text variant="smallTitle">{selectedCount} selected</Text>
              </div>

              <MenuItem>
                <button
                  onClick={handleAddClick}
                  className="flex w-full items-center justify-between gap-2"
                >
                  <span>Add</span>
                  <ChevronRight />
                </button>
              </MenuItem>

              <MenuItem>
                <button
                  onClick={handleRemoveClick}
                  className="flex w-full items-center justify-between gap-2"
                >
                  <span>Remove</span>
                  <ChevronRight />
                </button>
              </MenuItem>

              {onAddProperty && (
                <MenuItem>
                  <button
                    onClick={handleAddPropertyClick}
                    className="flex w-full items-center justify-between gap-2"
                  >
                    <span>Add Property</span>
                    <ChevronRight />
                  </button>
                </MenuItem>
              )}

              {onCopy && (
                <MenuItem>
                  <button
                    onClick={() => {
                      onCopy();
                      setIsOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2"
                  >
                    <span>Copy</span>
                  </button>
                </MenuItem>
              )}

              {onPaste && canPaste && (
                <MenuItem>
                  <button
                    onClick={() => {
                      onPaste();
                      setIsOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2"
                  >
                    <span>Paste</span>
                  </button>
                </MenuItem>
              )}
            </>
          )}

          {/* Add view */}
          {currentView === 'add' && (
            <div className="min-w-[320px]">
              <div className="border-b border-grey-02 px-4 py-3">
                <button
                  onClick={handleBack}
                  className="mb-2 flex items-center gap-1 text-sm text-grey-04 hover:text-text"
                >
                  <ChevronLeft />
                  <span>Back</span>
                </button>
                <Text variant="smallTitle">Add to {selectedCount} items</Text>
              </div>

              <div className="space-y-3 p-4">
                {/* Property Selection */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-grey-04">
                    Select Property
                  </label>
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => {
                      setSelectedPropertyId(e.target.value);
                      const prop = properties.find(p => p.id === e.target.value);
                      if (prop?.dataType === 'RELATION') {
                        setCurrentOperation('add-relations');
                      } else {
                        setCurrentOperation('add-values');
                      }
                    }}
                    className="w-full rounded-sm border border-grey-03 px-3 py-2 text-sm focus:border-blue-04 focus:outline-none focus:ring-1 focus:ring-blue-04"
                  >
                    <option value="">Choose a property...</option>
                    {properties.map(property => (
                      <option key={property.id} value={property.id}>
                        {property.name || property.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Value/Entity Input */}
                {selectedPropertyId && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-grey-04">
                      {isRelationProperty ? 'Entity to link' : 'Value to add'}
                    </label>
                    {isRelationProperty ? (
                      <SelectEntity
                        spaceId={spaceId}
                        relationValueTypes={selectedProperty?.relationValueTypes}
                        placeholder="Find or create entity..."
                        onDone={(result) => {
                          setSelectedEntityId(result.id);
                        }}
                        containerClassName="w-full"
                        width="full"
                      />
                    ) : (
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Enter value..."
                        className="w-full rounded-sm border border-grey-03 px-3 py-2 text-sm focus:border-blue-04 focus:outline-none focus:ring-1 focus:ring-blue-04"
                      />
                    )}
                    {isRelationProperty && selectedEntityId && (
                      <div className="mt-2 text-xs text-grey-04">
                        Selected: {selectedEntityId}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                {selectedPropertyId && (
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={handleBack}
                      className="px-3 py-1.5 text-sm text-grey-04 hover:text-text"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirm}
                      disabled={!canConfirm}
                      className="rounded bg-action px-3 py-1.5 text-sm text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:bg-grey-02 disabled:text-grey-04"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Remove view */}
          {currentView === 'remove' && (
            <div className="min-w-[320px]">
              <div className="border-b border-grey-02 px-4 py-3">
                <button
                  onClick={handleBack}
                  className="mb-2 flex items-center gap-1 text-sm text-grey-04 hover:text-text"
                >
                  <ChevronLeft />
                  <span>Back</span>
                </button>
                <Text variant="smallTitle">Remove from {selectedCount} items</Text>
              </div>

              <div className="space-y-3 p-4">
                {/* Property Selection */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-grey-04">
                    Select Property
                  </label>
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => {
                      setSelectedPropertyId(e.target.value);
                      const prop = properties.find(p => p.id === e.target.value);
                      if (prop?.dataType === 'RELATION') {
                        setCurrentOperation('remove-relations');
                      } else {
                        setCurrentOperation('remove-values');
                      }
                    }}
                    className="w-full rounded-sm border border-grey-03 px-3 py-2 text-sm focus:border-blue-04 focus:outline-none focus:ring-1 focus:ring-blue-04"
                  >
                    <option value="">Choose a property...</option>
                    {properties.map(property => (
                      <option key={property.id} value={property.id}>
                        {property.name || property.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Value/Entity Input */}
                {selectedPropertyId && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-grey-04">
                      {isRelationProperty ? 'Entity to unlink (optional)' : 'Value to remove (optional)'}
                    </label>
                    {isRelationProperty ? (
                      <SelectEntity
                        spaceId={spaceId}
                        relationValueTypes={selectedProperty?.relationValueTypes}
                        placeholder="Find entity (leave empty for all)..."
                        onDone={(result) => {
                          setSelectedEntityId(result.id);
                        }}
                        containerClassName="w-full"
                        width="full"
                      />
                    ) : (
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Leave empty to remove all..."
                        className="w-full rounded-sm border border-grey-03 px-3 py-2 text-sm focus:border-blue-04 focus:outline-none focus:ring-1 focus:ring-blue-04"
                      />
                    )}
                    {isRelationProperty && selectedEntityId && (
                      <div className="mt-2 text-xs text-grey-04">
                        Selected: {selectedEntityId}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-grey-04">
                      Leave empty to remove all values/relations for this property
                    </p>
                  </div>
                )}

                {/* Actions */}
                {selectedPropertyId && (
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={handleBack}
                      className="px-3 py-1.5 text-sm text-grey-04 hover:text-text"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirm}
                      disabled={!selectedPropertyId}
                      className="rounded bg-grey-02 px-3 py-1.5 text-sm hover:bg-grey-03 disabled:cursor-not-allowed disabled:text-grey-04"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add Property view */}
          {currentView === 'add-property' && (
            <div className="min-w-[320px]">
              <div className="border-b border-grey-02 px-4 py-3">
                <button
                  onClick={handleBack}
                  className="mb-2 flex items-center gap-1 text-sm text-grey-04 hover:text-text"
                >
                  <ChevronLeft />
                  <span>Back</span>
                </button>
                <Text variant="smallTitle">Add property to {selectedCount} items</Text>
              </div>

              <div className="space-y-3 p-4">
                {/* Property Selection */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-grey-04">
                    Find or create property
                  </label>
                  <SelectEntity
                    spaceId={spaceId}
                    relationValueTypes={[{ id: SystemIds.PROPERTY, name: 'Property' }]}
                    placeholder="Find or create property..."
                    onCreateEntity={(result) => {
                      if (onAddProperty) {
                        onAddProperty(result.id, result.name || '');
                      }
                      setIsOpen(false);
                    }}
                    onDone={(result) => {
                      if (result && onAddProperty) {
                        onAddProperty(result.id, result.name || '');
                      }
                      setIsOpen(false);
                    }}
                    containerClassName="w-full"
                    width="full"
                  />
                </div>
              </div>
            </div>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}