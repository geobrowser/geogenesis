import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
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

import React from 'react';

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

export default function ReorderableRelationChipsDnd({
  relations,
  onUpdateRelation,
  spaceId,
}: {
  relations: Relation[];
  onUpdateRelation: (relation: Relation, newPosition: string | null) => void;
  spaceId: string;
}) {
  const sortedRelations = sortRelations(relations);
  const layoutMode = resolveLayoutMode(sortedRelations);
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

  const sortingStrategy: SortingStrategy =
    layoutMode === 'vertical' ? verticalListSortingStrategy : horizontalListSortingStrategy;

  const measureItemSize = React.useCallback((relationId: string, node: HTMLDivElement | null) => {
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    if (width > 0 && height > 0) {
      itemSizesRef.current[relationId] = {
        width: Math.round(width),
        height: Math.round(height),
      };
    }
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);

    const measured = itemSizesRef.current[id];
    if (measured) {
      setOverlaySize(measured);
      return;
    }

    const rect = event.active.rect.current.initial;
    if (rect && rect.width > 0 && rect.height > 0) {
      setOverlaySize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    } else {
      setOverlaySize(null);
    }
  };

  const clearDragState = () => {
    setActiveId(null);
    setOverlaySize(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || String(active.id) === String(over.id)) {
      clearDragState();
      return;
    }

    const oldIndex = sortedRelations.findIndex(r => r.id === String(active.id));
    const newIndex = sortedRelations.findIndex(r => r.id === String(over.id));

    if (oldIndex >= 0 && newIndex >= 0) {
      const newList = arrayMove(sortedRelations, oldIndex, newIndex);
      newList.forEach((relation, index) => {
        onUpdateRelation(relation, sortedRelations[index].position ?? null);
      });
    }

    clearDragState();
  };

  const sortableItems = sortedRelations.map(relation => (
    <SortableRelationChip
      key={relation.id}
      relation={relation}
      spaceId={spaceId}
      layoutMode={layoutMode}
      onMeasureSize={node => measureItemSize(relation.id, node)}
    />
  ));

  if (sortedRelations.length <= 1) {
    return (
      <>
        {sortedRelations.map(relation => (
          <StaticRelationChip key={`relation-${relation.id}`} relation={relation} spaceId={spaceId} layoutMode={layoutMode} />
        ))}
      </>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDragState}
    >
      <SortableContext items={sortedRelations.map(r => r.id)} strategy={sortingStrategy}>
        {layoutMode === 'vertical' ? (
          <div className="flex w-full flex-col gap-1">{sortableItems}</div>
        ) : (
          sortableItems
        )}
      </SortableContext>

      <DragOverlay dropAnimation={null}>
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
  onMeasureSize: (node: HTMLDivElement | null) => void;
}

function SortableRelationChip({ relation, spaceId, layoutMode, onMeasureSize }: SortableRelationChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: relation.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
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
  return (
    <div ref={ref} style={style} className={className} onClick={onClick} onClickCapture={onClickCapture}>
      <div {...dragHandleProps} className={dragHandleClassName}>
        {children}
      </div>
    </div>
  );
}
