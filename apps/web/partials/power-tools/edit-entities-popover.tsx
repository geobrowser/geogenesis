'use client';

import { useQuery } from '@tanstack/react-query';
import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { getSpaces } from '~/core/io/queries';
import { useKey } from '~/core/hooks/use-key';
import { useRelations } from '~/core/sync/use-store';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { Property } from '~/core/types';
import type { SpaceEntity } from '~/core/types';
import type { SwitchableRenderableType } from '~/core/types';
import { mapPropertyType } from '~/core/utils/property/properties';
import type { SelectEntityCompactResult } from '~/design-system/select-entity-compact';
import { NativeGeoImage } from '~/design-system/geo-image';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Search } from '~/design-system/icons/search';
import { Select } from '~/design-system/select';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import { EditableEntityValueField } from './editable-entity-value-field';

type DeleteValueItemProps = {
  item: {
    toEntityId: string;
    toEntityName: string | null;
    toSpaceId?: string;
    count: number;
  };
  property: Property;
  spaceId: string;
  space: { image?: string | null; name?: string | null } | null;
  valueKey: string;
  onMarkForDelete: () => void;
};

function DeleteValueItem({
  item,
  property,
  spaceId,
  space,
  valueKey: _valueKey,
  onMarkForDelete,
}: DeleteValueItemProps) {
  const isImageColumn = property.renderableTypeStrict === 'IMAGE';
  const imageSrc = useImageUrlFromEntity(
    item.toEntityId,
    item.toSpaceId ?? spaceId
  );

  return (
    <div className="inline-flex items-center gap-1.5 rounded-[5px] border border-grey-02 px-2 py-1.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[10px] bg-black text-[0.75rem] font-medium text-white">
        {item.count}
      </span>
      {isImageColumn ? (
        <span className="inline-flex size-8 shrink-0 overflow-hidden rounded-sm border border-grey-04">
          {imageSrc ? (
            <NativeGeoImage
              value={imageSrc}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="h-full w-full bg-grey-02" />
          )}
        </span>
      ) : (
        <>
          <span className="inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-grey-04">
            {space?.image ? (
              <NativeGeoImage
                value={space.image}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="h-full w-full bg-grey-02" />
            )}
          </span>
          <span className="max-w-[120px] truncate text-[0.8125rem] text-text">
            {item.toEntityName ?? item.toEntityId}
          </span>
        </>
      )}
      <button
        type="button"
        onClick={onMarkForDelete}
        className="shrink-0 rounded p-0.5 text-grey-04 hover:bg-grey-02 hover:text-text"
        aria-label={isImageColumn ? 'Remove image' : `Remove ${item.toEntityName ?? item.toEntityId}`}
      >
        <CloseSmall />
      </button>
    </div>
  );
}

export type EditApplyPayload = {
  property: Property;
  targetEntities: SelectEntityCompactResult[];
  /** For IMAGE column: file to upload per row on Apply (same UX as new property initial value). */
  imageFile?: File;
};

export type EditApplyValuePayload = {
  property: Property;
  value: string;
};

export type EditDeleteApplyPayload = {
  property: Property;
  targetKeys: Array<{ toEntityId: string; toSpaceId?: string }>;
};

export type EditRemovePropertiesPayload = {
  propertyIds: string[];
};

const NEW_PROPERTY_VALUE_TYPES: { value: SwitchableRenderableType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'INTEGER', label: 'Number' },
  { value: 'IMAGE', label: 'Image' },
  { value: 'RELATION', label: 'Relation' },
  { value: 'URL', label: 'URL' },
  { value: 'BOOLEAN', label: 'Boolean' },
  { value: 'DATETIME', label: 'Date & Time' },
];

export type EditApplyNewPropertyPayload = {
  name: string;
  valueType: SwitchableRenderableType;
  selectedRowEntityIds: string[];
  selectedEntities?: SelectEntityCompactResult[];
  initialValue?: string;
  /** For IMAGE: file to upload on Apply (no upload in popover). */
  initialImageFile?: File;
};

export type EditEntitiesPopoverProps = {
  trigger: React.ReactNode;
  selectedCount: number;
  spaceId: string;
  properties: Property[];
  selectedEntityIds?: string[];
  relationValueTypes?: Property['relationValueTypes'];
  typesProperty?: Property | null;
  onSelectAttribute?: (property: Property) => void;
  onApply?: (payload: EditApplyPayload) => void;
  onApplyValue?: (payload: EditApplyValuePayload) => void;
  onDeleteApply?: (payload: EditDeleteApplyPayload) => void;
  onRemoveProperties?: (payload: EditRemovePropertiesPayload) => void;
  onApplyNewProperty?: (payload: EditApplyNewPropertyPayload) => void;
};

export function EditEntitiesPopover({
  trigger,
  selectedCount,
  spaceId,
  properties,
  selectedEntityIds = [],
  onApply,
  onApplyValue,
  onDeleteApply,
  onRemoveProperties,
  onApplyNewProperty,
}: EditEntitiesPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedAttributeEntities, setSelectedAttributeEntities] = React.useState<
    SelectEntityCompactResult[]
  >([]);
  const [selectedProperty, setSelectedProperty] = React.useState<Property | null>(null);
  const [actionPickerOpen, setActionPickerOpen] = React.useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = React.useState(false);
  const [markedForDeleteKeys, setMarkedForDeleteKeys] = React.useState<Set<string>>(new Set());
  const [showAllDeleteValues, setShowAllDeleteValues] = React.useState(false);
  const [pendingValue, setPendingValue] = React.useState<string>('');

  type EditAction = 'add' | 'delete' | 'new' | 'removeProperty';
  const [action, setAction] = React.useState<EditAction>('add');

  const [newPropertyName, setNewPropertyName] = React.useState('');
  const [newPropertyValueType, setNewPropertyValueType] =
    React.useState<SwitchableRenderableType>('TEXT');
  const [newPropertyInitialValue, setNewPropertyInitialValue] = React.useState('');
  const [newPropertyImageFile, setNewPropertyImageFile] = React.useState<File | null>(null);
  const [addImageFile, setAddImageFile] = React.useState<File | null>(null);
  const addImageFileDialogOpenRef = React.useRef(false);
  const addImageFileDialogCloseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const INITIAL_DELETE_VALUES_VISIBLE = 5;
  const INITIAL_REMOVE_PROPERTY_COLUMNS_VISIBLE = 5;

  const [removePropertySearchQuery, setRemovePropertySearchQuery] = React.useState('');
  const [propertiesMarkedForRemoval, setPropertiesMarkedForRemoval] = React.useState<Set<string>>(
    new Set()
  );
  const [showAllMatchedColumns, setShowAllMatchedColumns] = React.useState(false);

  useKey('Escape', () => {
    if (!open) return;
    if (actionPickerOpen) setActionPickerOpen(false);
    else if (columnPickerOpen) setColumnPickerOpen(false);
    else setOpen(false);
  });

  const relationColumns = React.useMemo(() => {
    return properties.filter(
      p => p.dataType === 'RELATION' || (p.relationValueTypes && p.relationValueTypes.length > 0)
    );
  }, [properties]);

  const pickerColumns = properties;
  const displayColumn = selectedProperty ?? pickerColumns[0] ?? null;
  const effectiveProperty = selectedProperty ?? pickerColumns[0] ?? null;

  const isRelationColumn = Boolean(
    effectiveProperty &&
      (effectiveProperty.dataType === 'RELATION' ||
        (effectiveProperty.relationValueTypes && effectiveProperty.relationValueTypes.length > 0))
  );

  const currentColumnRelations = useRelations({
    selector: r =>
      selectedEntityIds.includes(r.fromEntity.id) &&
      effectiveProperty != null &&
      r.type.id === effectiveProperty.id,
  });

  /** All distinct values in the column across selected rows (union), with count of rows that have each value. */
  const currentColumnValues = React.useMemo(() => {
    if (currentColumnRelations.length === 0 || selectedEntityIds.length === 0) return [];

    const key = (r: (typeof currentColumnRelations)[number]) =>
      `${r.toEntity.id}:${r.toSpaceId ?? r.spaceId}`;
    const byKey = new Map<
      string,
      { toEntityId: string; toEntityName: string | null; toSpaceId: string; rowIds: Set<string> }
    >();
    for (const r of currentColumnRelations) {
      const k = key(r);
      const existing = byKey.get(k);
      if (existing) {
        existing.rowIds.add(r.fromEntity.id);
      } else {
        byKey.set(k, {
          toEntityId: r.toEntity.id,
          toEntityName: r.toEntity.name,
          toSpaceId: r.toSpaceId ?? r.spaceId,
          rowIds: new Set([r.fromEntity.id]),
        });
      }
    }
    return [...byKey.entries()].map(([, v]) => ({
      toEntityId: v.toEntityId,
      toEntityName: v.toEntityName,
      toSpaceId: v.toSpaceId,
      count: v.rowIds.size,
    }));
  }, [currentColumnRelations, selectedEntityIds]);

  const uniqueToSpaceIds = React.useMemo(() => {
    const fromValues = currentColumnValues
      .map(v => v.toSpaceId)
      .filter((id): id is string => Boolean(id));
    const ids = new Set([...fromValues, spaceId]);
    return [...ids];
  }, [currentColumnValues, spaceId]);

  const { data: spacesData } = useQuery({
    queryKey: ['edit-popover-spaces', uniqueToSpaceIds],
    queryFn: () => Effect.runPromise(getSpaces({ spaceIds: uniqueToSpaceIds })),
    enabled: action === 'delete' && currentColumnValues.length > 0,
  });

  const spaceById = React.useMemo(() => {
    const map: Record<string, SpaceEntity> = {};
    for (const s of spacesData ?? []) {
      if (s.entity) map[s.id] = s.entity;
    }
    return map;
  }, [spacesData]);

  const handleApply = React.useCallback(() => {
    if (!effectiveProperty || !onApply) return;
    // IMAGE column: use temporary file flow (like new property initial value)
    if (effectiveProperty.renderableTypeStrict === 'IMAGE') {
      if (addImageFile == null) return;
      onApply({ property: effectiveProperty, targetEntities: [], imageFile: addImageFile });
      setOpen(false);
      setAddImageFile(null);
      setSelectedProperty(null);
      return;
    }

    if (selectedAttributeEntities.length === 0) return;
    onApply({ property: effectiveProperty, targetEntities: selectedAttributeEntities });
    setOpen(false);
    setSelectedAttributeEntities([]);
    setSelectedProperty(null);
  }, [effectiveProperty, selectedAttributeEntities, onApply, addImageFile]);

  const handleApplyValue = React.useCallback(() => {
    if (!effectiveProperty || selectedEntityIds.length === 0 || !onApplyValue) return;
    onApplyValue({ property: effectiveProperty, value: pendingValue });
    setOpen(false);
    setPendingValue('');
  }, [effectiveProperty, selectedEntityIds, pendingValue, onApplyValue]);

  const canApplyRelation = effectiveProperty && selectedAttributeEntities.length > 0 && onApply;
  const canApplyImageColumn =
    effectiveProperty &&
    effectiveProperty.renderableTypeStrict === 'IMAGE' &&
    addImageFile != null &&
    onApply;
  const canApplyValue =
    effectiveProperty && selectedEntityIds.length > 0 && !isRelationColumn && onApplyValue;
  const canApply =
    action === 'add' &&
    effectiveProperty &&
    (effectiveProperty.renderableTypeStrict === 'IMAGE'
      ? canApplyImageColumn
      : isRelationColumn
        ? canApplyRelation
        : canApplyValue);

  const isNewPropertyRelation =
    newPropertyValueType === 'RELATION' || newPropertyValueType === 'IMAGE';
  const canApplyNew =
    action === 'new' &&
    onApplyNewProperty &&
    newPropertyName.trim().length > 0 &&
    (newPropertyValueType === 'IMAGE'
      ? newPropertyImageFile != null
      : isNewPropertyRelation
        ? selectedAttributeEntities.length > 0
        : true);

  const handleApplyNewProperty = React.useCallback(() => {
    if (!canApplyNew || !onApplyNewProperty) return;
    onApplyNewProperty({
      name: newPropertyName.trim(),
      valueType: newPropertyValueType,
      selectedRowEntityIds: selectedEntityIds ?? [],
      selectedEntities:
        isNewPropertyRelation && newPropertyValueType !== 'IMAGE'
          ? selectedAttributeEntities
          : undefined,
      initialValue: isNewPropertyRelation ? undefined : newPropertyInitialValue,
      initialImageFile:
        newPropertyValueType === 'IMAGE' ? newPropertyImageFile ?? undefined : undefined,
    });
    setOpen(false);
    setNewPropertyName('');
    setNewPropertyValueType('TEXT');
    setNewPropertyInitialValue('');
    setSelectedAttributeEntities([]);
    setNewPropertyImageFile(null);
  }, [
    canApplyNew,
    onApplyNewProperty,
    newPropertyName,
    newPropertyValueType,
    newPropertyInitialValue,
    newPropertyImageFile,
    isNewPropertyRelation,
    selectedAttributeEntities,
    selectedEntityIds,
  ]);

  React.useEffect(() => {
    if (!open) {
      setActionPickerOpen(false);
      setColumnPickerOpen(false);
      setMarkedForDeleteKeys(new Set());
      setShowAllDeleteValues(false);
      setPendingValue('');
      setNewPropertyName('');
      setNewPropertyValueType('TEXT');
      setNewPropertyInitialValue('');
      setNewPropertyImageFile(null);
      setAddImageFile(null);
      setRemovePropertySearchQuery('');
      setPropertiesMarkedForRemoval(new Set());
      setShowAllMatchedColumns(false);
    }
  }, [open]);

  const matchedColumnsForRemoval = React.useMemo(() => {
    const q = removePropertySearchQuery.trim().toLowerCase();
    if (!q) return pickerColumns;
    return pickerColumns.filter(
      p => (p.name ?? p.id).toLowerCase().includes(q)
    );
  }, [pickerColumns, removePropertySearchQuery]);

  React.useEffect(() => {
    setPendingValue('');
    setAddImageFile(null);
  }, [effectiveProperty?.id]);

  const valueKey = (item: { toEntityId: string; toSpaceId?: string }) =>
    `${item.toEntityId}:${item.toSpaceId ?? ''}`;

  /** For Delete: values user marked with × = will be deleted from all selected rows on Apply. */
  const displayedDeleteValues = React.useMemo(
    () => currentColumnValues.filter(item => markedForDeleteKeys.has(valueKey(item))),
    [currentColumnValues, markedForDeleteKeys]
  );

  const canApplyDelete =
    action === 'delete' &&
    effectiveProperty != null &&
    displayedDeleteValues.length > 0 &&
    onDeleteApply != null;

  const canApplyRemoveProperties =
    action === 'removeProperty' &&
    propertiesMarkedForRemoval.size > 0 &&
    onRemoveProperties != null;

  const handleDeleteApply = React.useCallback(() => {
    if (!effectiveProperty || displayedDeleteValues.length === 0 || !onDeleteApply) return;
    onDeleteApply({
      property: effectiveProperty,
      targetKeys: displayedDeleteValues.map(v => ({
        toEntityId: v.toEntityId,
        toSpaceId: v.toSpaceId,
      })),
    });
    setOpen(false);
    setMarkedForDeleteKeys(new Set());
  }, [effectiveProperty, displayedDeleteValues, onDeleteApply]);

  const handleRemovePropertiesApply = React.useCallback(() => {
    if (propertiesMarkedForRemoval.size === 0 || !onRemoveProperties) return;
    onRemoveProperties({ propertyIds: Array.from(propertiesMarkedForRemoval) });
    setOpen(false);
    setPropertiesMarkedForRemoval(new Set());
    setRemovePropertySearchQuery('');
  }, [propertiesMarkedForRemoval, onRemoveProperties]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={10}
          className="z-[100] min-w-[280px] max-w-[360px] overflow-visible rounded-lg border border-grey-02 bg-white p-0 shadow-lg"
          onInteractOutside={e => {
            if (addImageFileDialogOpenRef.current) e.preventDefault();
          }}
        >
          {actionPickerOpen ? (
            <div className="p-3">
              <div className="flex items-center gap-2 border-b border-grey-02 pb-2">
                <button
                  type="button"
                  onClick={() => setActionPickerOpen(false)}
                  className="rounded p-1 text-button text-grey-04 hover:bg-grey-01 hover:text-text"
                  aria-label="Back"
                >
                  ←
                </button>
                <Text variant="body" className="font-medium">
                  Action
                </Text>
              </div>
              <Spacer height={8} />
              <div className="flex flex-col gap-0.5">
                {(
                  [
                    { id: 'add', label: 'Add' },
                    { id: 'new', label: 'New property' },
                    { id: 'delete', label: 'Remove' },
                    { id: 'removeProperty', label: 'Remove Property' },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setAction(id);
                      setActionPickerOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-button text-text hover:bg-grey-01 ${
                      action === id ? 'bg-grey-01' : ''
                    }`}
                  >
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : columnPickerOpen ? (
            <div className="p-3">
              <div className="flex items-center gap-2 border-b border-grey-02 pb-2">
                <button
                  type="button"
                  onClick={() => setColumnPickerOpen(false)}
                  className="rounded p-1 text-button text-grey-04 hover:bg-grey-01 hover:text-text"
                  aria-label="Back"
                >
                  ←
                </button>
                <Text variant="body" className="font-medium">
                  Column
                </Text>
              </div>
              <Spacer height={8} />
              <div className="max-h-[min(40vh,240px)] overflow-y-auto">
                {pickerColumns.length > 0 ? (
                  pickerColumns.map(prop => (
                    <button
                      key={prop.id}
                      type="button"
                      onClick={() => {
                        setSelectedProperty(prop);
                        setColumnPickerOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-button text-text hover:bg-grey-01 ${
                        displayColumn?.id === prop.id ? 'bg-grey-01' : ''
                      }`}
                    >
                      <span>{prop.name ?? prop.id}</span>
                    </button>
                  ))
                ) : (
                  <Text variant="metadata" color="grey-04">
                    No columns
                  </Text>
                )}
              </div>
            </div>
          ) : (
            <div className="p-2">
              <div className="flex items-center justify-between gap-2 border-b border-grey-02 pb-2">
                <div>
                  <Text variant="body" color="grey-04" className="text-[14px] font-medium">
                    Edit {selectedCount} {selectedCount === 1 ? 'entity' : 'entities'}
                  </Text>
                  {canApply && isRelationColumn && (
                    <Text variant="metadata" color="grey-04" className="block">
                      Add {selectedAttributeEntities.length} to {selectedCount} row{selectedCount === 1 ? '' : 's'}
                    </Text>
                  )}
                  {canApply && !isRelationColumn && (
                    <Text variant="metadata" color="grey-04" className="block">
                      Set value on {selectedCount} row{selectedCount === 1 ? '' : 's'}
                    </Text>
                  )}
                  {canApplyNew && (
                    <Text variant="metadata" color="grey-04" className="block">
                      Add column and apply to {selectedCount} row{selectedCount === 1 ? '' : 's'}
                    </Text>
                  )}
                  {canApplyDelete && (
                    <Text variant="metadata" color="grey-04" className="block">
                      Remove {displayedDeleteValues.length} from all {selectedCount} row{selectedCount === 1 ? '' : 's'}
                    </Text>
                  )}
                  {canApplyRemoveProperties && (
                    <Text variant="metadata" color="grey-04" className="block">
                      Remove {propertiesMarkedForRemoval.size} propert{propertiesMarkedForRemoval.size === 1 ? 'y' : 'ies'} from {selectedCount} row{selectedCount === 1 ? '' : 's'}
                    </Text>
                  )}
                </div>
                {(canApply || canApplyDelete || canApplyRemoveProperties || canApplyNew) && (
                  <button
                    type="button"
                    onClick={
                      canApplyNew
                        ? handleApplyNewProperty
                        : canApplyRemoveProperties
                          ? handleRemovePropertiesApply
                          : canApplyDelete
                            ? handleDeleteApply
                            : isRelationColumn
                              ? handleApply
                              : handleApplyValue
                    }
                    className="shrink-0 rounded-md bg-text px-3 py-1.5 text-button text-white hover:opacity-90"
                  >
                    Apply
                  </button>
                )}
              </div>
              <Spacer height={12} />
              <button
                type="button"
                onClick={() => setActionPickerOpen(true)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-button text-text hover:bg-grey-01"
              >
                <span>
                  {action === 'new'
                    ? 'New property'
                    : action === 'add'
                      ? 'Add'
                      : action === 'removeProperty'
                        ? 'Remove Property'
                        : 'Remove'}
                </span>
                <ChevronRight />
              </button>
              {action !== 'new' && action !== 'removeProperty' && (
                <button
                  type="button"
                  onClick={() => setColumnPickerOpen(true)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-button text-text hover:bg-grey-01"
                >
                  <span>{displayColumn ? displayColumn.name ?? displayColumn.id : 'Column'}</span>
                  <ChevronRight />
                </button>
              )}
              <Spacer height={12} />
              {action === 'new' && (
                <>
                  <Text variant="metadata" color="grey-04" className="block">
                    Value type
                  </Text>
                  <Spacer height={6} />
                  <Select
                    value={newPropertyValueType}
                    onChange={v => setNewPropertyValueType(v as SwitchableRenderableType)}
                    options={NEW_PROPERTY_VALUE_TYPES.map(({ value, label }) => ({ value, label }))}
                    placeholder="Select type"
                  />
                  <Spacer height={12} />
                  <Text variant="metadata" color="grey-04" className="block">
                    Property name
                  </Text>
                  <Spacer height={6} />
                  <input
                    type="text"
                    value={newPropertyName}
                    onChange={e => setNewPropertyName(e.target.value)}
                    placeholder="Placeholder..."
                    className="w-full rounded border border-grey-02 px-2 py-1.5 text-button text-text shadow-inner-grey-02 placeholder:text-grey-04 focus:border-grey-04 focus:outline-none"
                  />
                  <Spacer height={12} />
                  {isNewPropertyRelation ? (
                    <>
                      <Text variant="metadata" color="grey-04" className="block">
                        Add property values (optional)
                      </Text>
                      <Spacer height={6} />
                      <EditableEntityValueField
                        property={{
                          id: '',
                          name: null,
                          dataType: 'RELATION',
                          relationValueTypes:
                            newPropertyValueType === 'IMAGE'
                              ? [{ id: SystemIds.IMAGE_TYPE, name: 'Image' }]
                              : [],
                          ...(newPropertyValueType === 'IMAGE' && {
                            renderableTypeStrict: 'IMAGE',
                          }),
                        }}
                        spaceId={spaceId}
                        value=""
                        selectedEntities={selectedAttributeEntities}
                        onRemoveSelectedEntity={id =>
                          setSelectedAttributeEntities(prev => prev.filter(e => e.id !== id))
                        }
                        onSelectEntity={result => {
                          setSelectedAttributeEntities(prev =>
                            prev.some(e => e.id === result.id) ? prev : [...prev, result]
                          );
                        }}
                        selectedImageFile={
                          newPropertyValueType === 'IMAGE' ? newPropertyImageFile : null
                        }
                        onImageFileSelect={
                          newPropertyValueType === 'IMAGE'
                            ? (file: File) => setNewPropertyImageFile(file)
                            : undefined
                        }
                        onImageFileClear={
                          newPropertyValueType === 'IMAGE'
                            ? () => setNewPropertyImageFile(null)
                            : undefined
                        }
                        onBeforeImageFileDialogOpen={
                          newPropertyValueType === 'IMAGE'
                            ? () => {
                                if (addImageFileDialogCloseTimeoutRef.current) {
                                  clearTimeout(addImageFileDialogCloseTimeoutRef.current);
                                  addImageFileDialogCloseTimeoutRef.current = null;
                                }
                                addImageFileDialogOpenRef.current = true;
                                addImageFileDialogCloseTimeoutRef.current = setTimeout(() => {
                                  addImageFileDialogOpenRef.current = false;
                                  addImageFileDialogCloseTimeoutRef.current = null;
                                }, 2000);
                              }
                            : undefined
                        }
                        onAfterImageFileDialogClose={
                          newPropertyValueType === 'IMAGE'
                            ? () => {
                                if (addImageFileDialogCloseTimeoutRef.current) {
                                  clearTimeout(addImageFileDialogCloseTimeoutRef.current);
                                  addImageFileDialogCloseTimeoutRef.current = null;
                                }
                                addImageFileDialogOpenRef.current = false;
                              }
                            : undefined
                        }
                      />
                    </>
                  ) : (
                    <>
                      <Text variant="metadata" color="grey-04" className="block">
                        Initial value (optional)
                      </Text>
                      <Spacer height={6} />
                      <EditableEntityValueField
                        property={{
                          id: '',
                          name: null,
                          dataType: mapPropertyType(newPropertyValueType).baseDataType,
                        }}
                        spaceId={spaceId}
                        value={newPropertyInitialValue}
                        onChange={setNewPropertyInitialValue}
                      />
                    </>
                  )}
                  <Spacer height={12} />
                </>
              )}
              {action === 'delete' && effectiveProperty && (
                <>
                  <Spacer height={6} />
                  {(() => {
                    const unmarkedValues = currentColumnValues.filter(
                      item => !markedForDeleteKeys.has(valueKey(item))
                    );
                    const visibleCount = showAllDeleteValues
                      ? unmarkedValues.length
                      : Math.min(INITIAL_DELETE_VALUES_VISIBLE, unmarkedValues.length);
                    const visibleValues = unmarkedValues.slice(0, visibleCount);
                    const hiddenCount = unmarkedValues.length - visibleCount;
                    return (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <Text variant="metadata" className="text-text">
                            All values
                          </Text>
                          {unmarkedValues.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setMarkedForDeleteKeys(prev => {
                                  const next = new Set(prev);
                                  currentColumnValues.forEach(item => next.add(valueKey(item)));
                                  return next;
                                });
                              }}
                              className="text-button text-[0.8125rem] text-red-01 hover:underline"
                            >
                              Remove all
                            </button>
                          )}
                        </div>
                        <Spacer height={6} />
                        <div className="max-h-[min(40vh,240px)] overflow-y-auto">
                          {unmarkedValues.length === 0 ? (
                            <div className="px-2 py-3 text-center text-[0.8125rem] text-grey-04">
                              {currentColumnValues.length === 0
                                ? 'No values in this column for selected rows.'
                                : 'All values removed. Click Apply to delete from all selected rows.'}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 p-2">
                              {visibleValues.map((item, idx) => {
                                const key = valueKey(item);
                                const space = spaceById[item.toSpaceId ?? spaceId] ?? null;
                                return (
                                  <DeleteValueItem
                                    key={`${item.toEntityId}-${item.toSpaceId ?? ''}-${idx}`}
                                    item={item}
                                    property={effectiveProperty}
                                    spaceId={spaceId}
                                    space={space}
                                    valueKey={key}
                                    onMarkForDelete={() =>
                                      setMarkedForDeleteKeys(prev => new Set(prev).add(key))
                                    }
                                  />
                                );
                              })}
                            </div>
                          )}
                          {!showAllDeleteValues && hiddenCount > 0 && (
                            <>
                              <Spacer height={6} />
                              <button
                                type="button"
                                onClick={() => setShowAllDeleteValues(true)}
                                className="w-full px-2 py-1.5 text-left text-[0.8125rem] text-button text-grey-04 hover:bg-grey-01 hover:text-text"
                              >
                                Show {hiddenCount} more
                              </button>
                            </>
                          )}
                        </div>
                        <Spacer height={12} />
                      </>
                    );
                  })()}
                </>
              )}
              {action === 'removeProperty' && (
                <>
                  <Spacer height={6} />
                  <Text variant="metadata" color="grey-04" className="block">
                    Property name
                  </Text>
                  <Spacer height={6} />
                  <div className="relative w-full">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-grey-04">
                      <Search />
                    </span>
                    <input
                      type="text"
                      value={removePropertySearchQuery}
                      onChange={e => setRemovePropertySearchQuery(e.target.value)}
                      placeholder="Find a property..."
                      className="w-full rounded-md border border-grey-02 bg-white py-2 pl-9 pr-3 text-body text-text shadow-inner shadow-grey-02 outline-none placeholder:text-grey-04 focus:border-grey-04 focus:shadow-inner-lg focus:shadow-text"
                    />
                  </div>
                  <Spacer height={12} />
                  {matchedColumnsForRemoval.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <Text variant="metadata" className="text-text">
                          Matched columns
                        </Text>
                        {propertiesMarkedForRemoval.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setPropertiesMarkedForRemoval(new Set())}
                            className="text-button text-[0.8125rem] text-red-01 hover:underline"
                          >
                            Clear selection
                          </button>
                        )}
                      </div>
                      <Spacer height={6} />
                      <div className="max-h-[min(40vh,240px)] overflow-y-auto">
                        <div className="flex flex-wrap gap-1.5 p-0">
                          {(() => {
                            const visibleCount = showAllMatchedColumns
                              ? matchedColumnsForRemoval.length
                              : Math.min(
                                  INITIAL_REMOVE_PROPERTY_COLUMNS_VISIBLE,
                                  matchedColumnsForRemoval.length
                                );
                            const visibleColumns = matchedColumnsForRemoval.slice(0, visibleCount);
                            const hiddenCount = matchedColumnsForRemoval.length - visibleCount;
                            return (
                              <>
                                {visibleColumns.map(prop => {
                                  const isMarked = propertiesMarkedForRemoval.has(prop.id);
                                  return (
                                    <div
                                      key={prop.id}
                                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${
                                        isMarked
                                          ? 'border-grey-04 bg-grey-01'
                                          : 'border-grey-02 bg-white'
                                      }`}
                                    >
                                      <span className="max-w-[140px] truncate text-[0.8125rem] text-text">
                                        {prop.name ?? prop.id}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPropertiesMarkedForRemoval(prev => {
                                            const next = new Set(prev);
                                            if (next.has(prop.id)) next.delete(prop.id);
                                            else next.add(prop.id);
                                            return next;
                                          })
                                        }
                                        className="shrink-0 rounded p-0.5 text-grey-04 hover:bg-grey-02 hover:text-text"
                                        aria-label={
                                          isMarked
                                            ? `Unmark ${prop.name ?? prop.id}`
                                            : `Remove property ${prop.name ?? prop.id}`
                                        }
                                      >
                                        <CloseSmall />
                                      </button>
                                    </div>
                                  );
                                })}
                                {!showAllMatchedColumns && hiddenCount > 0 && (
                                  <>
                                    <Spacer height={6} />
                                    <button
                                      type="button"
                                      onClick={() => setShowAllMatchedColumns(true)}
                                      className="w-full px-2 py-1.5 text-left text-[0.8125rem] text-button text-grey-04 hover:bg-grey-01 hover:text-text"
                                    >
                                      Show {hiddenCount} more
                                    </button>
                                  </>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="px-2 py-3 text-center text-[0.8125rem] text-grey-04">
                      {removePropertySearchQuery.trim()
                        ? 'No columns match your search.'
                        : 'Type a property name to find columns to remove.'}
                    </div>
                  )}
                  <Spacer height={12} />
                </>
              )}
              {action !== 'delete' && action !== 'removeProperty' && effectiveProperty && (
                <div className="block">
                  <Text variant="metadata" color="grey-04" className="block">Value</Text>
                  <Spacer height={6} />
                  <EditableEntityValueField
                    property={effectiveProperty}
                    spaceId={spaceId}
                    value={pendingValue}
                    onChange={setPendingValue}
                    selectedEntities={selectedAttributeEntities}
                    onRemoveSelectedEntity={id =>
                      setSelectedAttributeEntities(prev => prev.filter(e => e.id !== id))
                    }
                    onSelectEntity={result => {
                      setSelectedAttributeEntities(prev =>
                        prev.some(e => e.id === result.id) ? prev : [...prev, result]
                      );
                    }}
                    selectedImageFile={
                      action === 'add' && effectiveProperty.renderableTypeStrict === 'IMAGE'
                        ? addImageFile
                        : null
                    }
                    onImageFileSelect={
                      action === 'add' && effectiveProperty.renderableTypeStrict === 'IMAGE'
                        ? (file: File) => setAddImageFile(file)
                        : undefined
                    }
                    onImageFileClear={
                      action === 'add' && effectiveProperty.renderableTypeStrict === 'IMAGE'
                        ? () => setAddImageFile(null)
                        : undefined
                    }
                    onBeforeImageFileDialogOpen={
                      action === 'add' && effectiveProperty.renderableTypeStrict === 'IMAGE'
                        ? () => {
                            if (addImageFileDialogCloseTimeoutRef.current) {
                              clearTimeout(addImageFileDialogCloseTimeoutRef.current);
                              addImageFileDialogCloseTimeoutRef.current = null;
                            }
                            addImageFileDialogOpenRef.current = true;
                            addImageFileDialogCloseTimeoutRef.current = setTimeout(() => {
                              addImageFileDialogOpenRef.current = false;
                              addImageFileDialogCloseTimeoutRef.current = null;
                            }, 2000);
                          }
                        : undefined
                    }
                    onAfterImageFileDialogClose={
                      action === 'add' && effectiveProperty.renderableTypeStrict === 'IMAGE'
                        ? () => {
                            if (addImageFileDialogCloseTimeoutRef.current) {
                              clearTimeout(addImageFileDialogCloseTimeoutRef.current);
                              addImageFileDialogCloseTimeoutRef.current = null;
                            }
                            addImageFileDialogOpenRef.current = false;
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
