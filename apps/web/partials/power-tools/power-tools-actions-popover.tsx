'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as React from 'react';

import { Property } from '~/core/v2.types';

import { SystemIds } from '@graphprotocol/grc-20';

import { SquareButton } from '~/design-system/button';
import { LinkableRelationChip } from '~/design-system/chip';
import { ChevronLeft } from '~/design-system/icons/chevron-left';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { Create } from '~/design-system/icons/create';
import { Edit } from '~/design-system/icons/edit';
import { MenuItem } from '~/design-system/menu';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

type ViewState = 'main' | 'add' | 'remove' | 'add-property';
type OperationType = 'add-values' | 'add-relations' | 'remove-values' | 'remove-relations';

interface Props {
  selectedCount: number;
  editableSelectedCount: number;
  properties: Property[];
  spaceId: string;
  canUserEdit: boolean;
  onOperation: (operation: OperationType, propertyId: string, value?: string, entityIds?: string[], entityData?: Array<{ id: string; name: string | null }>) => void;
  onAddProperty?: (propertyId: string, propertyName: string) => void;
  onCopy?: () => void;
  onPaste?: () => void;
  canPaste?: boolean;
}

export function PowerToolsActionsPopover({
  selectedCount,
  editableSelectedCount,
  properties,
  spaceId,
  canUserEdit,
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
  const [selectedRelationIds, setSelectedRelationIds] = React.useState<Array<{ id: string; name: string | null }>>([]);
  const [currentOperation, setCurrentOperation] = React.useState<OperationType | null>(null);

  // Reset state when closing
  React.useEffect(() => {
    if (!isOpen) {
      setCurrentView('main');
      setSelectedPropertyId('');
      setInputValue('');
      setSelectedRelationIds([]);
      setCurrentOperation(null);
    }
  }, [isOpen]);

  const handleBack = () => {
    if (currentView === 'add' || currentView === 'remove' || currentView === 'add-property') {
      setCurrentView('main');
      setSelectedPropertyId('');
      setInputValue('');
      setSelectedRelationIds([]);
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
      const value = isRelationProperty ? selectedRelationIds.map(r => r.id).join(',') : inputValue;
      const entityIds = isRelationProperty ? selectedRelationIds.map(r => r.id) : undefined;
      const entityData = isRelationProperty ? selectedRelationIds : undefined;

      if (isRelationProperty && selectedRelationIds.length === 0) return;

      onOperation(currentOperation, selectedPropertyId, value, entityIds, entityData);
    } else {
      // Remove operations
      const value = isRelationProperty ? selectedRelationIds.map(r => r.id).join(',') : inputValue;
      const entityIds = isRelationProperty ? selectedRelationIds.map(r => r.id) : undefined;
      const entityData = isRelationProperty ? selectedRelationIds : undefined;

      onOperation(currentOperation, selectedPropertyId, value, entityIds, entityData);
    }

    setIsOpen(false);
  };

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const isRelationProperty = selectedProperty?.dataType === 'RELATION';

  const canConfirm = selectedPropertyId.length > 0 &&
    (currentOperation?.includes('add') && isRelationProperty ? selectedRelationIds.length > 0 : true);

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
          className="z-[1001] block min-w-[280px] max-h-[600px] overflow-y-auto rounded-lg border border-grey-02 bg-white shadow-lg"
          align="end"
        >
          {/* Main view */}
          {currentView === 'main' && (
            <>
              <div className="border-b border-grey-02 px-4 py-3">
                <Text variant="smallTitle">
                  {selectedCount} selected
                  {editableSelectedCount < selectedCount && (
                    <span className="ml-1 text-grey-04 font-normal">
                      ({editableSelectedCount} editable)
                    </span>
                  )}
                </Text>
              </div>

              <MenuItem>
                <button
                  onClick={handleAddClick}
                  disabled={!canUserEdit || editableSelectedCount === 0}
                  className={`flex w-full items-center justify-between gap-2 ${
                    !canUserEdit || editableSelectedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <span>Add</span>
                  <ChevronRight />
                </button>
              </MenuItem>

              <MenuItem>
                <button
                  onClick={handleRemoveClick}
                  disabled={!canUserEdit || editableSelectedCount === 0}
                  className={`flex w-full items-center justify-between gap-2 ${
                    !canUserEdit || editableSelectedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <span>Remove</span>
                  <ChevronRight />
                </button>
              </MenuItem>

              {onAddProperty && (
                <MenuItem>
                  <button
                    onClick={handleAddPropertyClick}
                    disabled={!canUserEdit || editableSelectedCount === 0}
                    className={`flex w-full items-center justify-between gap-2 ${
                      !canUserEdit || editableSelectedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
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
                <Text variant="smallTitle">Add to {editableSelectedCount} editable item{editableSelectedCount !== 1 ? 's' : ''}</Text>
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
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedRelationIds.length === 0 ? (
                          <div className="w-full">
                            <SelectEntity
                              spaceId={spaceId}
                              relationValueTypes={selectedProperty?.relationValueTypes}
                              placeholder="Find or create entity..."
                              onDone={(result) => {
                                if (!selectedRelationIds.some(r => r.id === result.id)) {
                                  setSelectedRelationIds([...selectedRelationIds, { id: result.id, name: result.name }]);
                                }
                              }}
                              containerClassName="w-full"
                              width="full"
                              variant="fixed"
                            />
                          </div>
                        ) : (
                          <>
                            {selectedRelationIds.map((relation) => (
                              <div key={relation.id} className="mt-1">
                                <LinkableRelationChip
                                  isEditing
                                  onDelete={() => {
                                    setSelectedRelationIds(selectedRelationIds.filter(r => r.id !== relation.id));
                                  }}
                                  currentSpaceId={spaceId}
                                  entityId={relation.id}
                                  spaceId={spaceId}
                                >
                                  {relation.name || relation.id}
                                </LinkableRelationChip>
                              </div>
                            ))}
                            <div className="mt-1">
                              <SelectEntityAsPopover
                                trigger={<SquareButton icon={<Create />} />}
                                relationValueTypes={selectedProperty?.relationValueTypes}
                                onDone={(result) => {
                                  if (!selectedRelationIds.some(r => r.id === result.id)) {
                                    setSelectedRelationIds([...selectedRelationIds, { id: result.id, name: result.name }]);
                                  }
                                }}
                                spaceId={spaceId}
                                zIndex={1002}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Enter value..."
                        className="w-full rounded-sm border border-grey-03 px-3 py-2 text-sm focus:border-blue-04 focus:outline-none focus:ring-1 focus:ring-blue-04"
                      />
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
                      className="rounded border px-3 py-1.5 text-sm border-transparent bg-ctaPrimary text-white hover:bg-ctaHover disabled:cursor-not-allowed disabled:border-grey-03 disabled:bg-white disabled:text-grey-04"
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
                <Text variant="smallTitle">Remove from {editableSelectedCount} editable item{editableSelectedCount !== 1 ? 's' : ''}</Text>
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
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {selectedRelationIds.length === 0 ? (
                            <div className="w-full">
                              <SelectEntity
                                spaceId={spaceId}
                                relationValueTypes={selectedProperty?.relationValueTypes}
                                placeholder="Find entity (leave empty for all)..."
                                onDone={(result) => {
                                  if (!selectedRelationIds.some(r => r.id === result.id)) {
                                    setSelectedRelationIds([...selectedRelationIds, { id: result.id, name: result.name }]);
                                  }
                                }}
                                containerClassName="w-full"
                                width="full"
                                variant="fixed"
                              />
                            </div>
                          ) : (
                            <>
                              {selectedRelationIds.map((relation) => (
                                <div key={relation.id} className="mt-1">
                                  <LinkableRelationChip
                                    isEditing
                                    onDelete={() => {
                                      setSelectedRelationIds(selectedRelationIds.filter(r => r.id !== relation.id));
                                    }}
                                    currentSpaceId={spaceId}
                                    entityId={relation.id}
                                    spaceId={spaceId}
                                  >
                                    {relation.name || relation.id}
                                  </LinkableRelationChip>
                                </div>
                              ))}
                              <div className="mt-1">
                                <SelectEntityAsPopover
                                  trigger={<SquareButton icon={<Create />} />}
                                  relationValueTypes={selectedProperty?.relationValueTypes}
                                  onDone={(result) => {
                                    if (!selectedRelationIds.some(r => r.id === result.id)) {
                                      setSelectedRelationIds([...selectedRelationIds, { id: result.id, name: result.name }]);
                                    }
                                  }}
                                  spaceId={spaceId}
                                  zIndex={1002}
                                />
                              </div>
                            </>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-grey-04">
                          Leave empty to remove all relations for this property
                        </p>
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          placeholder="Leave empty to remove all..."
                          className="w-full rounded-sm border border-grey-03 px-3 py-2 text-sm focus:border-blue-04 focus:outline-none focus:ring-1 focus:ring-blue-04"
                        />
                        <p className="mt-2 text-xs text-grey-04">
                          Leave empty to remove all values for this property
                        </p>
                      </>
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
                      disabled={!selectedPropertyId}
                      className="rounded border px-3 py-1.5 text-sm border-transparent bg-ctaPrimary text-white hover:bg-ctaHover disabled:cursor-not-allowed disabled:border-grey-03 disabled:bg-white disabled:text-grey-04"
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
                <Text variant="smallTitle">Add property to {editableSelectedCount} editable item{editableSelectedCount !== 1 ? 's' : ''}</Text>
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