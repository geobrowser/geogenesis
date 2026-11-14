'use client';

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import * as React from 'react';

import cx from 'classnames';

const POINTER_ACTIVATION = { distance: 8 };
const TOUCH_ACTIVATION = { delay: 250, tolerance: 6 };

type DragOverlaySnapshot = {
  entityId: string;
  index: number;
  imageUrl?: string;
};

function readRowImageValue(rowEl: Element | null): string | undefined {
  if (!rowEl) return undefined;
  const avatarEl = rowEl.querySelector('[data-ranking-image-value]');
  const value = avatarEl?.getAttribute('data-ranking-image-value');
  return value || undefined;
}

/** A labelled group of the list (Best debates' tiers, GEO-3729), drawn under its own header. */
export type RankingDndGroup = { key: string; header: React.ReactNode; entityIds: string[] };

const GROUP_HEADER_PREFIX = '__ranking-group:';
const groupHeaderId = (key: string) => `${GROUP_HEADER_PREFIX}${key}`;

/**
 * The groups after a drag of the flat list (headers included): each entry belongs to the header
 * above it, and an entry dragged above the first header joins the first group.
 */
export function regroupAfterDrag(
  flat: readonly string[],
  groups: ReadonlyArray<Pick<RankingDndGroup, 'key'>>
): Array<{ key: string; entityIds: string[] }> {
  const next = groups.map(group => ({ key: group.key, entityIds: [] as string[] }));
  if (next.length === 0) return next;
  const byHeader = new Map(next.map(group => [groupHeaderId(group.key), group]));
  let current = next[0];
  for (const id of flat) {
    const header = byHeader.get(id);
    if (header) current = header;
    else current.entityIds.push(id);
  }
  return next;
}

function flattenGroups(groups: readonly RankingDndGroup[]): string[] {
  return groups.flatMap(group => [groupHeaderId(group.key), ...group.entityIds]);
}

type Props = {
  entityIds: string[];
  onReorder: (entityIds: string[]) => void;
  /**
   * Draws the list in groups, each under its header (opt in). A drag can then move an entry into
   * another group: `onRegroup` gets every group's entries, and `onReorder` isn't called. Headers
   * never move. `entityIds` must be the groups' entries in order.
   */
  groups?: RankingDndGroup[];
  onRegroup?: (groups: Array<{ key: string; entityIds: string[] }>) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  className?: string;
  disabled?: boolean;
  renderItem: (entityId: string, index: number, isDragActive?: boolean, overlayImageUrl?: string) => React.ReactNode;
  renderTrailing?: (entityId: string, index: number, isDragActive?: boolean) => React.ReactNode;
};

function RankingMyRankingSortableItem({
  id,
  children,
  trailing,
}: {
  id: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const [justDragged, setJustDragged] = React.useState(false);

  React.useEffect(() => {
    if (isDragging) {
      setJustDragged(true);
    } else if (justDragged) {
      const timeout = setTimeout(() => setJustDragged(false), 200);
      return () => clearTimeout(timeout);
    }
  }, [isDragging, justDragged]);

  const suppressClickAfterDrag = (event: React.MouseEvent) => {
    if (justDragged) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { pointerEvents: 'none' } : {}),
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div
        data-ranking-sortable-id={id}
        className={cx('flex w-full min-w-0 items-center gap-4', isDragging && 'invisible')}
        aria-hidden={isDragging}
      >
        <div
          className="min-w-0 flex-1 cursor-grab touch-manipulation active:cursor-grabbing"
          data-ranking-drag-activator
          {...attributes}
          {...listeners}
          onClick={suppressClickAfterDrag}
          onClickCapture={suppressClickAfterDrag}
          onMouseDown={event => event.stopPropagation()}
        >
          {children}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </div>
  );
}

/**
 * A header never moves, but stays a place to drop: a plain `disabled: true` would also take it out
 * of the drop targets, so an empty group could never be reached and a debate at a group's edge
 * would need two drags to cross into the next.
 */
export const HEADER_DISABLED = { draggable: true, droppable: false } as const;

/** A group header: a fixed slot in the sortable list that entries move around, never dragged. */
function RankingSortableGroupHeader({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, transform, transition } = useSortable({ id, disabled: HEADER_DISABLED });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}>
      {children}
    </div>
  );
}

export function RankingMyRankingDndList({
  entityIds,
  onReorder,
  groups,
  onRegroup,
  onDragStart,
  onDragEnd,
  className,
  disabled = false,
  renderItem,
  renderTrailing,
}: Props) {
  const [activeDragOrder, setActiveDragOrder] = React.useState<string[] | null>(null);
  const onReorderRef = React.useRef(onReorder);
  const renderItemRef = React.useRef(renderItem);
  const entityIdsRef = React.useRef(entityIds);

  const onRegroupRef = React.useRef(onRegroup);
  onReorderRef.current = onReorder;
  onRegroupRef.current = onRegroup;
  renderItemRef.current = renderItem;
  entityIdsRef.current = entityIds;
  const grouped = Boolean(groups && onRegroup);
  const groupsRef = React.useRef(groups);
  groupsRef.current = groups;
  const headers = React.useMemo(
    () => new Map((groups ?? []).map(group => [groupHeaderId(group.key), group.header])),
    [groups]
  );
  const flatIds = React.useMemo(
    () => (groups && onRegroup ? flattenGroups(groups) : entityIds),
    [groups, onRegroup, entityIds]
  );
  const flatIdsRef = React.useRef(flatIds);
  flatIdsRef.current = flatIds;

  const items = activeDragOrder ?? flatIds;
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION })
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeWidth, setActiveWidth] = React.useState<number | null>(null);
  const [dragOverlaySnapshot, setDragOverlaySnapshot] = React.useState<DragOverlaySnapshot | null>(null);

  const finishDrag = React.useCallback(() => {
    setActiveDragOrder(null);
    setActiveId(null);
    setActiveWidth(null);
    setDragOverlaySnapshot(null);
    onDragEnd?.();
  }, [onDragEnd]);

  const handleDragStart = (event: DragStartEvent) => {
    const draggedId = event.active.id as string;
    const rowEl = document.querySelector(`[data-ranking-sortable-id="${draggedId}"]`);
    const imageUrl = readRowImageValue(rowEl);

    setActiveDragOrder([...flatIdsRef.current]);
    setActiveId(draggedId);
    setDragOverlaySnapshot({
      entityId: draggedId,
      index: entityIdsRef.current.indexOf(draggedId),
      imageUrl,
    });
    const initialRect = event.active.rect.current.initial;
    if (initialRect) {
      setActiveWidth(initialRect.width);
    }
    onDragStart?.();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    try {
      if (!over || active.id === over.id) return;

      const dragItems = itemsRef.current;
      const oldIndex = dragItems.indexOf(active.id as string);
      const newIndex = dragItems.indexOf(over.id as string);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

      const nextItems = arrayMove([...dragItems], oldIndex, newIndex);
      if (grouped && groupsRef.current && onRegroupRef.current) {
        onRegroupRef.current(regroupAfterDrag(nextItems, groupsRef.current));
        return;
      }
      onReorderRef.current(nextItems);
    } finally {
      finishDrag();
    }
  };

  const handleDragCancel = () => {
    finishDrag();
  };

  if (disabled || (!grouped && items.length < 2)) {
    return (
      <div className={className}>
        {items.map(entityId => {
          const header = headers.get(entityId);
          if (header !== undefined) return <React.Fragment key={entityId}>{header}</React.Fragment>;
          const index = entityIds.indexOf(entityId);
          const trailing = renderTrailing?.(entityId, index, false);
          return (
            <div key={entityId} className="flex w-full min-w-0 items-center gap-4">
              <div className="min-w-0 flex-1">{renderItem(entityId, index, false)}</div>
              {trailing ? <div className="shrink-0">{trailing}</div> : null}
            </div>
          );
        })}
      </div>
    );
  }

  // Ranks count entries only, never headers, and follow the order while dragging.
  const entryIndex = new Map(items.filter(id => !headers.has(id)).map((id, index) => [id, index]));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map(entityId => {
            const header = headers.get(entityId);
            if (header !== undefined) {
              return (
                <RankingSortableGroupHeader key={entityId} id={entityId}>
                  {header}
                </RankingSortableGroupHeader>
              );
            }
            const index = entryIndex.get(entityId) ?? -1;
            return (
              <RankingMyRankingSortableItem
                key={entityId}
                id={entityId}
                trailing={renderTrailing?.(entityId, index, activeId !== null)}
              >
                {renderItem(entityId, index, activeId !== null)}
              </RankingMyRankingSortableItem>
            );
          })}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {dragOverlaySnapshot && dragOverlaySnapshot.index >= 0 ? (
          <div
            className="cursor-grabbing rounded-lg bg-white shadow-lg ring-1 ring-grey-02"
            style={{ width: activeWidth ?? undefined }}
          >
            {renderItemRef.current(
              dragOverlaySnapshot.entityId,
              dragOverlaySnapshot.index,
              true,
              dragOverlaySnapshot.imageUrl
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
