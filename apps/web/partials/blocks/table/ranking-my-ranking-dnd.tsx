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

const POINTER_ACTIVATION = { distance: 8 };
const TOUCH_ACTIVATION = { delay: 250, tolerance: 6 };

type Props = {
  entityIds: string[];
  onReorder: (entityIds: string[]) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  className?: string;
  renderItem: (entityId: string, index: number) => React.ReactNode;
};

function RankingMyRankingSortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const innerRef = React.useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = React.useState<number | null>(null);
  const [justDragged, setJustDragged] = React.useState(false);

  React.useLayoutEffect(() => {
    if (isDragging || !innerRef.current) return;
    setRowHeight(innerRef.current.offsetHeight);
  });

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
    <div
      ref={setNodeRef}
      style={style}
      className="relative cursor-grab touch-manipulation active:cursor-grabbing"
      {...attributes}
      {...listeners}
      onClick={suppressClickAfterDrag}
      onClickCapture={suppressClickAfterDrag}
      onMouseDown={event => event.stopPropagation()}
    >
      {isDragging ? (
        <div className="w-full" style={{ height: rowHeight ?? 72 }} aria-hidden />
      ) : (
        <div ref={innerRef}>{children}</div>
      )}
    </div>
  );
}

export function RankingMyRankingDndList({
  entityIds,
  onReorder,
  onDragStart,
  onDragEnd,
  className,
  renderItem,
}: Props) {
  const [activeDragOrder, setActiveDragOrder] = React.useState<string[] | null>(null);
  const onReorderRef = React.useRef(onReorder);
  const renderItemRef = React.useRef(renderItem);
  const entityIdsRef = React.useRef(entityIds);

  onReorderRef.current = onReorder;
  renderItemRef.current = renderItem;
  entityIdsRef.current = entityIds;

  const items = activeDragOrder ?? entityIds;
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION })
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeWidth, setActiveWidth] = React.useState<number | null>(null);

  const finishDrag = React.useCallback(() => {
    setActiveDragOrder(null);
    setActiveId(null);
    setActiveWidth(null);
    onDragEnd?.();
  }, [onDragEnd]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragOrder([...entityIdsRef.current]);
    setActiveId(event.active.id as string);
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
      onReorderRef.current(nextItems);
    } finally {
      finishDrag();
    }
  };

  const handleDragCancel = () => {
    finishDrag();
  };

  if (items.length < 2) {
    return (
      <div className={className}>
        {items.map((entityId, index) => (
          <React.Fragment key={entityId}>{renderItem(entityId, index)}</React.Fragment>
        ))}
      </div>
    );
  }

  const activeIndex = activeId ? items.indexOf(activeId) : -1;

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
          {items.map((entityId, index) => (
            <RankingMyRankingSortableItem key={entityId} id={entityId}>
              {renderItem(entityId, index)}
            </RankingMyRankingSortableItem>
          ))}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeId && activeIndex >= 0 ? (
          <div
            className="cursor-grabbing rounded-lg bg-white shadow-lg ring-1 ring-grey-02"
            style={{ width: activeWidth ?? undefined }}
          >
            {renderItemRef.current(activeId, activeIndex)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
