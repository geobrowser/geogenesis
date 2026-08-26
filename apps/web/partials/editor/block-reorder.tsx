'use client';

import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { KeyboardCoordinateGetter } from '@dnd-kit/core';
import type { Editor } from '@tiptap/react';

import * as React from 'react';

import { OrderDots } from '~/design-system/icons/order-dots';

import { ensureUniqueNodeIds } from './id-extension';

type BlockLayout = {
  childIndex: number;
  top: number;
  bottom: number;
  center: number;
};

type DropZoneLayout = {
  boundary: number;
  top: number;
  height: number;
  indicatorTop: number;
};

const GUTTER_HOVER_WIDTH = 48;

type Props = {
  children: React.ReactNode;
  editor: Editor;
  editorWrapperRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onReorder: () => void;
};

/** Adds edit-mode drag controls around TipTap's top-level content blocks. */
export function BlockReorder({ children, editor, editorWrapperRef, enabled, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: blockKeyboardCoordinates,
    })
  );
  const [blockLayout, setBlockLayout] = React.useState<BlockLayout[]>([]);
  const blockLayoutRef = React.useRef<BlockLayout[]>([]);
  const [hoveredChildIndex, setHoveredChildIndex] = React.useState<number | null>(null);
  const hoveredChildIndexRef = React.useRef<number | null>(null);
  const [activeChildIndex, setActiveChildIndex] = React.useState<number | null>(null);
  const activeChildIndexRef = React.useRef<number | null>(null);
  const [activeBoundary, setActiveBoundary] = React.useState<number | null>(null);

  const updateHoveredChildIndex = React.useCallback((childIndex: number | null) => {
    hoveredChildIndexRef.current = childIndex;
    setHoveredChildIndex(childIndex);
  }, []);

  const updateActiveChildIndex = React.useCallback((childIndex: number | null) => {
    activeChildIndexRef.current = childIndex;
    setActiveChildIndex(childIndex);
  }, []);

  const measureBlocks = React.useCallback(() => {
    const wrapper = editorWrapperRef.current;
    const editorElement = wrapper?.querySelector<HTMLElement>('.ProseMirror');
    if (!wrapper || !editorElement) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const nextLayout = getTopLevelBlockElements(editor, editorElement).flatMap(({ childIndex, element }) => {
      if (!isDraggableBlock(element)) return [];
      const rect = element.getBoundingClientRect();
      const top = rect.top - wrapperRect.top;
      const bottom = rect.bottom - wrapperRect.top;

      return [{ childIndex, top, bottom, center: top + rect.height / 2 }];
    });

    const layoutChanged = !blockLayoutsEqual(blockLayoutRef.current, nextLayout);
    blockLayoutRef.current = nextLayout;
    if (layoutChanged) setBlockLayout(nextLayout);
  }, [editorWrapperRef]);

  React.useLayoutEffect(() => {
    if (!enabled) return;

    const wrapper = editorWrapperRef.current;
    const editorElement = wrapper?.querySelector<HTMLElement>('.ProseMirror');
    if (!wrapper || !editorElement) return;

    // Establish stable handle identities before rendering the controls. This
    // lets focus follow a block when keyboard reordering changes its child index.
    ensureUniqueNodeIds(editor);
    measureBlocks();

    const measurement = createBlockMeasureScheduler(measureBlocks);
    const resizeObserver = new ResizeObserver(measurement.schedule);
    resizeObserver.observe(editorElement);
    editor.on('transaction', measurement.schedule);

    const handlePointerMove = (event: PointerEvent) => {
      if (activeChildIndexRef.current !== null) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-block-drag-handle]')) return;

      const blockElement = target.closest<HTMLElement>('.ProseMirror > *');
      const hoveredContentIndex = getTopLevelBlockElements(editor, editorElement).find(
        block => block.element === blockElement && isDraggableBlock(block.element)
      )?.childIndex;
      const wrapperRect = wrapper.getBoundingClientRect();
      const editorRect = editorElement.getBoundingClientRect();
      const hoveredGutterIndex = getGutterHoveredChildIndex(
        blockLayoutRef.current,
        event.clientX - wrapperRect.left,
        event.clientY - wrapperRect.top,
        editorRect.left - wrapperRect.left
      );
      const childIndex = hoveredContentIndex ?? hoveredGutterIndex ?? null;

      if (childIndex === null) {
        updateHoveredChildIndex(null);
        return;
      }

      if (hoveredChildIndexRef.current === childIndex) return;

      measureBlocks();
      updateHoveredChildIndex(childIndex);
    };

    const handlePointerLeave = () => {
      if (activeChildIndexRef.current === null) updateHoveredChildIndex(null);
    };

    wrapper.addEventListener('pointermove', handlePointerMove);
    wrapper.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      resizeObserver.disconnect();
      editor.off('transaction', measurement.schedule);
      measurement.cancel();
      wrapper.removeEventListener('pointermove', handlePointerMove);
      wrapper.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [editor, editorWrapperRef, enabled, measureBlocks, updateHoveredChildIndex]);

  React.useEffect(() => {
    if (enabled) return;

    hoveredChildIndexRef.current = null;
    activeChildIndexRef.current = null;
    setHoveredChildIndex(null);
    setActiveChildIndex(null);
    setActiveBoundary(null);
  }, [enabled]);

  const editorRect = editorWrapperRef.current?.querySelector<HTMLElement>('.ProseMirror')?.getBoundingClientRect();
  const wrapperRect = editorWrapperRef.current?.getBoundingClientRect();
  const editorLeft = editorRect && wrapperRect ? editorRect.left - wrapperRect.left : 0;
  const editorWidth = editorRect?.width ?? 0;
  const visibleHandleIndex = activeChildIndex ?? hoveredChildIndex;
  const handleLayout = blockLayout.find(block => block.childIndex === visibleHandleIndex);
  const dropZones = makeDropZones(blockLayout);
  const indicatorTop = dropZones.find(zone => zone.boundary === activeBoundary)?.indicatorTop;

  const resetDragState = () => {
    updateActiveChildIndex(null);
    setActiveBoundary(null);
    updateHoveredChildIndex(null);
  };

  const handleDragCancel = () => resetDragState();

  const handleDragStart = (event: DragStartEvent) => {
    if (!enabled) return;

    const childIndex = event.active.data.current?.childIndex;
    if (typeof childIndex !== 'number') return;

    // Continuation nodes loaded from markdown intentionally start without IDs.
    // A drag can happen before blur, so assign/dedupe IDs before persisting it.
    ensureUniqueNodeIds(editor);
    measureBlocks();
    updateActiveChildIndex(childIndex);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const boundary = event.over?.data.current?.boundary;
    setActiveBoundary(typeof boundary === 'number' ? boundary : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const sourceIndex = event.active.data.current?.childIndex;
    const dropBoundary = event.over?.data.current?.boundary;

    if (
      typeof sourceIndex === 'number' &&
      typeof dropBoundary === 'number' &&
      moveTopLevelBlock(editor, sourceIndex, dropBoundary)
    ) {
      onReorder();
    }

    resetDragState();
  };

  return (
    <DndContext
      sensors={sensors}
      autoScroll
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      {children}

      {enabled && activeChildIndex === null && blockLayout.length > 0 ? (
        <BlockGutterHoverArea blocks={blockLayout} editorLeft={editorLeft} onClick={() => editor.commands.focus()} />
      ) : null}

      {enabled
        ? blockLayout.map(layout => (
            <BlockDragHandle
              key={getBlockDragHandleKey(editor, layout.childIndex)}
              childIndex={layout.childIndex}
              top={layout.top + Math.min(16, (layout.bottom - layout.top) / 2) - 12}
              left={editorLeft - 32}
              isDragging={activeChildIndex !== null}
              visible={layout === handleLayout && visibleHandleIndex !== null}
            />
          ))
        : null}

      {enabled && activeChildIndex !== null
        ? dropZones.map(zone => <BlockDropZone key={zone.boundary} zone={zone} left={editorLeft} width={editorWidth} />)
        : null}

      {enabled && activeChildIndex !== null && indicatorTop !== undefined ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-30 h-0.5 rounded-full bg-ctaPrimary"
          style={{ top: indicatorTop, left: editorLeft, width: editorWidth }}
        />
      ) : null}

      <DragOverlay dropAnimation={null}>
        {enabled && activeChildIndex !== null ? (
          <div className="flex size-6 cursor-grabbing items-center justify-center rounded border border-grey-02 bg-white shadow-lg">
            <OrderDots />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function blockLayoutsEqual(current: BlockLayout[], next: BlockLayout[]) {
  return (
    current.length === next.length &&
    current.every((block, index) => {
      const nextBlock = next[index];
      return (
        nextBlock !== undefined &&
        block.childIndex === nextBlock.childIndex &&
        block.top === nextBlock.top &&
        block.bottom === nextBlock.bottom &&
        block.center === nextBlock.center
      );
    })
  );
}

/** Coalesces editor transactions into one settled-layout measurement per frame. */
export function createBlockMeasureScheduler(
  onMeasure: () => void,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame
) {
  let pendingFrame: number | null = null;

  const schedule = () => {
    if (pendingFrame !== null) return;

    pendingFrame = requestFrame(() => {
      pendingFrame = null;
      onMeasure();
    });
  };

  const cancel = () => {
    if (pendingFrame === null) return;
    cancelFrame(pendingFrame);
    pendingFrame = null;
  };

  return { schedule, cancel };
}

function getBlockDragHandleKey(editor: Editor, childIndex: number) {
  if (childIndex < 0 || childIndex >= editor.state.doc.childCount) return `child-${childIndex}`;

  const blockId = editor.state.doc.child(childIndex).attrs.id;
  return typeof blockId === 'string' && blockId.length > 0 ? blockId : `child-${childIndex}`;
}

/** Maps document children through ProseMirror positions so DOM widgets cannot shift block indexes. */
export function getTopLevelBlockElements(editor: Editor, editorElement: HTMLElement) {
  const blocks: Array<{ childIndex: number; element: HTMLElement }> = [];
  let position = 0;

  for (let childIndex = 0; childIndex < editor.state.doc.childCount; childIndex += 1) {
    const element = editor.view.nodeDOM(position);
    if (element instanceof HTMLElement && element.parentElement === editorElement) {
      blocks.push({ childIndex, element });
    }
    position += editor.state.doc.child(childIndex).nodeSize;
  }

  return blocks;
}

export function BlockGutterHoverArea({
  blocks,
  editorLeft,
  onClick,
}: {
  blocks: BlockLayout[];
  editorLeft: number;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}) {
  const firstBlock = blocks[0];
  const lastBlock = blocks[blocks.length - 1];
  if (!firstBlock || !lastBlock) return null;

  return (
    <div
      data-block-drag-gutter
      aria-hidden
      className="pointer-events-auto absolute z-20"
      onClick={onClick}
      style={{
        top: firstBlock.top,
        left: editorLeft - GUTTER_HOVER_WIDTH,
        width: GUTTER_HOVER_WIDTH,
        height: Math.max(1, lastBlock.bottom - firstBlock.top),
      }}
    />
  );
}

export function BlockDragHandle({
  childIndex,
  top,
  left,
  isDragging,
  visible,
}: {
  childIndex: number;
  top: number;
  left: number;
  isDragging: boolean;
  visible: boolean;
}) {
  const [isFocused, setIsFocused] = React.useState(false);
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `content-block-${childIndex}`,
    data: { childIndex },
  });

  return (
    <div
      data-block-drag-handle
      className="absolute z-30 flex h-6 w-8 items-center"
      style={{
        top,
        left,
        opacity: isDragging ? 0 : visible || isFocused ? 1 : 0,
        pointerEvents: visible || isFocused ? 'auto' : 'none',
      }}
    >
      <button
        ref={setNodeRef}
        type="button"
        aria-label={`Drag block ${childIndex + 1} to reorder`}
        title="Drag to reorder"
        className="flex size-6 cursor-grab items-center justify-center rounded text-grey-04 transition-colors hover:bg-grey-01 hover:text-text focus-visible:bg-grey-01 active:cursor-grabbing"
        onFocus={event => setIsFocused(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => setIsFocused(false)}
        {...attributes}
        {...listeners}
      >
        <OrderDots color="currentColor" />
      </button>
    </div>
  );
}

export const blockKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (event.code !== KeyboardCode.Up && event.code !== KeyboardCode.Down) return;

  const sourceIndex = context.active?.data.current?.childIndex;
  if (typeof sourceIndex !== 'number') return;

  const dropZones = context.droppableContainers
    .getEnabled()
    .flatMap(container => {
      const boundary = container.data.current?.boundary;
      return typeof boundary === 'number' ? [{ boundary, container }] : [];
    })
    .sort((a, b) => a.boundary - b.boundary);
  const currentBoundary = context.over?.data.current?.boundary;
  const targetBoundary = getNextKeyboardDropBoundary(
    sourceIndex,
    typeof currentBoundary === 'number' ? currentBoundary : null,
    event.code === KeyboardCode.Down ? 1 : -1,
    dropZones.map(zone => zone.boundary)
  );
  const target = dropZones.find(zone => zone.boundary === targetBoundary);
  const targetRect = target ? context.droppableRects.get(target.container.id) : null;
  if (!targetRect) return;

  event.preventDefault();
  const collisionHeight = context.collisionRect?.height ?? 0;

  return {
    x: currentCoordinates.x,
    y: targetRect.top + (targetRect.height - collisionHeight) / 2,
  };
};

export function getNextKeyboardDropBoundary(
  sourceIndex: number,
  currentBoundary: number | null,
  direction: -1 | 1,
  boundaries: number[]
) {
  const sourceRank = boundaries.indexOf(sourceIndex);
  if (sourceRank === -1) return null;

  const currentBoundaryRank = currentBoundary === null ? sourceRank : boundaries.indexOf(currentBoundary);
  if (currentBoundaryRank === -1) return null;

  const currentRank = currentBoundaryRank > sourceRank ? currentBoundaryRank - 1 : currentBoundaryRank;
  const targetRank = currentRank + direction;
  const targetBoundaryRank = targetRank > sourceRank ? targetRank + 1 : targetRank;

  return boundaries[targetBoundaryRank] ?? null;
}

function BlockDropZone({ zone, left, width }: { zone: DropZoneLayout; left: number; width: number }) {
  const { setNodeRef } = useDroppable({
    id: `content-block-drop-${zone.boundary}`,
    data: { boundary: zone.boundary },
  });

  return (
    <div
      ref={setNodeRef}
      aria-hidden
      className="pointer-events-none absolute z-20"
      style={{ top: zone.top, left, width, height: zone.height }}
    />
  );
}

function isDraggableBlock(element: HTMLElement) {
  return (
    !element.classList.contains('paragraph-tail-placeholder') &&
    !element.matches('.paragraph-tail-placeholder, .is-empty')
  );
}

export function makeDropZones(blocks: BlockLayout[]): DropZoneLayout[] {
  if (blocks.length === 0) return [];

  return Array.from({ length: blocks.length + 1 }, (_, index) => {
    const previous = blocks[index - 1];
    const next = blocks[index];
    const top = previous?.center ?? next.top;
    const bottom = next?.center ?? previous.bottom;
    const indicatorTop = previous && next ? (previous.bottom + next.top) / 2 : (next?.top ?? previous.bottom);

    return {
      boundary: next?.childIndex ?? previous.childIndex + 1,
      top,
      height: Math.max(1, bottom - top),
      indicatorTop,
    };
  });
}

/** Finds the block beside a pointer in the editor's left gutter. */
export function getGutterHoveredChildIndex(
  blocks: BlockLayout[],
  pointerX: number,
  pointerY: number,
  editorLeft: number
) {
  if (pointerX < editorLeft - GUTTER_HOVER_WIDTH || pointerX > editorLeft) return null;

  const hoveredBlock = blocks.find((block, index) => {
    const previous = blocks[index - 1];
    const next = blocks[index + 1];
    const hoverTop = previous ? (previous.bottom + block.top) / 2 : block.top;
    const hoverBottom = next ? (block.bottom + next.top) / 2 : block.bottom;

    return pointerY >= hoverTop && pointerY <= hoverBottom;
  });

  return hoveredBlock?.childIndex ?? null;
}

/** Moves one top-level document node to a boundary in the original document. */
export function moveTopLevelBlock(editor: Editor, sourceIndex: number, dropBoundary: number): boolean {
  const { doc } = editor.state;
  if (sourceIndex < 0 || sourceIndex >= doc.childCount || dropBoundary < 0 || dropBoundary > doc.childCount) {
    return false;
  }

  // Dropping immediately before or after the source preserves its current order.
  if (dropBoundary === sourceIndex || dropBoundary === sourceIndex + 1) return false;

  const sourceNode = doc.child(sourceIndex);
  const sourcePosition = positionBeforeChild(doc, sourceIndex);
  const boundaryPosition = positionBeforeChild(doc, dropBoundary);
  const insertionPosition =
    boundaryPosition > sourcePosition ? boundaryPosition - sourceNode.nodeSize : boundaryPosition;
  const transaction = editor.state.tr
    .delete(sourcePosition, sourcePosition + sourceNode.nodeSize)
    .insert(insertionPosition, sourceNode)
    .scrollIntoView();

  editor.view.dispatch(transaction);
  return true;
}

function positionBeforeChild(doc: Editor['state']['doc'], childIndex: number) {
  let position = 0;
  for (let index = 0; index < childIndex; index += 1) {
    position += doc.child(index).nodeSize;
  }
  return position;
}
