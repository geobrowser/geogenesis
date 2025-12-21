'use client';

import * as React from 'react';

import { Property } from '~/core/v2.types';

import { SystemIds, Position } from '@graphprotocol/grc-20';
import { useCreateProperty } from '~/core/hooks/use-create-property';
import { SquareButton } from '~/design-system/button';
import { LinkableRelationChip } from '~/design-system/chip';
import { Close } from '~/design-system/icons/close';
import { Create } from '~/design-system/icons/create';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';
import { ID } from '~/core/id';

export type BulkEditOperation = 'add-values' | 'remove-values' | 'add-relations' | 'remove-relations' | 'add-property';

interface Props {
  isOpen: boolean;
  operation: BulkEditOperation | null;
  selectedCount: number;
  properties: Property[];
  spaceId: string;
  selectedEntityIds?: string[];
  onClose: () => void;
  onConfirm: (propertyId: string, value: string, entityIds?: string[]) => void;
  onAddProperty?: (propertyId: string, propertyName: string) => void;
}

export function BulkEditModal({
  isOpen,
  operation,
  selectedCount,
  properties,
  spaceId,
  selectedEntityIds,
  onClose,
  onConfirm,
  onAddProperty,
}: Props) {
  const { createProperty } = useCreateProperty(spaceId);
  const [selectedPropertyId, setSelectedPropertyId] = React.useState('');
  const [inputValue, setInputValue] = React.useState('');
  const [selectedRelationIds, setSelectedRelationIds] = React.useState<Array<{ id: string; name: string | null }>>([]);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedPropertyId('');
      setInputValue('');
      setSelectedRelationIds([]);
    }
  }, [isOpen]);

  if (!isOpen || !operation) {
    return null;
  }

  const getTitle = () => {
    switch (operation) {
      case 'add-values':
        return 'Add Values';
      case 'remove-values':
        return 'Remove Values';
      case 'add-relations':
        return 'Add Relations';
      case 'remove-relations':
        return 'Remove Relations';
      case 'add-property':
        return 'Add Property';
      default:
        return 'Bulk Edit';
    }
  };

  const getDescription = () => {
    switch (operation) {
      case 'add-values':
        return `Add a value to the selected property for ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`;
      case 'remove-values':
        return `Remove values from the selected property for ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`;
      case 'add-relations':
        return `Add a relation to the selected property for ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`;
      case 'remove-relations':
        return `Remove relations from the selected property for ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`;
      case 'add-property':
        return `Add a property to ${selectedCount} selected item${selectedCount !== 1 ? 's' : ''}`;
      default:
        return '';
    }
  };

  const getInputLabel = () => {
    switch (operation) {
      case 'add-values':
        return 'Value to add';
      case 'remove-values':
        return 'Value to remove (leave empty to remove all)';
      case 'add-relations':
        return 'Entity ID or search term';
      case 'remove-relations':
        return 'Relation to remove (leave empty to remove all)';
      default:
        return 'Value';
    }
  };

  const getFilteredProperties = () => {
    // Filter properties based on operation type
    if (operation === 'add-relations' || operation === 'remove-relations') {
      return properties.filter(p => p.dataType === 'RELATION');
    }
    return properties.filter(p => p.dataType !== 'RELATION');
  };

  const handleConfirm = () => {
    if (!selectedPropertyId) return;
    const isRelationOperation = operation === 'add-relations' || operation === 'remove-relations';
    const value = isRelationOperation ? selectedRelationIds.map(r => r.id).join(',') : inputValue;
    const entityIds = isRelationOperation ? selectedRelationIds.map(r => r.id) : undefined;

    onConfirm(selectedPropertyId, value, entityIds);
    onClose();
  };

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const isRelationProperty = selectedProperty?.dataType === 'RELATION';
  const isRelationOperation = operation === 'add-relations' || operation === 'remove-relations';

  const canConfirm = selectedPropertyId.length > 0 &&
    (isRelationOperation ? selectedRelationIds.length > 0 : true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <Text variant="mediumTitle">{getTitle()}</Text>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01"
          >
            <Close />
          </button>
        </div>

        <Text variant="body" color="grey-04" className="mb-6">
          {getDescription()}
        </Text>

        <div className="space-y-4">
          {/* Property Selection for add-property operation */}
          {operation === 'add-property' ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-grey-04">
                Find or create property
              </label>
              <SelectEntity
                spaceId={spaceId}
                relationValueTypes={[{ id: SystemIds.PROPERTY, name: 'Property' }]}
                placeholder="Find or create property..."
                onCreateEntity={(result) => {
                  const renderableType = result.renderableType || 'TEXT';

                  const createdPropertyId = createProperty({
                    name: result.name || '',
                    propertyType: renderableType,
                    verified: result.verified,
                    space: result.space,
                  });

                  if (onAddProperty) {
                    onAddProperty(createdPropertyId, result.name || '');
                  }
                  onClose();
                }}
                onDone={(result) => {
                  if (result && onAddProperty) {
                    onAddProperty(result.id, result.name || '');
                  }
                  onClose();
                }}
                containerClassName="w-full"
                width="full"
              />
            </div>
          ) : (
            <>
              {/* Property Selection for other operations */}
              <div>
                <label className="mb-2 block text-sm font-medium text-grey-04">
                  Select Property
                </label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="w-full rounded-sm border border-grey-03 px-3 py-2 text-sm focus:border-blue-04 focus:outline-none focus:ring-1 focus:ring-blue-04"
                >
                  <option value="">Choose a property...</option>
                  {getFilteredProperties().map(property => (
                    <option key={property.id} value={property.id}>
                      {property.name || property.id}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Value Input */}
          {(operation === 'add-values' || operation === 'remove-values') && (
            <div>
              <label className="mb-2 block text-sm font-medium text-grey-04">
                {getInputLabel()}
              </label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={operation === 'add-values' ? 'Enter value...' : 'Leave empty to remove all values'}
                className="w-full rounded-sm border border-grey-03 px-3 py-2 text-sm focus:border-blue-04 focus:outline-none focus:ring-1 focus:ring-blue-04"
              />
            </div>
          )}

          {/* Relation Input */}
          {(operation === 'add-relations' || operation === 'remove-relations') && selectedPropertyId && (
            <div>
              <label className="mb-2 block text-sm font-medium text-grey-04">
                {operation === 'add-relations' ? 'Entities to link' : 'Entities to unlink (optional)'}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {selectedRelationIds.length === 0 ? (
                  <div className="w-full">
                    <SelectEntity
                      spaceId={spaceId}
                      relationValueTypes={selectedProperty?.relationValueTypes}
                      placeholder={operation === 'add-relations' ? 'Find or create entity to link...' : 'Find entity to unlink (leave empty for all)...'}
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
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {operation !== 'add-property' && (
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="relative inline-flex items-center justify-center rounded border font-medium tracking-[-0.17px] shadow-light transition duration-200 ease-in-out focus:outline-none border-grey-02 bg-white text-text shadow-button hover:border-text hover:bg-bg hover:!text-text focus:border-text focus:shadow-inner-text gap-2 px-3 py-2 text-button leading-[1.125rem]"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="relative inline-flex items-center justify-center rounded border font-medium tracking-[-0.17px] shadow-light transition duration-200 ease-in-out focus:outline-none border-transparent bg-ctaPrimary text-white hover:bg-ctaHover focus:border-ctaHover focus:shadow-inner-ctaHover gap-2 px-3 py-2 text-button leading-[1.125rem] disabled:border-transparent disabled:bg-divider disabled:text-grey-03 disabled:hover:bg-divider disabled:cursor-not-allowed"
            >
              {getTitle()}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}