'use client';

import { useQuery } from '@tanstack/react-query';
import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import { Effect } from 'effect';
import { getSpaces } from '~/core/io/queries';
import { useKey } from '~/core/hooks/use-key';
import { useRelations } from '~/core/sync/use-store';
import { Property } from '~/core/types';
import type { SpaceEntity } from '~/core/types';

import {
  SelectEntityCompact,
  type SelectEntityCompactResult,
} from '~/design-system/select-entity-compact';
import { NativeGeoImage } from '~/design-system/geo-image';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';
import { DataTypePill } from '~/partials/entity-page/data-type-pill';

export type EditApplyPayload = {
  property: Property;
  targetEntities: SelectEntityCompactResult[];
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
  onDeleteApply?: (payload: EditDeleteApplyPayload) => void;
};

export function EditEntitiesPopover({
  trigger,
  selectedCount,
  spaceId,
  properties,
  selectedEntityIds = [],
  onApply,
  onDeleteApply,
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

  type EditAction = 'add' | 'edit' | 'delete';
  const [action, setAction] = React.useState<EditAction>('add');

  const INITIAL_DELETE_VALUES_VISIBLE = 5;

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

  const pickerColumns = relationColumns;
  const displayColumn = selectedProperty ?? pickerColumns[0] ?? null;
  const effectiveProperty = selectedProperty ?? pickerColumns[0] ?? null;

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
    if (!effectiveProperty || selectedAttributeEntities.length === 0 || !onApply) return;
    onApply({ property: effectiveProperty, targetEntities: selectedAttributeEntities });
    setOpen(false);
    setSelectedAttributeEntities([]);
    setSelectedProperty(null);
  }, [effectiveProperty, selectedAttributeEntities, onApply]);

  const canApply = effectiveProperty && selectedAttributeEntities.length > 0 && onApply;

  React.useEffect(() => {
    if (!open) {
      setActionPickerOpen(false);
      setColumnPickerOpen(false);
      setMarkedForDeleteKeys(new Set());
      setShowAllDeleteValues(false);
    }
  }, [open]);

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
                {(['add', 'delete'] as const).map(a => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => {
                      setAction(a);
                      setActionPickerOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-button text-text hover:bg-grey-01 ${
                      action === a ? 'bg-grey-01' : ''
                    }`}
                  >
                    <span>{a === 'add' ? 'Add attribute to' : 'Remove'}</span>
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
                  {canApply && (
                    <Text variant="metadata" color="grey-04" className="block">
                      Add {selectedAttributeEntities.length} to {selectedCount} row{selectedCount === 1 ? '' : 's'}
                    </Text>
                  )}
                  {canApplyDelete && (
                    <Text variant="metadata" color="grey-04" className="block">
                      Remove {displayedDeleteValues.length} from all {selectedCount} row{selectedCount === 1 ? '' : 's'}
                    </Text>
                  )}
                </div>
                {(canApply || canApplyDelete) && (
                  <button
                    type="button"
                    onClick={canApplyDelete ? handleDeleteApply : handleApply}
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
                <span>{action === 'add' ? 'Add attribute to' : 'Remove'}</span>
                <ChevronRight />
              </button>
              <button
                type="button"
                onClick={() => setColumnPickerOpen(true)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-button text-text hover:bg-grey-01"
              >
                <span>{displayColumn ? displayColumn.name ?? displayColumn.id : 'Column'}</span>
                <ChevronRight />
              </button>
              <Spacer height={12} />
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
                                  <div
                                    key={`${item.toEntityId}-${item.toSpaceId ?? ''}-${idx}`}
                                    className="inline-flex items-center gap-1.5 rounded-m border border-grey-02 px-2 py-1.5 rounded-[5px]"
                                  >
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-[10px] bg-black text-[0.75rem] font-medium text-white">
                                      {item.count}
                                    </span>
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
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setMarkedForDeleteKeys(prev => new Set(prev).add(key))
                                      }
                                      className="shrink-0 rounded p-0.5 text-grey-04 hover:bg-grey-02 hover:text-text"
                                      aria-label={`Remove ${item.toEntityName ?? item.toEntityId}`}
                                    >
                                      <CloseSmall />
                                    </button>
                                  </div>
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
              {action !== 'delete' && (
                <div className="block">
                  <Text variant="metadata" color="grey-04" className="block">
                    Find attribute
                  </Text>
                  <Spacer height={6} />
                  <SelectEntityCompact
                    spaceId={spaceId}
                    selected={selectedAttributeEntities}
                    onRemoveSelected={id =>
                      setSelectedAttributeEntities(prev => prev.filter(e => e.id !== id))
                    }
                    onDone={result => {
                      setSelectedAttributeEntities(prev =>
                        prev.some(e => e.id === result.id) ? prev : [...prev, result]
                      );
                    }}
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
