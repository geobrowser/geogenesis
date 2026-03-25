'use client';

import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';

import { useKey } from '~/core/hooks/use-key';
import { getSpaces } from '~/core/io/queries';
import { useRelations } from '~/core/sync/use-store';
import { Property } from '~/core/types';
import type { SpaceEntity, SwitchableRenderableType } from '~/core/types';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { mapPropertyType } from '~/core/utils/property/properties';
import {
  SelectEntityCompact,
  type SelectEntityCompactResult,
} from '~/design-system/select-entity-compact';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Checkbox } from '~/design-system/checkbox';
import { NativeGeoImage } from '~/design-system/geo-image';
import { CloseSmall } from '~/design-system/icons/close-small';
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
  /** For IMAGE columns: URL from relation so thumbnail shows immediately (same as Add mode). */
  directImageUrl?: string | null;
};

function CurrentImageThumbnail({
  imageEntityId,
  spaceId,
  directImageUrl,
}: {
  imageEntityId: string;
  spaceId: string;
  directImageUrl?: string | null;
}) {
  const lookedUpUrl = useImageUrlFromEntity(imageEntityId, spaceId);
  const imageSrc =
    directImageUrl && (directImageUrl.startsWith('ipfs://') || directImageUrl.startsWith('http'))
      ? directImageUrl
      : lookedUpUrl;
  return (
    <span className="inline-flex size-12 shrink-0 overflow-hidden rounded-md border border-grey-02">
      {imageSrc ? (
        <NativeGeoImage value={imageSrc} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-grey-02" />
      )}
    </span>
  );
}

function DeleteValueItem({
  item,
  property,
  spaceId,
  space,
  valueKey: _valueKey,
  onMarkForDelete,
  directImageUrl: directImageUrlProp,
}: DeleteValueItemProps) {
  const isImageColumn = property.renderableTypeStrict === 'IMAGE';
  const lookedUpUrl = useImageUrlFromEntity(item.toEntityId, item.toSpaceId ?? spaceId);
  const imageSrc =
    isImageColumn &&
    directImageUrlProp &&
    (directImageUrlProp.startsWith('ipfs://') || directImageUrlProp.startsWith('http'))
      ? directImageUrlProp
      : lookedUpUrl;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-[5px] border border-grey-02 px-2 py-1.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[10px] bg-black text-[0.75rem] font-medium text-white">
        {item.count}
      </span>
      {isImageColumn ? (
        <span className="inline-flex size-8 shrink-0 overflow-hidden rounded-sm border border-grey-04">
          {imageSrc ? (
            <NativeGeoImage value={imageSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="h-full w-full bg-grey-02" />
          )}
        </span>
      ) : (
        <>
          <span className="inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-grey-04">
            {space?.image ? (
              <NativeGeoImage value={space.image} alt="" className="h-full w-full object-cover" />
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
  scope: 'selectedEntities' | 'allEntities';
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

const SUPPORTED_NEW_PROPERTY_VALUE_TYPE_SET = new Set<SwitchableRenderableType>(
  NEW_PROPERTY_VALUE_TYPES.map(t => t.value)
);

export type EditApplyNewPropertyPayload = {
  propertyId: string;
  name: string;
  valueType: SwitchableRenderableType;
  selectedRowEntityIds: string[];
  selectedEntities?: SelectEntityCompactResult[];
  initialValue?: string;
  initialImageFile?: File;
};

export type EditAddExistingPropertyPayload = {
  propertyId: string;
};

export type EditCreatePropertyEntityPayload = {
  propertyId: string;
  name: string | null;
  valueType: SwitchableRenderableType;
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
  onCreatePropertyEntity?: (payload: EditCreatePropertyEntityPayload) => void;
  onAddExistingProperty?: (payload: EditAddExistingPropertyPayload) => void;
  newPropertyOnly?: boolean;
  removePropertyOnly?: boolean;
  showPropertyActions?: boolean;
  contentAlign?: 'start' | 'center' | 'end';
  contentSideOffset?: number;
  initialPropertiesMarkedForRemoval?: string[];
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
  onCreatePropertyEntity,
  onAddExistingProperty,
  newPropertyOnly = false,
  removePropertyOnly = false,
  showPropertyActions = true,
  contentAlign = 'end',
  contentSideOffset = 8,
  initialPropertiesMarkedForRemoval = [],
}: EditEntitiesPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedAttributeEntities, setSelectedAttributeEntities] = React.useState<SelectEntityCompactResult[]>([]);
  const [selectedProperty, setSelectedProperty] = React.useState<Property | null>(null);
  const [markedForDeleteKeys, setMarkedForDeleteKeys] = React.useState<Set<string>>(new Set());
  const [showAllDeleteValues, setShowAllDeleteValues] = React.useState(false);
  const [pendingValue, setPendingValue] = React.useState<string>('');

  type EditAction = 'add' | 'delete' | 'new' | 'removeProperty';
  const [action, setAction] = React.useState<EditAction>(
    newPropertyOnly ? 'new' : removePropertyOnly ? 'removeProperty' : 'add'
  );

  const [newPropertyId, setNewPropertyId] = React.useState<string | null>(null);
  const [newPropertyName, setNewPropertyName] = React.useState('');
  const [newPropertyValueType, setNewPropertyValueType] =
    React.useState<SwitchableRenderableType>('TEXT');
  const [newPropertyInitialValue, setNewPropertyInitialValue] = React.useState('');
  const [newPropertyImageFile, setNewPropertyImageFile] = React.useState<File | null>(null);
  const [selectedExistingProperty, setSelectedExistingProperty] =
    React.useState<SelectEntityCompactResult | null>(null);
  const [useExistingPropertyFromGeo, setUseExistingPropertyFromGeo] = React.useState(false);

  const [addImageFile, setAddImageFile] = React.useState<File | null>(null);
  const addImageFileDialogOpenRef = React.useRef(false);
  const addImageFileDialogCloseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Ref updated synchronously when value field reports a value (e.g. date blur). Use on Apply so we get latest value even when React hasn't committed state yet. */
  const pendingValueRef = React.useRef<string>('');
  /** Same as pendingValueRef but for New property → optional scalar value (DATE etc. may only commit on blur). */
  const newPropertyInitialValueRef = React.useRef<string>('');

  const INITIAL_DELETE_VALUES_VISIBLE = 5;
  const INITIAL_REMOVE_PROPERTY_COLUMNS_VISIBLE = 5;
  const [removePropertySearchQuery, setRemovePropertySearchQuery] = React.useState('');
  const [propertiesMarkedForRemoval, setPropertiesMarkedForRemoval] = React.useState<Set<string>>(
    new Set(initialPropertiesMarkedForRemoval)
  );
  const [showAllMatchedColumns, setShowAllMatchedColumns] = React.useState(false);

  useKey('Escape', () => {
    if (!open) return;
    setOpen(false);
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
      selectedEntityIds.includes(r.fromEntity.id) && effectiveProperty != null && r.type.id === effectiveProperty.id,
  });

  /** All distinct values in the column across selected rows (union), with count of rows that have each value. */
  const currentColumnValues = React.useMemo(() => {
    if (currentColumnRelations.length === 0 || selectedEntityIds.length === 0) return [];

    const key = (r: (typeof currentColumnRelations)[number]) => `${r.toEntity.id}:${r.toSpaceId ?? r.spaceId}`;
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
    const fromValues = currentColumnValues.map(v => v.toSpaceId).filter((id): id is string => Boolean(id));
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
    const valueToApply = (pendingValueRef.current || pendingValue).trim();
    onApplyValue({ property: effectiveProperty, value: valueToApply });
    setOpen(false);
    setPendingValue('');
    pendingValueRef.current = '';
  }, [effectiveProperty, selectedEntityIds, pendingValue, onApplyValue]);

  const canApplyRelation = effectiveProperty && selectedAttributeEntities.length > 0 && onApply;
  const canApplyImageColumn =
    effectiveProperty && effectiveProperty.renderableTypeStrict === 'IMAGE' && addImageFile != null && onApply;
  const canApplyValue = effectiveProperty && selectedEntityIds.length > 0 && !isRelationColumn && onApplyValue;
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
  const canApplyAddExisting =
    action === 'new' &&
    useExistingPropertyFromGeo &&
    onAddExistingProperty &&
    selectedExistingProperty != null;
  const canApplyNew =
    action === 'new' &&
    !useExistingPropertyFromGeo &&
    onApplyNewProperty &&
    newPropertyId != null &&
    newPropertyName.trim().length > 0 &&
    (newPropertyValueType === 'IMAGE' ? newPropertyImageFile != null : true);

  const newPropertyValueFieldPropertyId =
    action === 'new' && newPropertyValueType === 'RELATION' && useExistingPropertyFromGeo
      ? selectedExistingProperty?.id ?? null
      : newPropertyId;

  const handleAddExistingProperty = React.useCallback(() => {
    if (!selectedExistingProperty || !onAddExistingProperty) return;
    onAddExistingProperty({ propertyId: selectedExistingProperty.id });
    setOpen(false);
    setSelectedExistingProperty(null);
  }, [selectedExistingProperty, onAddExistingProperty]);

  const handleApplyNewProperty = React.useCallback(() => {
    if (!canApplyNew || !onApplyNewProperty) return;
    onApplyNewProperty({
      propertyId: newPropertyId!,
      name: newPropertyName.trim(),
      valueType: newPropertyValueType,
      selectedRowEntityIds: selectedEntityIds ?? [],
      selectedEntities: isNewPropertyRelation ? selectedAttributeEntities : undefined,
      initialValue: isNewPropertyRelation
        ? undefined
        : (newPropertyInitialValueRef.current || newPropertyInitialValue).trim(),
      initialImageFile:
        newPropertyValueType === 'IMAGE' ? newPropertyImageFile ?? undefined : undefined,
    });
    setOpen(false);
    setNewPropertyId(null);
    setNewPropertyName('');
    setNewPropertyValueType('TEXT');
    setNewPropertyInitialValue('');
    newPropertyInitialValueRef.current = '';
    setSelectedAttributeEntities([]);
    setNewPropertyImageFile(null);
  }, [
    canApplyNew,
    isNewPropertyRelation,
    newPropertyImageFile,
    newPropertyInitialValue,
    newPropertyName,
    newPropertyId,
    newPropertyValueType,
    onApplyNewProperty,
    selectedAttributeEntities,
    selectedEntityIds,
  ]);

  React.useEffect(() => {
    if (!open) {
      setMarkedForDeleteKeys(new Set());
      setShowAllDeleteValues(false);
      setPendingValue('');
      pendingValueRef.current = '';
      setNewPropertyName('');
      setNewPropertyValueType('TEXT');
      setNewPropertyInitialValue('');
      newPropertyInitialValueRef.current = '';
      setNewPropertyImageFile(null);
      setNewPropertyId(null);
      setSelectedExistingProperty(null);
      setUseExistingPropertyFromGeo(false);
      setRemovePropertySearchQuery('');
      setPropertiesMarkedForRemoval(new Set(initialPropertiesMarkedForRemoval));
      setShowAllMatchedColumns(false);
      setAddImageFile(null);
    }
  }, [open, initialPropertiesMarkedForRemoval]);

  React.useEffect(() => {
    if (newPropertyOnly) {
      setAction('new');
    }
  }, [newPropertyOnly]);

  React.useEffect(() => {
    if (removePropertyOnly) {
      setAction('removeProperty');
    }
  }, [removePropertyOnly]);

  React.useEffect(() => {
    if (!showPropertyActions && (action === 'new' || action === 'removeProperty')) {
      setAction('add');
    }
  }, [showPropertyActions, action]);

  React.useEffect(() => {
    if (open && removePropertyOnly) {
      setPropertiesMarkedForRemoval(new Set(initialPropertiesMarkedForRemoval));
    }
  }, [open, removePropertyOnly, initialPropertiesMarkedForRemoval]);

  // Only reset Add-mode inputs when the target column changes. Do not clear while on "New property"
  // — effectiveProperty still tracks the hidden column picker and its id can change when columns
  // refresh, which would wipe optional relation picks / values before Apply.
  React.useEffect(() => {
    if (action !== 'add') return;
    setPendingValue('');
    pendingValueRef.current = '';
    setAddImageFile(null);
    setSelectedAttributeEntities([]);
  }, [effectiveProperty?.id, action]);

  const prevEditActionRef = React.useRef<EditAction | null>(null);
  React.useEffect(() => {
    if (prevEditActionRef.current === 'add' && action === 'new') {
      setSelectedAttributeEntities([]);
    }
    prevEditActionRef.current = action;
  }, [action]);

  const valueKey = (item: { toEntityId: string; toSpaceId?: string }) => `${item.toEntityId}:${item.toSpaceId ?? ''}`;

  /** For Delete: values user marked with × = will be deleted from all selected rows on Apply. */
  const displayedDeleteValues = React.useMemo(
    () => currentColumnValues.filter(item => markedForDeleteKeys.has(valueKey(item))),
    [currentColumnValues, markedForDeleteKeys]
  );
  const matchedColumnsForRemoval = React.useMemo(() => {
    const q = removePropertySearchQuery.trim().toLowerCase();
    if (!q) return pickerColumns;
    return pickerColumns.filter(
      p => (p.name ?? p.id).toLowerCase().includes(q)
    );
  }, [pickerColumns, removePropertySearchQuery]);

  const canApplyDelete =
    action === 'delete' &&
    effectiveProperty != null &&
    onDeleteApply != null &&
    (isRelationColumn ? displayedDeleteValues.length > 0 : selectedEntityIds.length > 0);
  const canApplyRemoveProperties =
    action === 'removeProperty' &&
    propertiesMarkedForRemoval.size > 0 &&
    onRemoveProperties != null;

  const handleDeleteApply = React.useCallback(() => {
    if (!effectiveProperty || !onDeleteApply) return;
    if (isRelationColumn && displayedDeleteValues.length === 0) return;
    if (!isRelationColumn && selectedEntityIds.length === 0) return;
    onDeleteApply({
      property: effectiveProperty,
      targetKeys: isRelationColumn
        ? displayedDeleteValues.map(v => ({
            toEntityId: v.toEntityId,
            toSpaceId: v.toSpaceId,
          }))
        : [],
    });
    setOpen(false);
    setMarkedForDeleteKeys(new Set());
  }, [effectiveProperty, isRelationColumn, displayedDeleteValues, selectedEntityIds.length, onDeleteApply]);
  const handleRemovePropertiesApply = React.useCallback(() => {
    if (propertiesMarkedForRemoval.size === 0 || !onRemoveProperties) return;
    onRemoveProperties({
      propertyIds: Array.from(propertiesMarkedForRemoval),
      scope: removePropertyOnly ? 'allEntities' : 'selectedEntities',
    });
    setOpen(false);
    setPropertiesMarkedForRemoval(new Set());
    setRemovePropertySearchQuery('');
  }, [onRemoveProperties, propertiesMarkedForRemoval, removePropertyOnly]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align={contentAlign}
          sideOffset={contentSideOffset}
          collisionPadding={10}
          className="z-[100] w-[360px] overflow-visible rounded-lg border border-grey-02 bg-white p-0 shadow-lg"
          onInteractOutside={e => {
            if (addImageFileDialogOpenRef.current) e.preventDefault();
          }}
        >
          <div className="p-2">
              <div className="flex items-center justify-between gap-2 border-b border-grey-02 pb-2">
                <div>
                  <Text variant="body" color="grey-04" className="text-[14px] font-medium">
                    {newPropertyOnly
                      ? 'New property'
                      : removePropertyOnly
                        ? 'Remove property'
                      : `Edit ${selectedCount} ${selectedCount === 1 ? 'entity' : 'entities'}`}
                  </Text>
                </div>
                {(canApply || canApplyDelete || canApplyRemoveProperties || canApplyAddExisting || canApplyNew) && (
                  <button
                    type="button"
                    onClick={
                      canApplyAddExisting
                        ? handleAddExistingProperty
                        : canApplyNew
                          ? handleApplyNewProperty
                          : canApplyRemoveProperties
                            ? handleRemovePropertiesApply
                            : canApplyDelete
                        ? handleDeleteApply
                        : isRelationColumn
                          ? handleApply
                          : handleApplyValue
                    }
                    className="shrink-0 text-[14px] text-button text-ctaPrimary hover:text-ctaHover hover:underline"
                  >
                    Apply
                  </button>
                )}
              </div>
              <Spacer height={12} />
              {!newPropertyOnly && !removePropertyOnly && (
                <>
                  <div className="flex justify-end">
                    <div className="inline-flex rounded border border-grey-02 bg-grey-01 p-0.5">
                      {(
                        showPropertyActions
                          ? ([
                              { id: 'add' as const, label: 'Add' },
                              { id: 'delete' as const, label: 'Remove' },
                              { id: 'new' as const, label: 'New property' },
                              { id: 'removeProperty' as const, label: 'Remove property' },
                            ] as const)
                          : ([
                              { id: 'add' as const, label: 'Add' },
                              { id: 'delete' as const, label: 'Remove' },
                            ] as const)
                      ).map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setAction(id)}
                          className={`px-3 py-1 text-[13px] font-medium rounded-sm ${
                            action === id
                              ? 'bg-white text-text shadow-sm'
                              : 'bg-transparent text-grey-04 hover:text-text'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Spacer height={12} />
                </>
              )}
              {action !== 'new' && action !== 'removeProperty' && (
                <>
                  <Text variant="metadata" color="grey-04" className="block">
                    {action === 'delete' ? 'From property' : 'To property'}
                  </Text>
                  <Spacer height={6} />
                  <div className="w-full">
                    <Select
                      value={displayColumn?.id ?? pickerColumns[0]?.id ?? ''}
                      onChange={id => {
                        const prop = pickerColumns.find(p => p.id === id);
                        setSelectedProperty(prop ?? null);
                      }}
                      options={pickerColumns.map(prop => ({
                        value: prop.id,
                        label: prop.name ?? prop.id,
                      }))}
                      placeholder="Select column"
                      className="w-full min-w-0"
                      position="popper"
                    />
                  </div>
                </>
              )}
              <Spacer height={12} />
              {action === 'add' && effectiveProperty && (
                <>
                  <Text variant="metadata" color="grey-04" className="block">
                    {effectiveProperty.renderableTypeStrict === 'IMAGE'
                      ? 'Image'
                      : isRelationColumn
                        ? 'Add values'
                        : 'Value'}
                  </Text>
                  <Spacer height={6} />
                  <EditableEntityValueField
                    property={effectiveProperty}
                    spaceId={spaceId}
                    value={pendingValue}
                    onChange={v => {
                      setPendingValue(v);
                      pendingValueRef.current = v;
                    }}
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
                      effectiveProperty.renderableTypeStrict === 'IMAGE' ? addImageFile : null
                    }
                    onImageFileSelect={
                      effectiveProperty.renderableTypeStrict === 'IMAGE'
                        ? (file: File) => setAddImageFile(file)
                        : undefined
                    }
                    onImageFileClear={
                      effectiveProperty.renderableTypeStrict === 'IMAGE'
                        ? () => setAddImageFile(null)
                        : undefined
                    }
                    onBeforeImageFileDialogOpen={
                      effectiveProperty.renderableTypeStrict === 'IMAGE'
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
                      effectiveProperty.renderableTypeStrict === 'IMAGE'
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
                  <Spacer height={12} />
                </>
              )}
              {action === 'new' && (
                <>
                  <Text variant="metadata" color="grey-04" className="block">
                    Value type
                  </Text>
                  <Spacer height={6} />
                  <div className="w-full">
                    <Select
                      value={newPropertyValueType}
                      onChange={v => setNewPropertyValueType(v as SwitchableRenderableType)}
                      options={NEW_PROPERTY_VALUE_TYPES.map(({ value, label }) => ({ value, label }))}
                      placeholder="Select type"
                      className="w-full min-w-0"
                      position="popper"
                    />
                  </div>
                  <Spacer height={12} />
                  {newPropertyValueType === 'RELATION' && !newPropertyOnly && (
                    <>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={useExistingPropertyFromGeo}
                          onChange={e => {
                            e.stopPropagation();
                            setUseExistingPropertyFromGeo(prev => !prev);
                          }}
                        />
                        <Text variant="metadata" color="grey-04">
                          Add existing property from Geo
                        </Text>
                      </div>
                      <Spacer height={12} />
                    </>
                  )}
                  {newPropertyValueType === 'RELATION' && useExistingPropertyFromGeo && !newPropertyOnly ? (
                    <div className="w-full">
                      <Text variant="metadata" color="grey-04" className="block">
                        Search for an existing property to add
                      </Text>
                      <Spacer height={6} />
                      <SelectEntityCompact
                        spaceId={spaceId}
                        relationValueTypes={[{ id: SystemIds.PROPERTY }]}
                        selected={selectedExistingProperty ? [selectedExistingProperty] : []}
                        onRemoveSelected={() => setSelectedExistingProperty(null)}
                        onDone={result => setSelectedExistingProperty(result)}
                      />
                    </div>
                  ) : (
                    <>
                      <Text variant="metadata" color="grey-04" className="block">
                        Property name
                      </Text>
                      <Spacer height={6} />
                      <SelectEntityAsPopover
                        trigger={
                          <input
                            type="text"
                            value={newPropertyName}
                            readOnly
                            placeholder="Find or create property..."
                            className="w-full cursor-pointer rounded border border-grey-02 px-2 py-1.5 text-button text-text shadow-inner-grey-02 placeholder:text-grey-04 focus:border-grey-04 focus:outline-none"
                            aria-label="Property name"
                          />
                        }
                        spaceId={spaceId}
                        relationValueTypes={[{ id: SystemIds.PROPERTY, name: 'Property' }]}
                        placeholder="Find or create property..."
                        advanced={false}
                        showIDs={false}
                        onCreateEntity={
                          onCreatePropertyEntity
                            ? result => {
                                const pickerValueType = result.renderableType;
                                const valueTypeToUse =
                                  pickerValueType && SUPPORTED_NEW_PROPERTY_VALUE_TYPE_SET.has(pickerValueType)
                                    ? pickerValueType
                                    : newPropertyValueType;

                                // Keep the outer picker in sync when the picker footer's type is supported.
                                if (valueTypeToUse !== newPropertyValueType) setNewPropertyValueType(valueTypeToUse);

                                onCreatePropertyEntity({
                                  propertyId: result.id,
                                  name: result.name,
                                  valueType: valueTypeToUse,
                                });
                              }
                            : undefined
                        }
                        onDone={(result, fromCreateFn) => {
                          setNewPropertyId(result.id);
                          setNewPropertyName(result.name ?? '');
                          setNewPropertyInitialValue('');
                          newPropertyInitialValueRef.current = '';
                          setNewPropertyImageFile(null);
                          setSelectedAttributeEntities([]);

                          // Only sync the value type picker when selecting an existing property.
                          if (!fromCreateFn) {
                            const existing = properties.find(p => p.id === result.id);
                            if (existing) {
                              if (existing.renderableTypeStrict === 'IMAGE') setNewPropertyValueType('IMAGE');
                              else if (existing.renderableTypeStrict === 'URL') setNewPropertyValueType('URL');
                              else if (existing.dataType === 'INTEGER') setNewPropertyValueType('INTEGER');
                              else if (existing.dataType === 'BOOLEAN') setNewPropertyValueType('BOOLEAN');
                              else if (existing.dataType === 'DATETIME') setNewPropertyValueType('DATETIME');
                              else if (existing.dataType === 'TEXT') setNewPropertyValueType('TEXT');
                              else if (existing.dataType === 'RELATION') setNewPropertyValueType('RELATION');
                            }
                          }
                        }}
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
                              id: newPropertyValueFieldPropertyId ?? '',
                              name: null,
                              dataType: 'RELATION',
                              relationValueTypes:
                                newPropertyValueType === 'IMAGE'
                                  ? [{ id: SystemIds.IMAGE_TYPE, name: 'Image' }]
                                  : [],
                              ...(newPropertyValueType === 'IMAGE' && { renderableTypeStrict: 'IMAGE' }),
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
                            selectedImageFile={newPropertyValueType === 'IMAGE' ? newPropertyImageFile : null}
                            onImageFileSelect={
                              newPropertyValueType === 'IMAGE'
                                ? (file: File) => setNewPropertyImageFile(file)
                                : undefined
                            }
                            onImageFileClear={
                              newPropertyValueType === 'IMAGE' ? () => setNewPropertyImageFile(null) : undefined
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
                            Add property values (optional)
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
                            onChange={v => {
                              setNewPropertyInitialValue(v);
                              newPropertyInitialValueRef.current = v;
                            }}
                          />
                        </>
                      )}
                    </>
                  )}
                  <Spacer height={12} />
                </>
              )}
              {action === 'removeProperty' && (
                <>
                  {removePropertyOnly ? (
                    <>
                      <Text variant="metadata" color="grey-04" className="block">
                        This will remove this property from all rows when you click Apply.
                      </Text>
                      <Spacer height={12} />
                    </>
                  ) : (
                    <>
                      <Text variant="metadata" color="grey-04" className="block">
                        Property name
                      </Text>
                      <Spacer height={6} />
                      <input
                        type="text"
                        value={removePropertySearchQuery}
                        onChange={e => setRemovePropertySearchQuery(e.target.value)}
                        placeholder="Find a property..."
                        className="w-full rounded-md border border-grey-02 bg-white py-2 px-3 text-body text-text shadow-inner shadow-grey-02 outline-none placeholder:text-grey-04 focus:border-grey-04 focus:shadow-inner-lg focus:shadow-text"
                      />
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
                                  : Math.min(INITIAL_REMOVE_PROPERTY_COLUMNS_VISIBLE, matchedColumnsForRemoval.length);
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
                                            isMarked ? 'border-grey-04 bg-grey-01' : 'border-grey-02 bg-white'
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
                                      <button
                                        type="button"
                                        onClick={() => setShowAllMatchedColumns(true)}
                                        className="w-full px-2 py-1.5 text-left text-[0.8125rem] text-button text-grey-04 hover:bg-grey-01 hover:text-text"
                                      >
                                        Show {hiddenCount} more
                                      </button>
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
                </>
              )}
              {action === 'delete' && effectiveProperty && (
                <>
                  <Spacer height={6} />
                  {isRelationColumn ? (() => {
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
                          {unmarkedValues.length > 0 && (
                            <>
                              <Text variant="metadata" className="text-text">
                                All values
                              </Text>
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
                            </>
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
                                const directImageUrl =
                                  effectiveProperty?.renderableTypeStrict === 'IMAGE'
                                    ? currentColumnRelations.find(
                                        (r: (typeof currentColumnRelations)[number]) =>
                                          r.toEntity.id === item.toEntityId &&
                                          (r.toSpaceId ?? r.spaceId) === (item.toSpaceId ?? spaceId)
                                      )?.toEntity.value
                                    : undefined;
                                return (
                                  <DeleteValueItem
                                    key={`${item.toEntityId}-${item.toSpaceId ?? ''}-${idx}`}
                                    item={item}
                                    property={effectiveProperty}
                                    spaceId={spaceId}
                                    space={space}
                                    valueKey={key}
                                    onMarkForDelete={() => setMarkedForDeleteKeys(prev => new Set(prev).add(key))}
                                    directImageUrl={directImageUrl}
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
                                className="w-full px-2 py-1.5 text-left text-button text-[0.8125rem] text-grey-04 hover:bg-grey-01 hover:text-text"
                              >
                                Show {hiddenCount} more
                              </button>
                            </>
                          )}
                        </div>
                        <Spacer height={12} />
                      </>
                    );
                  })() : (
                  <>
                    <Spacer height={6} />
                    <Text variant="metadata" color="grey-04">
                      All values in this property for the selected entities will be cleared when you click Apply.
                    </Text>
                    <Spacer height={12} />
                  </>
                )}
              </>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
