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
  rectIntersection,
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { SortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LayoutGroup, motion } from 'framer-motion';

import React from 'react';

const wrappedLayoutTransition = { type: 'spring' as const, stiffness: 500, damping: 38 };

import { useMutate } from '~/core/sync/use-mutate';
import { Relation } from '~/core/types';
import { sortRelations } from '~/core/utils/utils';

import { LinkableRelationChip } from './chip';

type OverlaySize = { width: number; height: number };
type LayoutMode = 'vertical' | 'inline';

function relationLabel(relation: Relation) {
  return relation.toEntity.name ?? relation.toEntity.id;
}

function shouldTruncateLabel(label: string, layoutMode: LayoutMode) {
  if (layoutMode === 'inline') return true;
  return label.length < 42;
}

function resolveLayoutMode(relations: Relation[]): LayoutMode {
  if (relations.length <= 1) return 'inline';
  return relations.some(relation => !shouldTruncateLabel(relationLabel(relation), 'vertical')) ? 'vertical' : 'inline';
}

function measureWrapsMultipleRows(container: HTMLElement | null): boolean {
  if (!container) return false;
  const children = Array.from(container.children) as HTMLElement[];
  if (children.length <= 1) return false;
  const tops = children.map(ch => Math.round(ch.getBoundingClientRect().top));
  return new Set(tops).size > 1;
}

const inlineWrappedSortingStrategy: SortingStrategy = () => ({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
});

const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent || !('clientX' in activatorEvent)) {
    return transform;
  }
  const x = activatorEvent.clientX as number;
  const y = activatorEvent.clientY as number;
  return {
    ...transform,
    x: transform.x + x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + y - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};

const inlineWrappedCollisionDetection: CollisionDetection = args => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) return rectCollisions;
  return closestCorners(args);
};

type DragPointerEvent = {
  activatorEvent: Event | null;
  delta?: { x: number; y: number };
  active: { rect: { current: { translated: ClientRect | null; initial: ClientRect | null } } };
};

function pointerFromDragEvent(event: DragPointerEvent): { x: number; y: number } | null {
  const activator = event.activatorEvent;
  if (activator && 'clientX' in activator && typeof activator.clientX === 'number') {
    const deltaX = event.delta?.x ?? 0;
    const deltaY = event.delta?.y ?? 0;
    return {
      x: activator.clientX + deltaX,
      y: activator.clientY + deltaY,
    };
  }

  const translated = event.active.rect.current.translated;
  if (translated && translated.width > 0 && translated.height > 0) {
    return { x: translated.left + translated.width / 2, y: translated.top + translated.height / 2 };
  }

  const initial = event.active.rect.current.initial;
  if (initial && initial.width > 0 && initial.height > 0) {
    return { x: initial.left + initial.width / 2, y: initial.top + initial.height / 2 };
  }

  return null;
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

/** Reading order: row (top→bottom), then column (left→right) — matches wrapped flex. */
function computeInsertBeforeIndex(
  pointer: { x: number; y: number },
  relations: Relation[],
  rectById: Map<string, ClientRect>,
  activeId: string
): number {
  for (let i = 0; i < relations.length; i++) {
    const relation = relations[i];
    if (relation.id === activeId) continue;

    const rect = rectById.get(relation.id);
    if (!rect) continue;

    const rowTolerance = Math.max(rect.height * 0.45, 6);
    const midX = rect.left + rect.width / 2;

    if (pointer.y < rect.top - rowTolerance) {
      return i;
    }

    if (pointer.y <= rect.bottom + rowTolerance) {
      if (pointer.x < midX) {
        return i;
      }
    }
  }

  return relations.length;
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

function DragInsertGap({ width, height, animateLayout }: { width: number; height: number; animateLayout: boolean }) {
  const style = { width, height, minHeight: height, flex: 'none' as const, boxSizing: 'border-box' as const };

  if (!animateLayout) {
    return <div className="shrink-0 self-start" style={style} aria-hidden />;
  }

  return (
    <motion.div
      layout="position"
      transition={wrappedLayoutTransition}
      className="shrink-0 self-start"
      style={style}
      aria-hidden
    />
  );
}

export default function ReorderableRelationChipsDnd({
  relations,
  onUpdateRelation,
  spaceId,
  afterChips,
}: {
  relations: Relation[];
  onUpdateRelation: (relation: Relation, newPosition: string | null) => void;
  spaceId: string;
  afterChips?: React.ReactNode;
}) {
  const sortedRelations = sortRelations(relations);
  const layoutMode = resolveLayoutMode(sortedRelations);
  const listLayoutRef = React.useRef<HTMLDivElement>(null);
  const chipNodesRef = React.useRef<Map<string, HTMLElement>>(new Map());
  const activeIdRef = React.useRef<string | null>(null);
  const [inlineWrapsMultipleRows, setInlineWrapsMultipleRows] = React.useState(false);
  const [insertBeforeIndex, setInsertBeforeIndex] = React.useState<number | null>(null);
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

  const activeRelation = activeId ? sortedRelations.find(r => r.id === activeId) : null;
  const useWrappedInlineDnD =
    layoutMode === 'inline' &&
    (inlineWrapsMultipleRows ||
      (activeId != null && measureWrapsMultipleRows(listLayoutRef.current)));
  const wrappedLayoutAnimate = useWrappedInlineDnD && activeId != null;
  const activeIndex = activeId ? sortedRelations.findIndex(r => r.id === activeId) : -1;

  const sortingStrategy: SortingStrategy =
    layoutMode === 'vertical'
      ? verticalListSortingStrategy
      : useWrappedInlineDnD
        ? inlineWrappedSortingStrategy
        : horizontalListSortingStrategy;

  const relationListKey = sortedRelations.map(r => r.id).join('\0');

  React.useLayoutEffect(() => {
    if (sortedRelations.length <= 1 || layoutMode !== 'inline') {
      setInlineWrapsMultipleRows(false);
      return;
    }
    if (activeIdRef.current) return;
    setInlineWrapsMultipleRows(measureWrapsMultipleRows(listLayoutRef.current));
  }, [relationListKey, sortedRelations.length, layoutMode, activeId]);

  React.useEffect(() => {
    if (layoutMode !== 'inline') return;
    const el = listLayoutRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (activeIdRef.current) return;
        setInlineWrapsMultipleRows(measureWrapsMultipleRows(listLayoutRef.current));
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [relationListKey, layoutMode]);

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

  const updateInsertIndexFromPointer = React.useCallback(
    (pointer: { x: number; y: number } | null, active: string, forceWrapped = false) => {
      if (!pointer || (!useWrappedInlineDnD && !forceWrapped)) return;
      const rectById = collectRects(chipNodesRef.current, active);
      const insertBefore = computeInsertBeforeIndex(pointer, sortedRelations, rectById, active);
      setInsertBeforeIndex(insertBefore);
    },
    [sortedRelations, useWrappedInlineDnD]
  );

  const handleDragMove = (event: DragMoveEvent) => {
    if (!useWrappedInlineDnD) return;
    updateInsertIndexFromPointer(pointerFromDragEvent(event), String(event.active.id), true);
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!useWrappedInlineDnD) return;
    updateInsertIndexFromPointer(pointerFromDragEvent(event), String(event.active.id), true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    activeIdRef.current = id;
    setActiveId(id);

    const measured = itemSizesRef.current[id];
    if (measured) {
      setOverlaySize(measured);
    } else {
      const rect = event.active.rect.current.initial;
      if (rect && rect.width > 0 && rect.height > 0) {
        setOverlaySize({ width: Math.round(rect.width), height: Math.round(rect.height) });
      } else {
        setOverlaySize(null);
      }
    }

    if (layoutMode === 'inline' && measureWrapsMultipleRows(listLayoutRef.current)) {
      setInlineWrapsMultipleRows(true);
      updateInsertIndexFromPointer(pointerFromDragEvent(event), id, true);
    }
  };

  const clearDragState = () => {
    activeIdRef.current = null;
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

    if (useWrappedInlineDnD) {
      const pointer = pointerFromDragEvent(event);
      const rectById = collectRects(chipNodesRef.current, String(active.id));
      const insertBefore =
        insertBeforeIndex ??
        (pointer ? computeInsertBeforeIndex(pointer, sortedRelations, rectById, String(active.id)) : oldIndex);
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

  const gapSize = overlaySize ?? (activeId ? itemSizesRef.current[activeId] : null);

  const sortableItems = sortedRelations.map((relation, index) => {
    const showGap =
      useWrappedInlineDnD &&
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
        layoutAnimate={wrappedLayoutAnimate}
        collapseInPlaceWhenDragging={useWrappedInlineDnD}
        onMeasureSize={node => registerChipNode(relation.id, node)}
      />
    );

    if (layoutMode === 'vertical') {
      return React.cloneElement(chip, { key: relation.id });
    }

    return (
      <React.Fragment key={relation.id}>
        {showGap ? (
          <DragInsertGap
            width={gapSize.width}
            height={gapSize.height}
            animateLayout={wrappedLayoutAnimate}
          />
        ) : null}
        {chip}
      </React.Fragment>
    );
  });

  const showTrailingGap =
    useWrappedInlineDnD &&
    activeId &&
    insertBeforeIndex === sortedRelations.length &&
    gapSize;

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
      collisionDetection={layoutMode === 'vertical' ? closestCenter : inlineWrappedCollisionDetection}
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
        {layoutMode === 'vertical' ? (
          <div className="flex w-full flex-col gap-1">
            {sortableItems}
            {afterChips}
          </div>
        ) : wrappedLayoutAnimate ? (
          <LayoutGroup>
            <motion.div
              ref={listLayoutRef}
              className="relative flex w-full min-w-0 flex-row flex-wrap content-start justify-start items-start gap-1"
            >
              {sortableItems}
              {showTrailingGap ? (
                <DragInsertGap width={gapSize!.width} height={gapSize!.height} animateLayout />
              ) : null}
              {afterChips}
            </motion.div>
          </LayoutGroup>
        ) : (
          <div
            ref={listLayoutRef}
            className="relative flex w-full min-w-0 flex-row flex-wrap content-start justify-start items-start gap-1"
          >
            {sortableItems}
            {showTrailingGap ? (
              <DragInsertGap width={gapSize!.width} height={gapSize!.height} animateLayout={false} />
            ) : null}
            {afterChips}
          </div>
        )}
      </SortableContext>

      <DragOverlay dropAnimation={null} modifiers={useWrappedInlineDnD ? [snapCenterToCursor] : undefined}>
        {activeId && activeRelation ? (
          <RelationChipDragOverlay
            relation={activeRelation}
            spaceId={spaceId}
            size={overlaySize}
            layoutMode={layoutMode}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function RelationChipDragOverlay({
  relation,
  spaceId,
  size,
  layoutMode,
}: {
  relation: Relation;
  spaceId: string;
  size: OverlaySize | null;
  layoutMode: LayoutMode;
}) {
  const label = relationLabel(relation);
  const truncateLabel = shouldTruncateLabel(label, layoutMode);

  return (
    <div
      className={layoutMode === 'vertical' ? 'pointer-events-none block w-full cursor-grabbing' : 'pointer-events-none inline-block max-w-full cursor-grabbing'}
      style={
        size
          ? { width: size.width, minHeight: size.height, maxWidth: layoutMode === 'inline' ? size.width : undefined }
          : layoutMode === 'inline'
            ? { maxWidth: 320 }
            : undefined
      }
    >
      <LinkableRelationChip
        isEditing={false}
        small
        disableLink
        truncateLabel={truncateLabel}
        className={layoutMode === 'vertical' ? 'w-full shadow-lg' : 'shadow-lg'}
        currentSpaceId={spaceId}
        entityId={relation.toEntity.id}
        relationId={relation.id}
        relationEntityId={relation.entityId}
        spaceId={relation.toSpaceId}
        verified={relation.verified}
      >
        {label}
      </LinkableRelationChip>
    </div>
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
      className={layoutMode === 'vertical' ? 'w-full' : undefined}
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
    <div className={layoutMode === 'vertical' ? 'block w-full min-w-0 max-w-full' : 'inline-block max-w-full min-w-0'}>
      <RelationChip relation={relation} spaceId={spaceId} layoutMode={layoutMode} />
    </div>
  );
}

interface SortableRelationChipProps {
  relation: Relation;
  spaceId: string;
  layoutMode: LayoutMode;
  layoutAnimate: boolean;
  collapseInPlaceWhenDragging: boolean;
  onMeasureSize: (node: HTMLDivElement | null) => void;
}

function SortableRelationChip({
  relation,
  spaceId,
  layoutMode,
  layoutAnimate,
  collapseInPlaceWhenDragging,
  onMeasureSize,
}: SortableRelationChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: relation.id,
  });

  const collapseInPlace = collapseInPlaceWhenDragging && isDragging;
  const shouldLayoutAnimate = layoutAnimate && !collapseInPlace;

  const style: React.CSSProperties = {
    transition: collapseInPlaceWhenDragging && isDragging ? 'none' : transition,
    ...(collapseInPlace
      ? {
          width: 0,
          minWidth: 0,
          maxWidth: 0,
          overflow: 'hidden',
          opacity: 0,
          margin: 0,
          padding: 0,
          borderWidth: 0,
          pointerEvents: 'none',
          transform: 'none',
        }
      : {
          transform: CSS.Translate.toString(transform),
          opacity: isDragging ? 0 : 1,
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

  const shellClassName =
    layoutMode === 'vertical' ? 'relative block w-full min-w-0' : 'relative inline-block max-w-full min-w-0';

  const handleClassName =
    layoutMode === 'vertical'
      ? 'flex w-full min-w-0 cursor-grab items-stretch active:cursor-grabbing'
      : 'inline-flex max-w-full min-w-0 cursor-grab items-center active:cursor-grabbing';

  return (
    <SortableRelationChipShell
      ref={setMeasuredNodeRef}
      style={style}
      className={shellClassName}
      layoutAnimate={shouldLayoutAnimate}
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
  layoutAnimate,
  onClick,
  onClickCapture,
  dragHandleProps,
  dragHandleClassName,
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  style: React.CSSProperties;
  className?: string;
  layoutAnimate: boolean;
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

  if (layoutAnimate) {
    return (
      <motion.div
        ref={ref}
        layout="position"
        transition={wrappedLayoutTransition}
        style={style}
        className={className}
        onClick={onClick}
        onClickCapture={onClickCapture}
      >
        {handle}
      </motion.div>
    );
  }

  return (
    <div ref={ref} style={style} className={className} onClick={onClick} onClickCapture={onClickCapture}>
      {handle}
    </div>
  );
}
