'use client';

import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { useKey } from '~/core/hooks/use-key';
import { getSpaces } from '~/core/io/queries';
import { useRelations } from '~/core/sync/use-store';
import { Property } from '~/core/types';
import type { SpaceEntity } from '~/core/types';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';

import { NativeGeoImage } from '~/design-system/geo-image';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Select } from '~/design-system/select';
import type { SelectEntityCompactResult } from '~/design-system/select-entity-compact';
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
}: EditEntitiesPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedAttributeEntities, setSelectedAttributeEntities] = React.useState<SelectEntityCompactResult[]>([]);
  const [selectedProperty, setSelectedProperty] = React.useState<Property | null>(null);
  const [markedForDeleteKeys, setMarkedForDeleteKeys] = React.useState<Set<string>>(new Set());
  const [showAllDeleteValues, setShowAllDeleteValues] = React.useState(false);
  const [pendingValue, setPendingValue] = React.useState<string>('');

  type EditAction = 'add' | 'delete';
  const [action, setAction] = React.useState<EditAction>('add');

  const [addImageFile, setAddImageFile] = React.useState<File | null>(null);
  const addImageFileDialogOpenRef = React.useRef(false);
  const addImageFileDialogCloseTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Ref updated synchronously when value field reports a value (e.g. date blur). Use on Apply so we get latest value even when React hasn't committed state yet. */
  const pendingValueRef = React.useRef<string>('');

  const INITIAL_DELETE_VALUES_VISIBLE = 5;

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

  React.useEffect(() => {
    if (!open) {
      setMarkedForDeleteKeys(new Set());
      setShowAllDeleteValues(false);
      setPendingValue('');
      pendingValueRef.current = '';
      setAddImageFile(null);
    }
  }, [open]);

  React.useEffect(() => {
    setPendingValue('');
    pendingValueRef.current = '';
    setAddImageFile(null);
  }, [effectiveProperty?.id]);

  const valueKey = (item: { toEntityId: string; toSpaceId?: string }) => `${item.toEntityId}:${item.toSpaceId ?? ''}`;

  /** For Delete: values user marked with × = will be deleted from all selected rows on Apply. */
  const displayedDeleteValues = React.useMemo(
    () => currentColumnValues.filter(item => markedForDeleteKeys.has(valueKey(item))),
    [currentColumnValues, markedForDeleteKeys]
  );

  const canApplyDelete =
    action === 'delete' &&
    effectiveProperty != null &&
    onDeleteApply != null &&
    (isRelationColumn ? displayedDeleteValues.length > 0 : selectedEntityIds.length > 0);

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

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
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
                  Edit {selectedCount} {selectedCount === 1 ? 'entity' : 'entities'}
                </Text>
              </div>
              {(canApply || canApplyDelete) && (
                <button
                  type="button"
                  onClick={canApplyDelete ? handleDeleteApply : isRelationColumn ? handleApply : handleApplyValue}
                  className="shrink-0 text-button text-[14px] text-ctaPrimary hover:text-ctaHover hover:underline"
                >
                  Apply
                </button>
              )}
            </div>
            <Spacer height={12} />
            <div className="flex justify-end">
              <div className="inline-flex w-[180px] rounded border border-grey-02 bg-grey-01 p-0.5">
                {(
                  [
                    { id: 'add' as const, label: 'Add' },
                    { id: 'delete' as const, label: 'Remove' },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAction(id)}
                    className={`flex w-1/2 items-center justify-center rounded-sm px-3 py-1 text-[13px] font-medium ${
                      action === id ? 'shadow-sm bg-white text-text' : 'bg-transparent text-grey-04 hover:text-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <>
              <Text variant="metadata" color="grey-04" className="block">
                Property
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
            <Spacer height={12} />
            {action === 'delete' && effectiveProperty && (
              <>
                <Spacer height={6} />
                {isRelationColumn ? (
                  (() => {
                    const unmarkedValues = currentColumnValues.filter(item => !markedForDeleteKeys.has(valueKey(item)));
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
                                        r =>
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
                  })()
                ) : (
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
            {action !== 'delete' && effectiveProperty && effectiveProperty.renderableTypeStrict === 'IMAGE' && (
              <>
                <Text variant="metadata" color="grey-04" className="block">
                  Current images
                </Text>
                <Spacer height={6} />
                {currentColumnRelations.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {currentColumnRelations.map((r, idx) => (
                      <CurrentImageThumbnail
                        key={`${r.id}-${idx}`}
                        imageEntityId={r.toEntity.id}
                        spaceId={r.spaceId ?? spaceId}
                        directImageUrl={r.toEntity.value}
                      />
                    ))}
                  </div>
                ) : (
                  <Text variant="metadata" color="grey-04">
                    No images in this column for selected rows.
                  </Text>
                )}
                <Spacer height={12} />
              </>
            )}
            {action !== 'delete' && effectiveProperty && (
              <div className="block">
                <Text variant="metadata" color="grey-04" className="block">
                  {isRelationColumn ? 'To Entity' : 'Value'}
                </Text>
                <Spacer height={6} />
                <EditableEntityValueField
                  key={`value-${effectiveProperty.id}-${selectedEntityIds.join(',')}`}
                  property={effectiveProperty}
                  spaceId={spaceId}
                  value={pendingValue}
                  onChange={v => {
                    pendingValueRef.current = v;
                    setPendingValue(v);
                  }}
                  selectedEntities={selectedAttributeEntities}
                  onRemoveSelectedEntity={id => setSelectedAttributeEntities(prev => prev.filter(e => e.id !== id))}
                  onSelectEntity={result => {
                    setSelectedAttributeEntities(prev =>
                      prev.some(e => e.id === result.id) ? prev : [...prev, result]
                    );
                  }}
                  selectedImageFile={
                    action === 'add' && effectiveProperty.renderableTypeStrict === 'IMAGE' ? addImageFile : null
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
