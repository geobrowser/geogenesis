'use client';

import {
  type CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { COLLAPSED_PROPERTY, PROPERTY_GROUPS_PROPERTY, PROPERTY_GROUP_TYPE } from '~/core/constants';
import { useCreateProperty } from '~/core/hooks/use-create-property';
import { ID } from '~/core/id';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntities, useRelations, useValue, useValues } from '~/core/sync/use-store';
import { Relation } from '~/core/types';
import { sortRelations } from '~/core/utils/utils';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Create } from '~/design-system/icons/create';
import { OrderDots } from '~/design-system/icons/order-dots';
import { Trash } from '~/design-system/icons/trash';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';
import { Text } from '~/design-system/text';

import { InlinePropertyTypeIcon } from '~/partials/entity-page/inline-property-type-icon';

const UNGROUPED_CONTAINER_ID = 'container:ungrouped';

type GroupContainer = {
  containerId: string;
  groupEntityId: string;
  groupRelation: Relation;
  propertyRelations: Relation[];
};

function containerIdForGroup(groupEntityId: string) {
  return `container:group:${groupEntityId}`;
}

function propertyDragId(propertyId: string) {
  return `property:${propertyId}`;
}

function groupDragId(groupRelationId: string) {
  return `group:${groupRelationId}`;
}

function parsePropertyDragId(id: string): string | null {
  return id.startsWith('property:') ? id.replace('property:', '') : null;
}

function parseGroupDragId(id: string): string | null {
  return id.startsWith('group:') ? id.replace('group:', '') : null;
}

function isContainerId(id: string) {
  return id.startsWith('container:');
}

function syncOrder(storageUpdate: (relation: Relation, position: string | null) => void, relations: Relation[]) {
  const currentOrder = sortRelations(relations);
  relations.forEach((relation, index) => {
    storageUpdate(relation, currentOrder[index]?.position ?? null);
  });
}

type EditorProps = {
  entityId: string;
  spaceId: string;
};
type CreatePropertyFn = ReturnType<typeof useCreateProperty>['createProperty'];

export function TypePropertyGroupsEditor({ entityId, spaceId }: EditorProps) {
  const { storage } = useMutate();
  const { createProperty } = useCreateProperty(spaceId);
  const [sectionCollapsed, setSectionCollapsed] = React.useState(false);
  const [activePropertyDragId, setActivePropertyDragId] = React.useState<string | null>(null);
  const [activeGroupDragId, setActiveGroupDragId] = React.useState<string | null>(null);
  const [groupOverlayWidths, setGroupOverlayWidths] = React.useState<Record<string, number>>({});
  const [focusGroupNameId, setFocusGroupNameId] = React.useState<string | null>(null);
  const lastOverIdRef = React.useRef<string | null>(null);

  const typePropertyRelations = sortRelations(
    useRelations({
      selector: relation =>
        relation.fromEntity.id === entityId &&
        relation.spaceId === spaceId &&
        relation.type.id === SystemIds.PROPERTIES,
    })
  );

  const propertyGroupRelations = sortRelations(
    useRelations({
      selector: relation =>
        relation.fromEntity.id === entityId &&
        relation.spaceId === spaceId &&
        relation.type.id === PROPERTY_GROUPS_PROPERTY,
    })
  );

  const groupIds = React.useMemo(
    () => new Set(propertyGroupRelations.map(relation => relation.toEntity.id)),
    [propertyGroupRelations]
  );
  // Hydrate the property-group entities into the local store so their own
  // PROPERTIES relations (and NAME value) are available to the useRelations
  // / useValues selectors below. Without this, groups whose entities were
  // never independently loaded render with empty contents until something
  // else (e.g. a search-result merge) syncs them in. spaceId is required —
  // the underlying GraphQL filters valuesList/relationsList by spaceId, so
  // an unscoped fetch returns id-only stubs with no relations to populate.
  const groupIdsForQuery = React.useMemo(() => [...groupIds], [groupIds]);
  useQueryEntities({
    enabled: groupIdsForQuery.length > 0,
    where: { id: { in: groupIdsForQuery } },
    first: groupIdsForQuery.length || undefined,
    spaceId,
  });
  const allGroupOutgoingRelations = useRelations({
    selector: relation => relation.spaceId === spaceId && groupIds.has(relation.fromEntity.id),
  });
  const allGroupPropertyRelations = React.useMemo(
    () => allGroupOutgoingRelations.filter(relation => relation.type.id === SystemIds.PROPERTIES),
    [allGroupOutgoingRelations]
  );
  const allGroupValues = useValues({
    selector: value => value.spaceId === spaceId && groupIds.has(value.entity.id),
  });

  const groupContainers: GroupContainer[] = React.useMemo(
    () =>
      propertyGroupRelations.map(groupRelation => ({
        containerId: containerIdForGroup(groupRelation.toEntity.id),
        groupEntityId: groupRelation.toEntity.id,
        groupRelation,
        propertyRelations: sortRelations(
          allGroupPropertyRelations.filter(
            relation => relation.fromEntity.id === groupRelation.toEntity.id && relation.spaceId === spaceId
          )
        ),
      })),
    [allGroupPropertyRelations, propertyGroupRelations, spaceId]
  );

  const groupedPropertyIds = new Set(allGroupPropertyRelations.map(relation => relation.toEntity.id));
  const ungroupedRelations = React.useMemo(
    () => typePropertyRelations.filter(relation => !groupedPropertyIds.has(relation.toEntity.id)),
    [groupedPropertyIds, typePropertyRelations]
  );
  const desiredTypePropertyOrder = React.useMemo(
    () => [
      ...groupContainers.flatMap(group => group.propertyRelations.map(relation => relation.toEntity.id)),
      ...ungroupedRelations.map(relation => relation.toEntity.id),
    ],
    [groupContainers, ungroupedRelations]
  );

  React.useEffect(() => {
    if (typePropertyRelations.length === 0 || desiredTypePropertyOrder.length === 0) return;

    const current = sortRelations(typePropertyRelations);
    const currentIds = current.map(relation => relation.toEntity.id);
    const relationByPropertyId = new Map(typePropertyRelations.map(relation => [relation.toEntity.id, relation]));

    // Only reorder existing type-property relations. If desired order references
    // properties not yet on the type, skip them to avoid endless re-positioning.
    const desiredExistingIds: string[] = [];
    for (const propertyId of desiredTypePropertyOrder) {
      if (!relationByPropertyId.has(propertyId)) continue;
      if (desiredExistingIds.includes(propertyId)) continue;
      desiredExistingIds.push(propertyId);
    }

    // Keep any remaining current relations at the end in their current order.
    const targetIds = [
      ...desiredExistingIds,
      ...currentIds.filter(propertyId => !desiredExistingIds.includes(propertyId)),
    ];
    const sameOrder =
      currentIds.length === targetIds.length &&
      currentIds.every((propertyId, index) => propertyId === targetIds[index]);
    if (sameOrder) return;

    targetIds.forEach((propertyId, index) => {
      const relation = relationByPropertyId.get(propertyId);
      if (!relation) return;
      storage.relations.update(relation, draft => {
        draft.position = current[index]?.position ?? Position.generate();
      });
    });
  }, [desiredTypePropertyOrder, storage, typePropertyRelations]);

  const propertyToContainer = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groupContainers) {
      for (const relation of group.propertyRelations) {
        map.set(relation.toEntity.id, group.containerId);
      }
    }
    for (const relation of ungroupedRelations) {
      map.set(relation.toEntity.id, UNGROUPED_CONTAINER_ID);
    }
    return map;
  }, [groupContainers, ungroupedRelations]);
  const propertyNameById = React.useMemo(() => {
    const map = new Map<string, string | null>();
    for (const relation of typePropertyRelations) {
      if (!map.has(relation.toEntity.id)) {
        map.set(relation.toEntity.id, relation.toEntity.name ?? null);
      }
    }
    return map;
  }, [typePropertyRelations]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );
  const collisionDetection = React.useCallback<CollisionDetection>(args => {
    const activeId = String(args.active.id);
    const draggedGroupRelationId = parseGroupDragId(activeId);

    // When dragging whole groups, only collide against other group rows.
    // Ignoring nested property droppables prevents jitter/glitchy snapping.
    if (draggedGroupRelationId) {
      const groupOnlyContainers = args.droppableContainers.filter(container => parseGroupDragId(String(container.id)));
      return closestCenter({
        ...args,
        droppableContainers: groupOnlyContainers,
      });
    }

    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    return closestCenter(args);
  }, []);

  const findContainerForOver = (overId: string | null): string | null => {
    if (!overId) return null;
    if (isContainerId(overId)) return overId;
    const propertyId = parsePropertyDragId(overId);
    if (propertyId) return propertyToContainer.get(propertyId) ?? null;
    return null;
  };

  const updateRelationPosition = (relation: Relation, position: string | null) => {
    storage.relations.update(relation, draft => {
      draft.position = position ?? Position.generate();
    });
  };

  const removePropertyFromOtherGroups = (propertyId: string, exceptGroupId?: string) => {
    const duplicates = allGroupPropertyRelations.filter(
      relation => relation.toEntity.id === propertyId && relation.fromEntity.id !== exceptGroupId
    );
    if (duplicates.length > 0) {
      storage.relations.deleteMany(duplicates);
    }
  };

  const ensurePropertyOnType = (propertyId: string, propertyName: string | null) => {
    const exists = typePropertyRelations.some(relation => relation.toEntity.id === propertyId);
    if (exists) return;

    const lastPosition = typePropertyRelations.at(-1)?.position ?? null;
    storage.relations.set({
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generateBetween(lastPosition, null),
      type: { id: SystemIds.PROPERTIES, name: 'Properties' },
      fromEntity: { id: entityId, name: null },
      toEntity: { id: propertyId, name: propertyName, value: propertyId },
    });
  };

  const onAddGroup = () => {
    const groupEntityId = ID.createEntityId();
    const lastGroupPosition = propertyGroupRelations.at(-1)?.position ?? null;

    storage.entities.name.set(groupEntityId, spaceId, '');
    storage.values.set({
      spaceId,
      entity: { id: groupEntityId, name: null },
      property: { id: COLLAPSED_PROPERTY, name: 'Collapsed', dataType: 'BOOLEAN' },
      value: '0',
    });

    storage.relations.set({
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generate(),
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      fromEntity: { id: groupEntityId, name: null },
      toEntity: { id: PROPERTY_GROUP_TYPE, name: 'Property group', value: PROPERTY_GROUP_TYPE },
    });

    storage.relations.set({
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generateBetween(lastGroupPosition, null),
      type: { id: PROPERTY_GROUPS_PROPERTY, name: 'Property groups' },
      fromEntity: { id: entityId, name: null },
      toEntity: { id: groupEntityId, name: null, value: groupEntityId },
    });
    setFocusGroupNameId(groupEntityId);
  };

  const onDeleteGroup = (groupRelation: Relation) => {
    const groupId = groupRelation.toEntity.id;
    const groupRelations = allGroupOutgoingRelations.filter(relation => relation.fromEntity.id === groupId);
    const groupValues = allGroupValues.filter(value => value.entity.id === groupId);

    storage.relations.deleteMany([...groupRelations, groupRelation]);
    storage.values.deleteMany(groupValues);
  };

  const onAddPropertyToGroup = (groupId: string, property: { id: string; name: string | null }) => {
    removePropertyFromOtherGroups(property.id, groupId);
    ensurePropertyOnType(property.id, property.name);

    const existing = allGroupPropertyRelations.find(
      relation => relation.toEntity.id === property.id && relation.fromEntity.id === groupId
    );
    if (existing) return;

    const groupRelations = sortRelations(
      allGroupPropertyRelations.filter(relation => relation.fromEntity.id === groupId)
    );
    const lastPosition = groupRelations.at(-1)?.position ?? null;
    storage.relations.set({
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generateBetween(lastPosition, null),
      type: { id: SystemIds.PROPERTIES, name: 'Properties' },
      fromEntity: { id: groupId, name: null },
      toEntity: { id: property.id, name: property.name, value: property.id },
    });
  };

  const onDragOver = (event: DragOverEvent) => {
    lastOverIdRef.current = event.over ? String(event.over.id) : null;
  };
  const onDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    setActivePropertyDragId(parsePropertyDragId(activeId));
    setActiveGroupDragId(parseGroupDragId(activeId));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActivePropertyDragId(null);
    setActiveGroupDragId(null);
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : lastOverIdRef.current;
    lastOverIdRef.current = null;
    if (!overId || activeId === overId) return;

    const draggedGroupRelationId = parseGroupDragId(activeId);
    if (draggedGroupRelationId) {
      const overGroupRelationId = resolveGroupRelationIdFromOver(overId, propertyGroupRelations, propertyToContainer);
      if (!overGroupRelationId) return;

      const oldIndex = propertyGroupRelations.findIndex(relation => relation.id === draggedGroupRelationId);
      const newIndex = propertyGroupRelations.findIndex(relation => relation.id === overGroupRelationId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(propertyGroupRelations, oldIndex, newIndex);
      reordered.forEach((relation, index) => {
        updateRelationPosition(relation, propertyGroupRelations[index]?.position ?? null);
      });
      return;
    }

    const draggedPropertyId = parsePropertyDragId(activeId);
    if (!draggedPropertyId) return;

    const sourceContainerId = propertyToContainer.get(draggedPropertyId);
    const destinationContainerId = findContainerForOver(overId);
    if (!sourceContainerId || !destinationContainerId) return;

    const overPropertyId = parsePropertyDragId(overId);
    const sourceIsUngrouped = sourceContainerId === UNGROUPED_CONTAINER_ID;
    const destinationIsUngrouped = destinationContainerId === UNGROUPED_CONTAINER_ID;
    const sourceGroupId = sourceIsUngrouped ? null : sourceContainerId.replace('container:group:', '');
    const destinationGroupId = destinationIsUngrouped ? null : destinationContainerId.replace('container:group:', '');

    const typeRelation = typePropertyRelations.find(relation => relation.toEntity.id === draggedPropertyId);
    const draggedGroupRelation = allGroupPropertyRelations.find(relation => relation.toEntity.id === draggedPropertyId);
    const draggedName = typeRelation?.toEntity.name ?? draggedGroupRelation?.toEntity.name ?? null;
    if (!typeRelation) return;

    if (sourceContainerId === destinationContainerId) {
      const containerRelations = sourceIsUngrouped
        ? ungroupedRelations
        : sortRelations(allGroupPropertyRelations.filter(relation => relation.fromEntity.id === sourceGroupId));
      const oldIndex = containerRelations.findIndex(relation => relation.toEntity.id === draggedPropertyId);
      if (oldIndex === -1) return;

      const newIndex =
        overPropertyId != null
          ? containerRelations.findIndex(relation => relation.toEntity.id === overPropertyId)
          : containerRelations.length - 1;
      if (newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(containerRelations, oldIndex, newIndex);
      syncOrder(updateRelationPosition, reordered);
      return;
    }

    const destinationGroupRelations = destinationGroupId
      ? sortRelations(allGroupPropertyRelations.filter(relation => relation.fromEntity.id === destinationGroupId))
      : [];
    const destinationInsertIndex =
      overPropertyId && destinationGroupId
        ? Math.max(
            0,
            destinationGroupRelations.findIndex(relation => relation.toEntity.id === overPropertyId)
          )
        : destinationGroupRelations.length;
    const destinationPrevPosition =
      destinationGroupId && destinationInsertIndex > 0
        ? destinationGroupRelations[destinationInsertIndex - 1]?.position
        : null;
    const destinationNextPosition =
      destinationGroupId && destinationInsertIndex < destinationGroupRelations.length
        ? destinationGroupRelations[destinationInsertIndex]?.position
        : null;

    if (!sourceIsUngrouped && sourceGroupId) {
      const sourceGroupRelation =
        draggedGroupRelation ??
        allGroupPropertyRelations.find(
          relation => relation.fromEntity.id === sourceGroupId && relation.toEntity.id === draggedPropertyId
        );
      if (sourceGroupRelation) {
        if (destinationIsUngrouped) {
          storage.relations.delete(sourceGroupRelation);
        } else if (destinationGroupId) {
          storage.relations.update(sourceGroupRelation, draft => {
            draft.fromEntity.id = destinationGroupId;
            draft.fromEntity.name = null;
            draft.position = Position.generateBetween(destinationPrevPosition ?? null, destinationNextPosition ?? null);
          });
        }
      }
    }

    if (sourceIsUngrouped && destinationGroupId) {
      const alreadyInDestinationGroup = allGroupPropertyRelations.some(
        relation => relation.fromEntity.id === destinationGroupId && relation.toEntity.id === draggedPropertyId
      );
      if (alreadyInDestinationGroup) {
        ensurePropertyOnType(draggedPropertyId, draggedName);
        return;
      }

      removePropertyFromOtherGroups(draggedPropertyId, destinationGroupId);
      storage.relations.set({
        id: ID.createEntityId(),
        entityId: ID.createEntityId(),
        spaceId,
        renderableType: 'RELATION',
        verified: false,
        position: Position.generateBetween(destinationPrevPosition ?? null, destinationNextPosition ?? null),
        type: { id: SystemIds.PROPERTIES, name: 'Properties' },
        fromEntity: { id: destinationGroupId, name: null },
        toEntity: { id: draggedPropertyId, name: draggedName, value: draggedPropertyId },
      });
    }

    ensurePropertyOnType(draggedPropertyId, draggedName);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-tableCell text-grey-04"
          onClick={() => setSectionCollapsed(previous => !previous)}
        >
          <span>Property groups</span>
          <div className={`${sectionCollapsed ? '-rotate-90' : ''} scale-110 transition-transform`}>
            <ChevronDownSmall color="grey-04" />
          </div>
        </button>
        <button
          type="button"
          onClick={onAddGroup}
          className="inline-flex h-6 w-6 items-center justify-center text-grey-04 transition-colors hover:text-text"
          aria-label="Add property group"
        >
          <Create />
        </button>
      </div>

      {!sectionCollapsed && (
        <div className="rounded-lg border border-grey-02 shadow-button">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setActivePropertyDragId(null);
              setActiveGroupDragId(null);
            }}
          >
            <SortableContext
              items={propertyGroupRelations.map(groupRelation => groupDragId(groupRelation.id))}
              strategy={verticalListSortingStrategy}
            >
              <div>
                {groupContainers.map(container => (
                  <TypePropertyGroupCard
                    key={container.groupRelation.id}
                    spaceId={spaceId}
                    groupRelation={container.groupRelation}
                    propertyRelations={container.propertyRelations}
                    typePropertyRelations={typePropertyRelations}
                    onDeleteGroup={() => onDeleteGroup(container.groupRelation)}
                    onAddProperty={property => onAddPropertyToGroup(container.groupEntityId, property)}
                    createProperty={createProperty}
                    autoFocusName={focusGroupNameId === container.groupEntityId}
                    onNameAutoFocused={() => setFocusGroupNameId(current => (current === container.groupEntityId ? null : current))}
                    onMeasureWidth={width =>
                      setGroupOverlayWidths(previous => {
                        if (previous[container.groupRelation.id] === width) return previous;
                        return { ...previous, [container.groupRelation.id]: width };
                      })
                    }
                  />
                ))}
              </div>
            </SortableContext>

            <UngroupedDropContainer
              entityId={entityId}
              spaceId={spaceId}
              relations={ungroupedRelations}
              allTypePropertyIds={typePropertyRelations.map(relation => relation.toEntity.id)}
              hasGroupsAbove={groupContainers.length > 0}
              createProperty={createProperty}
            />
            <DragOverlay>
              {activePropertyDragId ? (
                <div className="inline-flex max-w-[220px] items-center rounded border border-text bg-white px-1.5 py-px text-metadata font-normal tracking-[-0.25px] text-text shadow-lg">
                  <span className="truncate">{propertyNameById.get(activePropertyDragId) ?? activePropertyDragId}</span>
                </div>
              ) : activeGroupDragId ? (
                <GroupDragOverlayPreview
                  groupRelation={propertyGroupRelations.find(relation => relation.id === activeGroupDragId) ?? null}
                  groupContainer={
                    groupContainers.find(container => container.groupRelation.id === activeGroupDragId) ?? null
                  }
                  spaceId={spaceId}
                  width={activeGroupDragId ? groupOverlayWidths[activeGroupDragId] : undefined}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  );
}

function GroupDragOverlayPreview({
  groupRelation,
  groupContainer,
  spaceId,
  width,
}: {
  groupRelation: Relation | null;
  groupContainer: GroupContainer | null;
  spaceId: string;
  width?: number;
}) {
  const groupId = groupRelation?.toEntity.id ?? '';
  const nameValue = useValue({
    selector: value =>
      value.entity.id === groupId && value.spaceId === spaceId && value.property.id === SystemIds.NAME_PROPERTY,
  });
  const collapsedValue = useValue({
    selector: value =>
      value.entity.id === groupId && value.spaceId === spaceId && value.property.id === COLLAPSED_PROPERTY,
  });

  if (!groupRelation || !groupContainer) return null;

  return (
    <div className="rounded-md border border-text bg-white px-4 py-3 shadow-lg" style={{ width: width ?? 720 }}>
      <div className="mb-2 grid grid-cols-[170px_minmax(0,1fr)] items-center gap-2">
        <div className="inline-flex items-center gap-1 text-tableCell font-medium text-text">
          <span className="shrink-0">T|</span>
          <span className="shrink-0">Group name</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-tableCell font-normal text-text">
            {nameValue?.value?.trim() || groupRelation.toEntity.name || 'Add name...'}
          </span>
          <label className="ml-auto flex items-center gap-1 text-tableCell font-normal tracking-[-0.35px] text-grey-04">
            <Checkbox checked={getChecked(collapsedValue?.value ?? '0')} className="!size-3 rounded-[3px] *:!size-2" />
            Collapsed
          </label>
        </div>
      </div>
      <div className="grid grid-cols-[170px_minmax(0,1fr)] items-center gap-2">
        <div className="inline-flex items-center gap-2">
          <InlinePropertyTypeIcon dataType="RELATION" />
          <span className="text-tableCell font-medium text-text">Properties</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {groupContainer.propertyRelations.map(relation => (
            <LinkableRelationChip
              key={`overlay-${relation.id}`}
              isEditing={false}
              small
              truncateLabel
              className="max-w-[220px] tracking-[-0.25px]"
              currentSpaceId={spaceId}
              entityId={relation.toEntity.id}
              relationId={relation.id}
              relationEntityId={relation.entityId}
              spaceId={relation.toSpaceId}
              verified={relation.verified}
            >
              {relation.toEntity.name ?? relation.toEntity.id}
            </LinkableRelationChip>
          ))}
        </div>
      </div>
    </div>
  );
}

function TypePropertyGroupCard({
  spaceId,
  groupRelation,
  propertyRelations,
  typePropertyRelations,
  onDeleteGroup,
  onAddProperty,
  createProperty,
  autoFocusName,
  onNameAutoFocused,
  onMeasureWidth,
}: {
  spaceId: string;
  groupRelation: Relation;
  propertyRelations: Relation[];
  typePropertyRelations: Relation[];
  onDeleteGroup: () => void;
  onAddProperty: (property: { id: string; name: string | null }) => void;
  createProperty: CreatePropertyFn;
  autoFocusName: boolean;
  onNameAutoFocused: () => void;
  onMeasureWidth: (width: number) => void;
}) {
  const { storage } = useMutate();
  const sortable = useSortable({ id: groupDragId(groupRelation.id) });
  const style = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0 : 1,
  };

  const groupId = groupRelation.toEntity.id;
  const nameValue = useValue({
    selector: value =>
      value.entity.id === groupId && value.spaceId === spaceId && value.property.id === SystemIds.NAME_PROPERTY,
  });
  const collapsedValue = useValue({
    selector: value =>
      value.entity.id === groupId && value.spaceId === spaceId && value.property.id === COLLAPSED_PROPERTY,
  });

  const drop = useDroppable({ id: containerIdForGroup(groupId) });
  const setMeasuredNodeRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      sortable.setNodeRef(node);
      if (!node) return;
      const measuredWidth = Math.round(node.getBoundingClientRect().width);
      if (measuredWidth > 0) onMeasureWidth(measuredWidth);
    },
    [onMeasureWidth, sortable]
  );

  return (
    <div
      ref={setMeasuredNodeRef}
      style={style}
      className="group relative border-b border-grey-02 py-3 pr-4 pl-4 last:border-b-0"
    >
      <button
        type="button"
        className="absolute top-4 -left-6 z-10 cursor-grab text-grey-04 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Reorder group"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <OrderDots />
      </button>

      <GroupHeader
        nameValue={nameValue?.value ?? ''}
        collapsedValue={collapsedValue?.value ?? '0'}
        autoFocusName={autoFocusName}
        onChangeName={nextName => storage.entities.name.set(groupId, spaceId, nextName)}
        onNameAutoFocused={onNameAutoFocused}
        onToggleCollapsed={() => {
          const currentlyCollapsed = getChecked(collapsedValue?.value ?? '0') === true;
          storage.values.set({
            spaceId,
            entity: { id: groupId, name: nameValue?.value ?? null },
            property: { id: COLLAPSED_PROPERTY, name: 'Collapsed', dataType: 'BOOLEAN' },
            value: currentlyCollapsed ? '0' : '1',
          });
        }}
        onDeleteGroup={onDeleteGroup}
      />

      <div ref={drop.setNodeRef} className={`${drop.isOver ? 'bg-grey-01' : ''} rounded-md py-2 pr-2`}>
        <SortableContext
          items={propertyRelations.map(relation => propertyDragId(relation.toEntity.id))}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-[170px_minmax(0,1fr)] items-start gap-2">
            <div className="inline-flex items-center gap-2 pt-[3px]">
              <InlinePropertyTypeIcon dataType="RELATION" />
              <span className="text-tableCell font-medium text-text">Properties</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {propertyRelations.map(relation => (
                <SortablePropertyRow
                  key={relation.id}
                  relation={relation}
                  spaceId={spaceId}
                  onDelete={() => {
                    const typeRelation = typePropertyRelations.find(
                      typePropertyRelation => typePropertyRelation.toEntity.id === relation.toEntity.id
                    );
                    storage.relations.deleteMany(typeRelation ? [relation, typeRelation] : [relation]);
                  }}
                  onDone={result => {
                    const typeRelation = typePropertyRelations.find(
                      typePropertyRelation => typePropertyRelation.toEntity.id === relation.toEntity.id
                    );
                    storage.relations.update(relation, draft => {
                      draft.toSpaceId = result.space;
                      draft.verified = result.verified;
                    });
                    if (typeRelation) {
                      storage.relations.update(typeRelation, draft => {
                        draft.toSpaceId = result.space;
                        draft.verified = result.verified;
                      });
                    }
                  }}
                />
              ))}
              <SelectEntityAsPopover
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-grey-04 hover:text-text"
                  >
                    <Create />
                  </button>
                }
                spaceId={spaceId}
                relationValueTypes={[{ id: SystemIds.PROPERTY, name: 'Property' }]}
                onCreateEntity={result => {
                  const createdPropertyId = createProperty({
                    name: result.name || '',
                    propertyType: result.renderableType || 'TEXT',
                    verified: result.verified,
                    space: result.space,
                  });
                  return createdPropertyId;
                }}
                onDone={result => onAddProperty({ id: result.id, name: result.name })}
                placeholder="Find property..."
                advanced={false}
                showIDs={false}
              />
            </div>
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

function GroupHeader({
  nameValue,
  collapsedValue,
  autoFocusName,
  onChangeName,
  onNameAutoFocused,
  onToggleCollapsed,
  onDeleteGroup,
}: {
  nameValue: string;
  collapsedValue: string;
  autoFocusName: boolean;
  onChangeName: (nextName: string) => void;
  onNameAutoFocused: () => void;
  onToggleCollapsed: () => void;
  onDeleteGroup: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!autoFocusName) return;
    inputRef.current?.focus();
    onNameAutoFocused();
  }, [autoFocusName, onNameAutoFocused]);

  return (
    <div className="mb-2 grid grid-cols-[170px_minmax(0,1fr)] items-center gap-2">
      <div className="inline-flex items-center gap-2 text-tableCell font-medium text-text">
        <InlinePropertyTypeIcon dataType="TEXT" />
        <span className="shrink-0">Group name</span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <input
          ref={inputRef}
          value={nameValue}
          onChange={event => onChangeName(event.target.value)}
          placeholder="Add name..."
          className="min-w-0 flex-1 bg-transparent text-tableCell font-normal outline-none placeholder:text-grey-03"
        />
        <div className="ml-2 inline-flex w-[150px] items-center justify-end gap-2">
          <label className="flex items-center gap-1 text-tableCell font-normal tracking-[-0.35px] text-grey-04">
            <Checkbox
              checked={getChecked(collapsedValue)}
              onChange={onToggleCollapsed}
              className="!size-3 rounded-[3px] *:!size-2"
            />
            Collapsed
          </label>
          <button
            type="button"
            className="pointer-events-none inline-flex h-6 w-6 items-center justify-center text-grey-04 opacity-0 transition-colors transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:text-text"
            onClick={onDeleteGroup}
            aria-label="Delete group"
          >
            <Trash />
          </button>
        </div>
      </div>
    </div>
  );
}

function UngroupedDropContainer({
  entityId,
  spaceId,
  relations,
  allTypePropertyIds,
  hasGroupsAbove,
  createProperty,
}: {
  entityId: string;
  spaceId: string;
  relations: Relation[];
  allTypePropertyIds: string[];
  hasGroupsAbove: boolean;
  createProperty: CreatePropertyFn;
}) {
  const drop = useDroppable({ id: UNGROUPED_CONTAINER_ID });
  const { storage } = useMutate();

  const ensureOnTypeUngrouped = (property: { id: string; name: string | null }) => {
    if (allTypePropertyIds.includes(property.id)) return;

    const lastPosition = sortRelations(relations).at(-1)?.position ?? null;
    storage.relations.set({
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      verified: false,
      position: Position.generateBetween(lastPosition, null),
      type: { id: SystemIds.PROPERTIES, name: 'Properties' },
      fromEntity: { id: entityId, name: null },
      toEntity: { id: property.id, name: property.name, value: property.id },
    });
  };

  return (
    <div className={`${hasGroupsAbove ? 'border-t border-grey-02' : ''} px-4 py-3`}>
      {hasGroupsAbove && (
        <Text as="p" variant="metadata" className="leading-[13px] tracking-[-0.35px] text-grey-04">
          Ungrouped properties
        </Text>
      )}
      <div
        ref={drop.setNodeRef}
        className={`${hasGroupsAbove ? 'mt-2' : ''} rounded-md py-2 pr-2 ${drop.isOver ? 'bg-grey-01' : ''}`}
      >
        <SortableContext
          items={relations.map(relation => propertyDragId(relation.toEntity.id))}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-[170px_minmax(0,1fr)] items-start gap-2">
            <div className="inline-flex items-center gap-2 pt-[3px]">
              <InlinePropertyTypeIcon dataType="RELATION" />
              <span className="text-tableCell font-medium text-text">Properties</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {relations.map(relation => (
                <SortablePropertyRow
                  key={relation.id}
                  relation={relation}
                  spaceId={spaceId}
                  onDelete={() => storage.relations.delete(relation)}
                  onDone={result => {
                    storage.relations.update(relation, draft => {
                      draft.toSpaceId = result.space;
                      draft.verified = result.verified;
                    });
                  }}
                />
              ))}
              <SelectEntityAsPopover
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-grey-04 hover:text-text"
                  >
                    <Create />
                  </button>
                }
                spaceId={spaceId}
                relationValueTypes={[{ id: SystemIds.PROPERTY, name: 'Property' }]}
                onCreateEntity={result => {
                  const createdPropertyId = createProperty({
                    name: result.name || '',
                    propertyType: result.renderableType || 'TEXT',
                    verified: result.verified,
                    space: result.space,
                  });
                  return createdPropertyId;
                }}
                onDone={result => {
                  ensureOnTypeUngrouped({ id: result.id, name: result.name });
                }}
                placeholder="Find property..."
                advanced={false}
                showIDs={false}
              />
            </div>
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

function SortablePropertyRow({
  relation,
  spaceId,
  onDelete,
  onDone,
}: {
  relation: Relation;
  spaceId: string;
  onDelete: () => void;
  onDone: (result: { id: string; name: string | null; space?: string; verified?: boolean }) => void;
}) {
  const sortable = useSortable({ id: propertyDragId(relation.toEntity.id) });
  const style = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0 : 1,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className="relative inline-block max-w-full min-w-0"
      aria-label="Drag property"
    >
      <span
        className="inline-flex max-w-full min-w-0 cursor-grab items-center active:cursor-grabbing"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <LinkableRelationChip
          isEditing
          small
          truncateLabel
          className="max-w-[220px] cursor-grab! tracking-[-0.25px] **:cursor-grab! hover:cursor-grab! focus:cursor-grab! active:cursor-grabbing! [&>button]:cursor-pointer! [&>button_*]:cursor-pointer!"
          currentSpaceId={spaceId}
          entityId={relation.toEntity.id}
          relationId={relation.id}
          relationEntityId={relation.entityId}
          spaceId={relation.toSpaceId}
          verified={relation.verified}
          onDelete={onDelete}
          onDone={onDone}
        >
          {relation.toEntity.name ?? relation.toEntity.id}
        </LinkableRelationChip>
      </span>
    </div>
  );
}

function resolveGroupRelationIdFromOver(
  overId: string,
  propertyGroupRelations: Relation[],
  propertyToContainer: Map<string, string>
): string | null {
  const directGroupId = parseGroupDragId(overId);
  if (directGroupId) return directGroupId;

  if (isContainerId(overId) && overId.startsWith('container:group:')) {
    const groupEntityId = overId.replace('container:group:', '');
    const relation = propertyGroupRelations.find(item => item.toEntity.id === groupEntityId);
    return relation?.id ?? null;
  }

  const overPropertyId = parsePropertyDragId(overId);
  if (overPropertyId) {
    const containerId = propertyToContainer.get(overPropertyId);
    if (containerId?.startsWith('container:group:')) {
      const groupEntityId = containerId.replace('container:group:', '');
      const relation = propertyGroupRelations.find(item => item.toEntity.id === groupEntityId);
      return relation?.id ?? null;
    }
  }

  return null;
}
