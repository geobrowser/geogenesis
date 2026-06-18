import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { ClientRect, CollisionDetection, Modifier } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import type { SortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';

import React from 'react';

import { useMutate } from '~/core/sync/use-mutate';
import { Relation } from '~/core/types';
import { sortRelations } from '~/core/utils/utils';

import { LinkableRelationChip } from './chip';

const SUBTLE_GAP_TRANSITION = { duration: 0.24, ease: [0.4, 0, 0.2, 1] as const };
const CHIP_REFLOW_TRANSITION_CLASS = 'transition-[opacity,transform] duration-200 ease-out';
const chipListClassName =
  'relative flex w-full min-w-0 max-w-full flex-row flex-wrap content-start justify-start items-start gap-1';

type OverlaySize = { width: number; height: number };
type LayoutMode = 'vertical' | 'inline';

function relationLabel(relation: Relation) {
  return relation.toEntity.name ?? relation.toEntity.id;
}

function shouldTruncateLabel(label: string, layoutMode: LayoutMode) {
  if (layoutMode === 'inline') return true;
  return label.length < 42;
}

/** Flex-wrap chip rows always render single-line truncated labels. */
const chipListLayoutMode: LayoutMode = 'inline';

export const RELATION_CHIPS_UNGROUPED_CONTAINER_ID = 'container:ungrouped';

export function relationChipsContainerIdForGroup(groupEntityId: string) {
  return `container:group:${groupEntityId}`;
}

export function isRelationChipsContainerId(id: string) {
  return id.startsWith('container:');
}

export type RelationChipDragEndEvent = {
  relation: Relation;
  propertyId: string;
  sourceContainerId: string;
  destinationContainerId: string;
  destinationInsertBeforeIndex: number;
};

type ContainerRegistration = {
  containerId: string;
  relations: Relation[];
  onUpdateRelation: (relation: Relation, newPosition: string | null) => void;
  chipNodesRef: React.MutableRefObject<Map<string, HTMLElement>>;
  listLayoutRef: React.RefObject<HTMLDivElement | null>;
};

type RelationChipsDndRootContextValue = {
  spaceId: string;
  registerContainer: (registration: ContainerRegistration) => void;
  unregisterContainer: (containerId: string) => void;
  activeId: string | null;
  destinationContainerId: string | null;
  insertBeforeIndex: number | null;
  overlaySize: OverlaySize | null;
  registerChipNode: (containerId: string, relationId: string, node: HTMLDivElement | null) => void;
  getInsertGapState: (containerId: string, relations: Relation[]) => {
    gapSize: OverlaySize | null;
    insertBeforeIndex: number | null;
    useLayoutAnimateWhileDragging: boolean;
  };
};

const RelationChipsDndRootContext = React.createContext<RelationChipsDndRootContextValue | null>(null);

function useRelationChipsDndRoot() {
  const context = React.useContext(RelationChipsDndRootContext);
  if (!context) {
    throw new Error('ReorderableRelationChipsDnd with containerId must be used inside RelationChipsDndRoot');
  }
  return context;
}

function findContainerForOverId(
  overId: string | null,
  relationIdToContainerId: Map<string, string>
): string | null {
  if (!overId) return null;
  if (isRelationChipsContainerId(overId)) return overId;
  return relationIdToContainerId.get(overId) ?? null;
}

const inlineWrappedSortingStrategy: SortingStrategy = () => ({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
});

function pointerClientPosition(event: Event): { x: number; y: number } | null {
  if (!('clientX' in event) || !('clientY' in event)) {
    return null;
  }
  const { clientX, clientY } = event as Event & { clientX: number; clientY: number };
  if (typeof clientX !== 'number' || typeof clientY !== 'number') {
    return null;
  }
  return { x: clientX, y: clientY };
}

const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) {
    return transform;
  }
  const pointer = pointerClientPosition(activatorEvent);
  if (!pointer) {
    return transform;
  }
  return {
    ...transform,
    x: transform.x + pointer.x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + pointer.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};

export const inlineWrappedCollisionDetection: CollisionDetection = args => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCorners(args);
};

type DragPointerEvent = {
  activatorEvent: Event | null;
  delta?: { x: number; y: number };
};

function pointerFromDragEvent(event: DragPointerEvent): { x: number; y: number } | null {
  const activator = event.activatorEvent;
  const pointer = activator ? pointerClientPosition(activator) : null;
  if (!pointer) return null;
  return {
    x: pointer.x + (event.delta?.x ?? 0),
    y: pointer.y + (event.delta?.y ?? 0),
  };
}

function collectRects(chipNodes: Map<string, HTMLElement>, activeId: string): Map<string, ClientRect> {
  const rects = new Map<string, ClientRect>();
  chipNodes.forEach((node, id) => {
    const rect = node.getBoundingClientRect();
    if (id === activeId && rect.width <= 0) return;
    if (rect.width > 0 && rect.height > 0) {
      rects.set(id, rect);
    }
  });
  return rects;
}

function measureChipNodes(chipNodes: Map<string, HTMLElement>, itemSizes: Record<string, OverlaySize>) {
  chipNodes.forEach((node, relationId) => {
    const { width, height } = node.getBoundingClientRect();
    if (width > 0 && height > 0) {
      itemSizes[relationId] = { width: Math.round(width), height: Math.round(height) };
    }
  });
}

function resolveOverlaySize(
  relationId: string,
  itemSizes: Record<string, OverlaySize>,
  chipNodes: Map<string, HTMLElement>,
  initialRect: ClientRect | null
): OverlaySize | null {
  const cached = itemSizes[relationId];
  if (cached) return cached;

  const node = chipNodes.get(relationId);
  if (node) {
    const { width, height } = node.getBoundingClientRect();
    if (width > 0 && height > 0) {
      const size = { width: Math.round(width), height: Math.round(height) };
      itemSizes[relationId] = size;
      return size;
    }
  }

  if (initialRect && initialRect.width > 0 && initialRect.height > 0) {
    const size = { width: Math.round(initialRect.width), height: Math.round(initialRect.height) };
    itemSizes[relationId] = size;
    return size;
  }

  return null;
}

const CURSOR_REGION_PX = 12;
const POINTER_MOVE_THRESHOLD_PX = 6;
const COLUMN_HYSTERESIS_RATIO = 0.25;
const COLUMN_HYSTERESIS_MIN_PX = 10;
const ROW_HYSTERESIS_PX = 10;

function pointerMovedEnough(
  next: { x: number; y: number },
  last: { x: number; y: number } | null
): boolean {
  if (!last) return true;
  const dx = next.x - last.x;
  const dy = next.y - last.y;
  return dx * dx + dy * dy >= POINTER_MOVE_THRESHOLD_PX * POINTER_MOVE_THRESHOLD_PX;
}

/** Ignore pointer samples outside the chip list while dragging — rapid moves often leave the group. */
function pointerInsideListBounds(
  pointer: { x: number; y: number },
  bounds: ClientRect,
  margin = CURSOR_REGION_PX
): boolean {
  return (
    pointer.x >= bounds.left - margin &&
    pointer.x <= bounds.right + margin &&
    pointer.y >= bounds.top - margin &&
    pointer.y <= bounds.bottom + margin
  );
}

type InsertPointerResolution = {
  insertBefore: number;
  pointer: { x: number; y: number };
};

function resolveInsertBeforeFromPointer(args: {
  pointer: { x: number; y: number };
  activeId: string;
  relations: Relation[];
  chipNodes: Map<string, HTMLElement>;
  listLayoutEl: HTMLElement | null;
  currentInsertBefore: number | null;
  lastPointer: { x: number; y: number } | null;
  requirePointerMove?: boolean;
  requireInsideList?: boolean;
}): InsertPointerResolution | null {
  const {
    pointer,
    activeId,
    relations,
    chipNodes,
    listLayoutEl,
    currentInsertBefore,
    lastPointer,
    requirePointerMove = true,
    requireInsideList = true,
  } = args;

  if (requirePointerMove && currentInsertBefore != null && !pointerMovedEnough(pointer, lastPointer)) {
    return null;
  }

  const listBounds = listLayoutEl?.getBoundingClientRect() ?? null;
  if (requireInsideList && listBounds && !pointerInsideListBounds(pointer, listBounds)) {
    return null;
  }

  let rectById = collectRects(chipNodes, activeId);
  if (rectById.size === 0) return null;

  const insertBefore = computeInsertBeforeIndex(
    pointer,
    relations,
    rectById,
    activeId,
    currentInsertBefore
  );

  return { insertBefore, pointer };
}

type ChipRow = {
  top: number;
  bottom: number;
  items: { index: number; rect: ClientRect }[];
};

function buildChipRows(relations: Relation[], rectById: Map<string, ClientRect>, activeId: string): ChipRow[] {
  const rows: ChipRow[] = [];

  for (let i = 0; i < relations.length; i++) {
    const relation = relations[i];
    if (relation.id === activeId) continue;

    const rect = rectById.get(relation.id);
    if (!rect) continue;

    const currentRow = rows[rows.length - 1];
    if (currentRow) {
      const overlap = Math.min(rect.bottom, currentRow.bottom) - Math.max(rect.top, currentRow.top);
      const minHeight = Math.min(rect.height, currentRow.bottom - currentRow.top);
      if (overlap > minHeight * 0.5) {
        currentRow.items.push({ index: i, rect });
        currentRow.top = Math.min(currentRow.top, rect.top);
        currentRow.bottom = Math.max(currentRow.bottom, rect.bottom);
        continue;
      }
    }

    rows.push({ top: rect.top, bottom: rect.bottom, items: [{ index: i, rect }] });
  }

  return rows;
}

function findTargetRowIndex(rows: ChipRow[], pointerY: number): number {
  const r = CURSOR_REGION_PX;
  const contained = rows.findIndex(row => pointerY >= row.top - r && pointerY <= row.bottom + r);
  if (contained !== -1) return contained;

  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  if (pointerY <= firstRow.top) return 0;
  if (pointerY >= lastRow.bottom) return rows.length - 1;

  let closest = 0;
  let closestDistance = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const center = (rows[i].top + rows[i].bottom) / 2;
    const distance = Math.abs(pointerY - center);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = i;
    }
  }
  return closest;
}

function computeInsertBeforeIndex(
  pointer: { x: number; y: number },
  relations: Relation[],
  rectById: Map<string, ClientRect>,
  activeId: string,
  currentInsertBefore: number | null = null
): number {
  const rows = buildChipRows(relations, rectById, activeId);
  if (rows.length === 0) return relations.length;

  const targetRowIndex = findTargetRowIndex(rows, pointer.y);

  let resolvedRowIndex = targetRowIndex;
  if (currentInsertBefore != null) {
    const currentRowIndex = rows.findIndex(row =>
      row.items.some(item => item.index === currentInsertBefore || item.index + 1 === currentInsertBefore)
    );
    if (currentRowIndex !== -1 && currentRowIndex !== targetRowIndex) {
      const currentRow = rows[currentRowIndex];
      const movingDown = targetRowIndex > currentRowIndex;
      const stayWithinCurrentRow = movingDown
        ? pointer.y < currentRow.bottom + ROW_HYSTERESIS_PX
        : pointer.y > currentRow.top - ROW_HYSTERESIS_PX;
      if (stayWithinCurrentRow) {
        resolvedRowIndex = currentRowIndex;
      }
    }
  }

  const targetRow = rows[resolvedRowIndex];

  for (const item of targetRow.items) {
    const midX = item.rect.left + item.rect.width / 2;
    const isCurrentSlot = currentInsertBefore === item.index;
    const isNextSlot = currentInsertBefore === item.index + 1;
    const deadZone =
      currentInsertBefore == null
        ? 0
        : Math.max(item.rect.width * COLUMN_HYSTERESIS_RATIO, COLUMN_HYSTERESIS_MIN_PX);
    const threshold = midX + (isCurrentSlot ? deadZone : isNextSlot ? -deadZone : 0);
    if (pointer.x < threshold) {
      return item.index;
    }
  }

  return targetRow.items[targetRow.items.length - 1].index + 1;
}

function insertBeforeToMoveIndex(insertBefore: number, activeIndex: number): number {
  if (insertBefore === activeIndex || insertBefore === activeIndex + 1) {
    return activeIndex;
  }
  if (insertBefore < activeIndex) {
    return insertBefore;
  }
  return insertBefore - 1;
}

function DragInsertGap({
  width,
  height,
  subtleMotion,
}: {
  width: number;
  height: number;
  subtleMotion: boolean;
}) {
  const style = { height, minHeight: height, flex: 'none' as const, boxSizing: 'border-box' as const };

  if (!subtleMotion) {
    return <div className="shrink-0 self-start" style={{ ...style, width }} aria-hidden />;
  }

  return (
    <motion.div
      initial={{ width: 0, opacity: 0.35, scale: 0.94 }}
      animate={{ width, opacity: 1, scale: 1 }}
      transition={SUBTLE_GAP_TRANSITION}
      className="shrink-0 origin-left self-start overflow-hidden"
      style={style}
      aria-hidden
    />
  );
}

type RelationChipsSortableListProps = {
  sortedRelations: Relation[];
  spaceId: string;
  layoutMode: LayoutMode;
  afterChips?: React.ReactNode;
  listLayoutRef: React.RefObject<HTMLDivElement | null>;
  activeId: string | null;
  insertBeforeIndex: number | null;
  gapSize: OverlaySize | null;
  useInsertGapDnD: boolean;
  useLayoutAnimateWhileDragging: boolean;
  registerChipNode: (relationId: string, node: HTMLDivElement | null) => void;
};

function RelationChipsSortableList({
  sortedRelations,
  spaceId,
  layoutMode,
  afterChips,
  listLayoutRef,
  activeId,
  insertBeforeIndex,
  gapSize,
  useInsertGapDnD,
  useLayoutAnimateWhileDragging,
  registerChipNode,
}: RelationChipsSortableListProps) {
  const activeIndex = activeId ? sortedRelations.findIndex(r => r.id === activeId) : -1;

  const sortableItems = sortedRelations.map((relation, index) => {
    const showGap =
      useInsertGapDnD &&
      activeId &&
      gapSize &&
      insertBeforeIndex === index &&
      insertBeforeIndex !== activeIndex &&
      insertBeforeIndex !== activeIndex + 1;

    const chip = (
      <SortableRelationChip
        relation={relation}
        spaceId={spaceId}
        layoutMode={layoutMode}
        collapseInPlaceWhenDragging
        isListDragging={activeId != null}
        onMeasureSize={node => registerChipNode(relation.id, node)}
      />
    );

    return (
      <React.Fragment key={relation.id}>
        {showGap ? (
          <DragInsertGap
            width={gapSize.width}
            height={gapSize.height}
            subtleMotion={useLayoutAnimateWhileDragging}
          />
        ) : null}
        {chip}
      </React.Fragment>
    );
  });

  const showTrailingGap =
    useInsertGapDnD &&
    activeId &&
    gapSize &&
    insertBeforeIndex === sortedRelations.length;

  const listClassName = useLayoutAnimateWhileDragging
    ? `${chipListClassName} overflow-hidden`
    : chipListClassName;

  if (useLayoutAnimateWhileDragging) {
    return (
      <div ref={listLayoutRef} className={listClassName}>
        {sortableItems}
        {showTrailingGap ? (
          <DragInsertGap width={gapSize.width} height={gapSize.height} subtleMotion />
        ) : null}
        {afterChips}
      </div>
    );
  }

  return (
    <div ref={listLayoutRef} className={listClassName}>
      {sortableItems}
      {showTrailingGap ? (
        <DragInsertGap width={gapSize.width} height={gapSize.height} subtleMotion={false} />
      ) : null}
      {afterChips}
    </div>
  );
}

type RelationChipsDndRootProps = {
  spaceId: string;
  children: React.ReactNode;
  onChipDragEnd: (event: RelationChipDragEndEvent) => void;
  collisionDetection?: CollisionDetection;
  onExternalDragStart?: (event: DragStartEvent) => void;
  onExternalDragEnd?: (event: DragEndEvent) => boolean;
  renderExternalOverlay?: () => React.ReactNode;
};

export function RelationChipsDndRoot({
  spaceId,
  children,
  onChipDragEnd,
  collisionDetection = inlineWrappedCollisionDetection,
  onExternalDragStart,
  onExternalDragEnd,
  renderExternalOverlay,
}: RelationChipsDndRootProps) {
  const containersRef = React.useRef<Map<string, ContainerRegistration>>(new Map());
  const relationIdToContainerIdRef = React.useRef<Map<string, string>>(new Map());
  const activeIdRef = React.useRef<string | null>(null);
  const activeSourceContainerIdRef = React.useRef<string | null>(null);
  const destinationContainerIdRef = React.useRef<string | null>(null);
  const insertBeforeIndexRef = React.useRef<number | null>(null);
  const overlaySizeRef = React.useRef<OverlaySize | null>(null);
  const itemSizesRef = React.useRef<Record<string, OverlaySize>>({});
  const lastOverIdRef = React.useRef<string | null>(null);
  const lastInsertPointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const insertRafRef = React.useRef<number | null>(null);
  const pendingInsertRef = React.useRef<{
    pointer: { x: number; y: number };
    activeRelationId: string;
    overId: string | null;
  } | null>(null);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeSourceContainerId, setActiveSourceContainerId] = React.useState<string | null>(null);
  const [destinationContainerId, setDestinationContainerId] = React.useState<string | null>(null);
  const [insertBeforeIndex, setInsertBeforeIndex] = React.useState<number | null>(null);
  const [overlaySize, setOverlaySize] = React.useState<OverlaySize | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const rebuildRelationContainerMap = React.useCallback(() => {
    const map = new Map<string, string>();
    containersRef.current.forEach(registration => {
      for (const relation of registration.relations) {
        map.set(relation.id, registration.containerId);
      }
    });
    relationIdToContainerIdRef.current = map;
  }, []);

  const registerContainer = React.useCallback((registration: ContainerRegistration) => {
    containersRef.current.set(registration.containerId, registration);
    rebuildRelationContainerMap();
  }, [rebuildRelationContainerMap]);

  const unregisterContainer = React.useCallback(
    (containerId: string) => {
      containersRef.current.delete(containerId);
      rebuildRelationContainerMap();
    },
    [rebuildRelationContainerMap]
  );

  const registerChipNode = React.useCallback((containerId: string, relationId: string, node: HTMLDivElement | null) => {
    const registration = containersRef.current.get(containerId);
    if (!registration) return;
    if (node) {
      registration.chipNodesRef.current.set(relationId, node);
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) {
        itemSizesRef.current[relationId] = {
          width: Math.round(width),
          height: Math.round(height),
        };
      }
    } else {
      registration.chipNodesRef.current.delete(relationId);
    }
  }, []);

  const getRegistrationForRelation = (relationId: string) => {
    const containerId = relationIdToContainerIdRef.current.get(relationId);
    if (!containerId) return null;
    return containersRef.current.get(containerId) ?? null;
  };

  const updateDestinationFromPointer = React.useCallback(
    (pointer: { x: number; y: number } | null, activeRelationId: string, overId: string | null) => {
      const previousDestinationId = destinationContainerIdRef.current;
      const destinationId =
        findContainerForOverId(overId, relationIdToContainerIdRef.current) ??
        activeSourceContainerIdRef.current;
      if (!destinationId) return;

      const registration = containersRef.current.get(destinationId);
      if (!registration || registration.relations.length <= 1) {
        destinationContainerIdRef.current = destinationId;
        insertBeforeIndexRef.current = null;
        lastInsertPointerRef.current = null;
        setDestinationContainerId(destinationId);
        setInsertBeforeIndex(null);
        return;
      }

      destinationContainerIdRef.current = destinationId;
      setDestinationContainerId(destinationId);

      if (!pointer) return;

      const sortedRelations = sortRelations(registration.relations);
      if (isRelationChipsContainerId(overId ?? '')) {
        insertBeforeIndexRef.current = sortedRelations.length;
        lastInsertPointerRef.current = pointer;
        setInsertBeforeIndex(sortedRelations.length);
        return;
      }

      const sameContainer = previousDestinationId === destinationId;
      let rectById = collectRects(registration.chipNodesRef.current, activeRelationId);
      if (rectById.size === 0) {
        measureChipNodes(registration.chipNodesRef.current, itemSizesRef.current);
      }

      const result = resolveInsertBeforeFromPointer({
        pointer,
        activeId: activeRelationId,
        relations: sortedRelations,
        chipNodes: registration.chipNodesRef.current,
        listLayoutEl: registration.listLayoutRef.current,
        currentInsertBefore: sameContainer ? insertBeforeIndexRef.current : null,
        lastPointer: sameContainer ? lastInsertPointerRef.current : null,
      });
      if (!result) return;

      insertBeforeIndexRef.current = result.insertBefore;
      lastInsertPointerRef.current = result.pointer;
      setInsertBeforeIndex(result.insertBefore);
    },
    []
  );

  const flushDestinationFromPointer = React.useCallback(() => {
    insertRafRef.current = null;
    const pending = pendingInsertRef.current;
    pendingInsertRef.current = null;
    if (!pending) return;
    updateDestinationFromPointer(pending.pointer, pending.activeRelationId, pending.overId);
  }, [updateDestinationFromPointer]);

  const scheduleDestinationFromPointer = React.useCallback(
    (pointer: { x: number; y: number } | null, activeRelationId: string, overId: string | null) => {
      if (!pointer) return;
      pendingInsertRef.current = { pointer, activeRelationId, overId };
      if (insertRafRef.current != null) return;
      insertRafRef.current = requestAnimationFrame(flushDestinationFromPointer);
    },
    [flushDestinationFromPointer]
  );

  const clearDragState = () => {
    activeIdRef.current = null;
    activeSourceContainerIdRef.current = null;
    destinationContainerIdRef.current = null;
    insertBeforeIndexRef.current = null;
    overlaySizeRef.current = null;
    lastInsertPointerRef.current = null;
    pendingInsertRef.current = null;
    if (insertRafRef.current != null) {
      cancelAnimationFrame(insertRafRef.current);
      insertRafRef.current = null;
    }
    setActiveId(null);
    setActiveSourceContainerId(null);
    setDestinationContainerId(null);
    setInsertBeforeIndex(null);
    setOverlaySize(null);
    lastOverIdRef.current = null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (!relationIdToContainerIdRef.current.has(id)) {
      onExternalDragStart?.(event);
      return;
    }

    activeIdRef.current = id;
    setActiveId(id);

    const sourceContainerId = relationIdToContainerIdRef.current.get(id) ?? null;
    activeSourceContainerIdRef.current = sourceContainerId;
    setActiveSourceContainerId(sourceContainerId);

    const sourceRegistration = sourceContainerId ? containersRef.current.get(sourceContainerId) : null;
    if (sourceRegistration) {
      measureChipNodes(sourceRegistration.chipNodesRef.current, itemSizesRef.current);
    }

    const nextOverlaySize = resolveOverlaySize(
      id,
      itemSizesRef.current,
      sourceRegistration?.chipNodesRef.current ?? new Map(),
      event.active.rect.current.initial
    );
    overlaySizeRef.current = nextOverlaySize;
    setOverlaySize(nextOverlaySize);

    updateDestinationFromPointer(pointerFromDragEvent(event), id, null);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const activeRelationId = String(event.active.id);
    if (!relationIdToContainerIdRef.current.has(activeRelationId)) return;
    const overId = event.over ? String(event.over.id) : lastOverIdRef.current;
    scheduleDestinationFromPointer(pointerFromDragEvent(event), activeRelationId, overId);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const activeRelationId = String(event.active.id);
    if (!relationIdToContainerIdRef.current.has(activeRelationId)) return;
    lastOverIdRef.current = event.over ? String(event.over.id) : null;
    scheduleDestinationFromPointer(
      pointerFromDragEvent(event),
      activeRelationId,
      lastOverIdRef.current
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeRelationId = String(event.active.id);
    if (!relationIdToContainerIdRef.current.has(activeRelationId)) {
      const handled = onExternalDragEnd?.(event) ?? false;
      if (!handled) clearDragState();
      return;
    }

    const overId = event.over ? String(event.over.id) : lastOverIdRef.current;
    const sourceContainerId = activeSourceContainerIdRef.current;
    const destinationId =
      findContainerForOverId(overId, relationIdToContainerIdRef.current) ?? sourceContainerId;

    const sourceRegistration = sourceContainerId ? containersRef.current.get(sourceContainerId) : null;
    const destinationRegistration = destinationId ? containersRef.current.get(destinationId) : null;

    if (sourceRegistration && destinationRegistration && sourceContainerId && destinationId) {
      const relation = sourceRegistration.relations.find(item => item.id === activeRelationId);
      if (relation) {
        if (sourceContainerId === destinationId) {
          const sortedRelations = sortRelations(sourceRegistration.relations);
          const oldIndex = sortedRelations.findIndex(item => item.id === activeRelationId);
          if (oldIndex >= 0 && sortedRelations.length > 1) {
            const pointer = pointerFromDragEvent(event);
            const resolved =
              pointer &&
              resolveInsertBeforeFromPointer({
                pointer,
                activeId: activeRelationId,
                relations: sortedRelations,
                chipNodes: sourceRegistration.chipNodesRef.current,
                listLayoutEl: sourceRegistration.listLayoutRef.current,
                currentInsertBefore: insertBeforeIndexRef.current,
                lastPointer: lastInsertPointerRef.current,
                requirePointerMove: false,
                requireInsideList: false,
              });
            const insertBefore = resolved?.insertBefore ?? insertBeforeIndexRef.current;
            if (insertBefore != null) {
              const newIndex = insertBeforeToMoveIndex(insertBefore, oldIndex);
              if (newIndex >= 0 && newIndex !== oldIndex) {
                const newList = arrayMove(sortedRelations, oldIndex, newIndex);
                newList.forEach((item, index) => {
                  sourceRegistration.onUpdateRelation(item, sortedRelations[index].position ?? null);
                });
              }
            }
          }
        } else {
          const sortedDestination = sortRelations(destinationRegistration.relations);
          const pointer = pointerFromDragEvent(event);
          const resolved =
            pointer &&
            resolveInsertBeforeFromPointer({
              pointer,
              activeId: activeRelationId,
              relations: sortedDestination,
              chipNodes: destinationRegistration.chipNodesRef.current,
              listLayoutEl: destinationRegistration.listLayoutRef.current,
              currentInsertBefore: insertBeforeIndexRef.current,
              lastPointer: lastInsertPointerRef.current,
              requirePointerMove: false,
              requireInsideList: false,
            });
          const insertBefore =
            resolved?.insertBefore ??
            insertBeforeIndexRef.current ??
            (isRelationChipsContainerId(overId ?? '') ? sortedDestination.length : sortedDestination.length);

          onChipDragEnd({
            relation,
            propertyId: relation.toEntity.id,
            sourceContainerId,
            destinationContainerId: destinationId,
            destinationInsertBeforeIndex: insertBefore,
          });
        }
      }
    }

    clearDragState();
  };

  const getInsertGapState = React.useCallback(
    (containerId: string, relations: Relation[]) => {
      const draggingId = activeIdRef.current;
      const gapContainerId = destinationContainerIdRef.current ?? activeSourceContainerIdRef.current;
      const showInThisContainer = draggingId != null && gapContainerId === containerId;
      const useInsertGapDnD = relations.length > 1;

      return {
        gapSize: showInThisContainer
          ? overlaySizeRef.current ?? (draggingId ? itemSizesRef.current[draggingId] : null)
          : null,
        insertBeforeIndex: showInThisContainer ? insertBeforeIndexRef.current : null,
        useLayoutAnimateWhileDragging: useInsertGapDnD && draggingId != null,
      };
    },
    [activeId, activeSourceContainerId, destinationContainerId, insertBeforeIndex, overlaySize]
  );

  const contextValue = React.useMemo<RelationChipsDndRootContextValue>(
    () => ({
      spaceId,
      registerContainer,
      unregisterContainer,
      activeId: activeIdRef.current ?? activeId,
      destinationContainerId: destinationContainerIdRef.current ?? destinationContainerId,
      insertBeforeIndex: insertBeforeIndexRef.current ?? insertBeforeIndex,
      overlaySize: overlaySizeRef.current ?? overlaySize,
      registerChipNode,
      getInsertGapState,
    }),
    [
      spaceId,
      registerContainer,
      unregisterContainer,
      activeId,
      destinationContainerId,
      insertBeforeIndex,
      overlaySize,
      registerChipNode,
      getInsertGapState,
    ]
  );

  const activeRelation = (activeIdRef.current ?? activeId)
    ? [...containersRef.current.values()]
        .flatMap(registration => registration.relations)
        .find(relation => relation.id === activeId)
    : null;

  return (
    <RelationChipsDndRootContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={clearDragState}
      >
        {children}
        <DragOverlay dropAnimation={null} zIndex={10002} modifiers={[snapCenterToCursor]}>
          {activeRelation ? (
            <RelationChipDragOverlay relation={activeRelation} spaceId={spaceId} size={overlaySize} />
          ) : (
            renderExternalOverlay?.() ?? null
          )}
        </DragOverlay>
      </DndContext>
    </RelationChipsDndRootContext.Provider>
  );
}

function ReorderableRelationChipsInRoot({
  containerId,
  relations,
  onUpdateRelation,
  spaceId,
  afterChips,
}: {
  containerId: string;
  relations: Relation[];
  onUpdateRelation: (relation: Relation, newPosition: string | null) => void;
  spaceId: string;
  afterChips?: React.ReactNode;
}) {
  const root = useRelationChipsDndRoot();
  const sortedRelations = sortRelations(relations);
  const layoutMode = chipListLayoutMode;
  const listLayoutRef = React.useRef<HTMLDivElement>(null);
  const chipNodesRef = React.useRef<Map<string, HTMLElement>>(new Map());
  const relationListKey = sortedRelations.map(relation => relation.id).join('\0');
  const drop = useDroppable({ id: containerId });
  const onUpdateRelationRef = React.useRef(onUpdateRelation);
  onUpdateRelationRef.current = onUpdateRelation;

  const syncChipNode = React.useCallback(
    (relationId: string, node: HTMLDivElement | null) => {
      if (node) {
        chipNodesRef.current.set(relationId, node);
      } else {
        chipNodesRef.current.delete(relationId);
      }
      root.registerChipNode(containerId, relationId, node);
    },
    [containerId, root]
  );

  React.useLayoutEffect(() => {
    root.registerContainer({
      containerId,
      relations: sortRelations(relations),
      onUpdateRelation: (relation, position) => onUpdateRelationRef.current(relation, position),
      chipNodesRef,
      listLayoutRef,
    });
    chipNodesRef.current.forEach((node, relationId) => {
      root.registerChipNode(containerId, relationId, node as HTMLDivElement);
    });
    return () => root.unregisterContainer(containerId);
  }, [containerId, relationListKey, relations, root]);

  const { gapSize, insertBeforeIndex, useLayoutAnimateWhileDragging } = root.getInsertGapState(
    containerId,
    sortedRelations
  );
  const useInsertGapDnD = sortedRelations.length > 1;

  if (sortedRelations.length <= 1) {
    return (
      <div ref={drop.setNodeRef} className="min-w-0 flex-1">
        {sortedRelations.map(relation => (
          <StaticRelationChip key={`relation-${relation.id}`} relation={relation} spaceId={spaceId} layoutMode={layoutMode} />
        ))}
        {afterChips}
      </div>
    );
  }

  return (
    <div ref={drop.setNodeRef} className="min-w-0 flex-1">
      <SortableContext items={sortedRelations.map(relation => relation.id)} strategy={inlineWrappedSortingStrategy}>
        <RelationChipsSortableList
          sortedRelations={sortedRelations}
          spaceId={spaceId}
          layoutMode={layoutMode}
          afterChips={afterChips}
          listLayoutRef={listLayoutRef}
          activeId={root.activeId}
          insertBeforeIndex={insertBeforeIndex}
          gapSize={gapSize}
          useInsertGapDnD={useInsertGapDnD}
          useLayoutAnimateWhileDragging={useLayoutAnimateWhileDragging}
          registerChipNode={syncChipNode}
        />
      </SortableContext>
    </div>
  );
}

export default function ReorderableRelationChipsDnd({
  relations,
  onUpdateRelation,
  spaceId,
  afterChips,
  containerId,
}: {
  relations: Relation[];
  onUpdateRelation: (relation: Relation, newPosition: string | null) => void;
  spaceId: string;
  afterChips?: React.ReactNode;
  containerId?: string;
}) {
  if (containerId) {
    return (
      <ReorderableRelationChipsInRoot
        containerId={containerId}
        relations={relations}
        onUpdateRelation={onUpdateRelation}
        spaceId={spaceId}
        afterChips={afterChips}
      />
    );
  }

  const sortedRelations = sortRelations(relations);
  const relationListKey = sortedRelations.map(relation => relation.id).join('\0');
  const layoutMode = chipListLayoutMode;
  const listLayoutRef = React.useRef<HTMLDivElement>(null);
  const chipNodesRef = React.useRef<Map<string, HTMLElement>>(new Map());
  const activeIdRef = React.useRef<string | null>(null);
  const [insertBeforeIndex, setInsertBeforeIndex] = React.useState<number | null>(null);
  const insertBeforeIndexRef = React.useRef<number | null>(null);
  const lastInsertPointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const insertRafRef = React.useRef<number | null>(null);
  const pendingInsertRef = React.useRef<{
    pointer: { x: number; y: number };
    active: string;
  } | null>(null);
  const itemSizesRef = React.useRef<Record<string, OverlaySize>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overlaySize, setOverlaySize] = React.useState<OverlaySize | null>(null);

  const draggingId = activeIdRef.current ?? activeId;
  const activeRelation = draggingId ? sortedRelations.find(r => r.id === draggingId) : null;
  const useInsertGapDnD = sortedRelations.length > 1;
  const useLayoutAnimateWhileDragging = useInsertGapDnD && draggingId != null;
  const activeIndex = draggingId ? sortedRelations.findIndex(r => r.id === draggingId) : -1;

  const sortingStrategy: SortingStrategy = useInsertGapDnD
    ? inlineWrappedSortingStrategy
    : horizontalListSortingStrategy;

  const registerChipNode = React.useCallback((relationId: string, node: HTMLDivElement | null) => {
    if (node) {
      chipNodesRef.current.set(relationId, node);
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) {
        itemSizesRef.current[relationId] = {
          width: Math.round(width),
          height: Math.round(height),
        };
      }
    } else {
      chipNodesRef.current.delete(relationId);
    }
  }, []);

  const flushInsertUpdate = React.useCallback(() => {
    insertRafRef.current = null;
    const pending = pendingInsertRef.current;
    pendingInsertRef.current = null;
    if (!pending || !useInsertGapDnD) return;

    let rectById = collectRects(chipNodesRef.current, pending.active);
    if (rectById.size === 0) {
      measureChipNodes(chipNodesRef.current, itemSizesRef.current);
      rectById = collectRects(chipNodesRef.current, pending.active);
    }

    const result = resolveInsertBeforeFromPointer({
      pointer: pending.pointer,
      activeId: pending.active,
      relations: sortedRelations,
      chipNodes: chipNodesRef.current,
      listLayoutEl: listLayoutRef.current,
      currentInsertBefore: insertBeforeIndexRef.current,
      lastPointer: lastInsertPointerRef.current,
    });
    if (!result) return;

    insertBeforeIndexRef.current = result.insertBefore;
    lastInsertPointerRef.current = result.pointer;
    setInsertBeforeIndex(result.insertBefore);
  }, [sortedRelations, useInsertGapDnD]);

  const scheduleInsertUpdate = React.useCallback(
    (pointer: { x: number; y: number } | null, active: string) => {
      if (!pointer || !useInsertGapDnD) return;
      pendingInsertRef.current = { pointer, active };
      if (insertRafRef.current != null) return;
      insertRafRef.current = requestAnimationFrame(flushInsertUpdate);
    },
    [flushInsertUpdate, useInsertGapDnD]
  );

  const handleDragMove = (event: DragMoveEvent) => {
    if (!useInsertGapDnD) return;
    scheduleInsertUpdate(pointerFromDragEvent(event), String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!useInsertGapDnD) return;
    scheduleInsertUpdate(pointerFromDragEvent(event), String(event.active.id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    activeIdRef.current = id;
    setActiveId(id);

    measureChipNodes(chipNodesRef.current, itemSizesRef.current);
    const nextOverlaySize = resolveOverlaySize(
      id,
      itemSizesRef.current,
      chipNodesRef.current,
      event.active.rect.current.initial
    );
    setOverlaySize(nextOverlaySize);

    const pointer = pointerFromDragEvent(event);
    if (pointer) {
      const result = resolveInsertBeforeFromPointer({
        pointer,
        activeId: id,
        relations: sortedRelations,
        chipNodes: chipNodesRef.current,
        listLayoutEl: listLayoutRef.current,
        currentInsertBefore: null,
        lastPointer: null,
        requirePointerMove: false,
        requireInsideList: false,
      });
      if (result) {
        insertBeforeIndexRef.current = result.insertBefore;
        lastInsertPointerRef.current = result.pointer;
        setInsertBeforeIndex(result.insertBefore);
      }
    }
  };

  const clearDragState = () => {
    activeIdRef.current = null;
    insertBeforeIndexRef.current = null;
    lastInsertPointerRef.current = null;
    pendingInsertRef.current = null;
    if (insertRafRef.current != null) {
      cancelAnimationFrame(insertRafRef.current);
      insertRafRef.current = null;
    }
    setActiveId(null);
    setOverlaySize(null);
    setInsertBeforeIndex(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    const oldIndex = sortedRelations.findIndex(r => r.id === String(active.id));
    if (oldIndex < 0) {
      clearDragState();
      return;
    }

    let newIndex = oldIndex;

    if (useInsertGapDnD) {
      const pointer = pointerFromDragEvent(event);
      const resolved =
        pointer &&
        resolveInsertBeforeFromPointer({
          pointer,
          activeId: String(active.id),
          relations: sortedRelations,
          chipNodes: chipNodesRef.current,
          listLayoutEl: listLayoutRef.current,
          currentInsertBefore: insertBeforeIndexRef.current,
          lastPointer: lastInsertPointerRef.current,
          requirePointerMove: false,
          requireInsideList: false,
        });
      const insertBefore = resolved?.insertBefore ?? insertBeforeIndexRef.current;
      if (insertBefore == null) {
        clearDragState();
        return;
      }
      newIndex = insertBeforeToMoveIndex(insertBefore, oldIndex);
    } else {
      const { over } = event;
      if (!over || String(active.id) === String(over.id)) {
        clearDragState();
        return;
      }
      newIndex = sortedRelations.findIndex(r => r.id === String(over.id));
    }

    if (newIndex >= 0 && newIndex !== oldIndex) {
      const newList = arrayMove(sortedRelations, oldIndex, newIndex);
      newList.forEach((relation, index) => {
        onUpdateRelation(relation, sortedRelations[index].position ?? null);
      });
    }

    clearDragState();
  };

  const gapSize = overlaySize ?? (draggingId ? itemSizesRef.current[draggingId] : null);

  React.useLayoutEffect(() => {
    chipNodesRef.current.forEach((node, relationId) => {
      registerChipNode(relationId, node as HTMLDivElement);
    });
  }, [relationListKey, registerChipNode]);

  if (sortedRelations.length <= 1) {
    return (
      <>
        {sortedRelations.map(relation => (
          <StaticRelationChip key={`relation-${relation.id}`} relation={relation} spaceId={spaceId} layoutMode={layoutMode} />
        ))}
        {afterChips}
      </>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={useInsertGapDnD ? inlineWrappedCollisionDetection : closestCenter}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDragState}
    >
      <SortableContext items={sortedRelations.map(r => r.id)} strategy={sortingStrategy}>
        <RelationChipsSortableList
          sortedRelations={sortedRelations}
          spaceId={spaceId}
          layoutMode={layoutMode}
          afterChips={afterChips}
          listLayoutRef={listLayoutRef}
          activeId={draggingId}
          insertBeforeIndex={insertBeforeIndex}
          gapSize={gapSize}
          useInsertGapDnD={useInsertGapDnD}
          useLayoutAnimateWhileDragging={useLayoutAnimateWhileDragging}
          registerChipNode={registerChipNode}
        />
      </SortableContext>

      <DragOverlay
        dropAnimation={null}
        zIndex={10002}
        modifiers={useInsertGapDnD ? [snapCenterToCursor] : undefined}
      >
        {draggingId && activeRelation ? (
          <RelationChipDragOverlay relation={activeRelation} spaceId={spaceId} size={overlaySize} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function RelationChipDragOverlay({
  relation,
  spaceId,
  size,
}: {
  relation: Relation;
  spaceId: string;
  size: OverlaySize | null;
}) {
  const label = relationLabel(relation);

  return (
    <motion.div
      className="pointer-events-none cursor-grabbing overflow-hidden"
      style={
        size
          ? {
              width: size.width,
              height: size.height,
              maxWidth: size.width,
              maxHeight: size.height,
              boxSizing: 'border-box',
            }
          : { maxWidth: 320, overflow: 'hidden' }
      }
    >
      <LinkableRelationChip
        isEditing={false}
        small
        disableLink
        truncateLabel
        className="h-full w-full max-w-full min-w-0 overflow-hidden shadow-lg"
        currentSpaceId={spaceId}
        entityId={relation.toEntity.id}
        relationId={relation.id}
        relationEntityId={relation.entityId}
        spaceId={relation.toSpaceId}
        verified={relation.verified}
      >
        {label}
      </LinkableRelationChip>
    </motion.div>
  );
}

function RelationChip({
  relation,
  spaceId,
  layoutMode,
}: {
  relation: Relation;
  spaceId: string;
  layoutMode: LayoutMode;
}) {
  const { storage } = useMutate();
  const label = relationLabel(relation);

  return (
    <LinkableRelationChip
      isEditing
      small
      truncateLabel={shouldTruncateLabel(label, layoutMode)}
      className="max-w-full min-w-0"
      onDelete={() => storage.relations.delete(relation)}
      onDone={result => {
        storage.relations.update(relation, draft => {
          draft.toSpaceId = result.space;
          draft.verified = result.verified;
        });
      }}
      currentSpaceId={spaceId}
      entityId={relation.toEntity.id}
      relationId={relation.id}
      relationEntityId={relation.entityId}
      spaceId={relation.toSpaceId}
      verified={relation.verified}
    >
      {label}
    </LinkableRelationChip>
  );
}

function StaticRelationChip({
  relation,
  spaceId,
  layoutMode,
}: {
  relation: Relation;
  spaceId: string;
  layoutMode: LayoutMode;
}) {
  return (
    <motion.div className="inline-block max-w-full min-w-0">
      <RelationChip relation={relation} spaceId={spaceId} layoutMode={layoutMode} />
    </motion.div>
  );
}

interface SortableRelationChipProps {
  relation: Relation;
  spaceId: string;
  layoutMode: LayoutMode;
  collapseInPlaceWhenDragging: boolean;
  isListDragging: boolean;
  onMeasureSize: (node: HTMLDivElement | null) => void;
}

function SortableRelationChip({
  relation,
  spaceId,
  layoutMode,
  collapseInPlaceWhenDragging,
  isListDragging,
  onMeasureSize,
}: SortableRelationChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: relation.id,
  });

  const collapseInPlace = collapseInPlaceWhenDragging && isDragging;

  const style: React.CSSProperties = {
    position: 'relative',
    transition: collapseInPlaceWhenDragging && isDragging ? 'none' : transition,
    ...(collapseInPlace
      ? {
          width: 0,
          minWidth: 0,
          maxWidth: 0,
          height: 0,
          minHeight: 0,
          maxHeight: 0,
          overflow: 'hidden',
          opacity: 0,
          margin: 0,
          padding: 0,
          borderWidth: 0,
          pointerEvents: 'none',
          transform: 'none',
          zIndex: 0,
        }
      : {
          transform: CSS.Translate.toString(transform),
          opacity: isDragging ? 0 : 1,
          zIndex: isDragging ? 1 : isListDragging ? 0 : undefined,
        }),
  };

  const [justDragged, setJustDragged] = React.useState(false);

  React.useEffect(() => {
    if (isDragging) {
      setJustDragged(true);
    } else if (justDragged) {
      const timeout = setTimeout(() => setJustDragged(false), 200);
      return () => clearTimeout(timeout);
    }
  }, [isDragging, justDragged]);

  const handleClick = (e: React.MouseEvent) => {
    if (justDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const setMeasuredNodeRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      onMeasureSize(node);
    },
    [onMeasureSize, setNodeRef]
  );

  const shellClassName = [
    'relative inline-block max-w-full min-w-0',
    isListDragging && !collapseInPlace ? CHIP_REFLOW_TRANSITION_CLASS : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClassName =
    'inline-flex max-w-full min-w-0 cursor-grab items-center active:cursor-grabbing';

  return (
    <SortableRelationChipShell
      ref={setMeasuredNodeRef}
      style={style}
      className={shellClassName}
      onClick={handleClick}
      onClickCapture={handleClick}
      dragHandleProps={{ ...attributes, ...listeners }}
      dragHandleClassName={handleClassName}
    >
      <RelationChip relation={relation} spaceId={spaceId} layoutMode={layoutMode} />
    </SortableRelationChipShell>
  );
}

function SortableRelationChipShell({
  ref,
  style,
  className,
  onClick,
  onClickCapture,
  dragHandleProps,
  dragHandleClassName,
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  style: React.CSSProperties;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  onClickCapture?: (e: React.MouseEvent) => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
  dragHandleClassName: string;
  children: React.ReactNode;
}) {
  const handle = (
    <div {...dragHandleProps} className={dragHandleClassName}>
      {children}
    </div>
  );

  return (
    <div ref={ref} style={style} className={className} onClick={onClick} onClickCapture={onClickCapture}>
      {handle}
    </div>
  );
}
