'use client';

import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Editor } from '@tiptap/react';

import * as React from 'react';

import { OrderDots } from '~/design-system/icons/order-dots';

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
    })
  );
  const [blockLayout, setBlockLayout] = React.useState<BlockLayout[]>([]);
  const blockLayoutRef = React.useRef<BlockLayout[]>([]);
  const [hoveredChildIndex, setHoveredChildIndex] = React.useState<number | null>(null);
  const hoveredChildIndexRef = React.useRef<number | null>(null);
  const [activeChildIndex, setActiveChildIndex] = React.useState<number | null>(null);
  const [activeBoundary, setActiveBoundary] = React.useState<number | null>(null);

  const updateHoveredChildIndex = React.useCallback((childIndex: number | null) => {
    hoveredChildIndexRef.current = childIndex;
    setHoveredChildIndex(childIndex);
  }, []);

  const measureBlocks = React.useCallback(() => {
    const wrapper = editorWrapperRef.current;
    const editorElement = wrapper?.querySelector<HTMLElement>('.ProseMirror');
    if (!wrapper || !editorElement) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const nextLayout = Array.from(editorElement.children).flatMap((element, childIndex) => {
      if (!(element instanceof HTMLElement) || !isDraggableBlock(element)) return [];

      const rect = element.getBoundingClientRect();
      const top = rect.top - wrapperRect.top;
      const bottom = rect.bottom - wrapperRect.top;

      return [{ childIndex, top, bottom, center: top + rect.height / 2 }];
    });

    blockLayoutRef.current = nextLayout;
    setBlockLayout(nextLayout);
  }, [editorWrapperRef]);

  React.useLayoutEffect(() => {
    if (!enabled) return;

    const wrapper = editorWrapperRef.current;
    const editorElement = wrapper?.querySelector<HTMLElement>('.ProseMirror');
    if (!wrapper || !editorElement) return;

    measureBlocks();

    const resizeObserver = new ResizeObserver(measureBlocks);
    const mutationObserver = new MutationObserver(measureBlocks);
    resizeObserver.observe(editorElement);
    mutationObserver.observe(editorElement, { childList: true });

    const handlePointerMove = (event: PointerEvent) => {
      if (activeChildIndex !== null) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-block-drag-handle]')) return;

      const blockElement = target.closest<HTMLElement>('.ProseMirror > *');
      const hoveredContentIndex =
        blockElement?.parentElement === editorElement && isDraggableBlock(blockElement)
          ? Array.from(editorElement.children).indexOf(blockElement)
          : null;
      const wrapperRect = wrapper.getBoundingClientRect();
      const editorRect = editorElement.getBoundingClientRect();
      const hoveredGutterIndex = getGutterHoveredChildIndex(
        blockLayoutRef.current,
        event.clientX - wrapperRect.left,
        event.clientY - wrapperRect.top,
        editorRect.left - wrapperRect.left
      );
      const childIndex = hoveredContentIndex ?? hoveredGutterIndex;

      if (childIndex === null) {
        updateHoveredChildIndex(null);
        return;
      }

      if (hoveredChildIndexRef.current === childIndex) return;

      measureBlocks();
      updateHoveredChildIndex(childIndex);
    };

    const handlePointerLeave = () => {
      if (activeChildIndex === null) updateHoveredChildIndex(null);
    };

    wrapper.addEventListener('pointermove', handlePointerMove);
    wrapper.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      wrapper.removeEventListener('pointermove', handlePointerMove);
      wrapper.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [activeChildIndex, editorWrapperRef, enabled, measureBlocks, updateHoveredChildIndex]);

  React.useEffect(() => {
    if (enabled) return;

    hoveredChildIndexRef.current = null;
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
    setActiveChildIndex(null);
    setActiveBoundary(null);
    updateHoveredChildIndex(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!enabled) return;

    const childIndex = event.active.data.current?.childIndex;
    if (typeof childIndex !== 'number') return;

    measureBlocks();
    setActiveChildIndex(childIndex);
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
      onDragCancel={resetDragState}
      onDragEnd={handleDragEnd}
    >
      {children}

      {enabled && handleLayout && visibleHandleIndex !== null ? (
        <BlockDragHandle
          childIndex={visibleHandleIndex}
          top={handleLayout.top + Math.min(16, (handleLayout.bottom - handleLayout.top) / 2) - 12}
          left={editorLeft - 32}
          isDragging={activeChildIndex !== null}
        />
      ) : null}

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

export function BlockDragHandle({
  childIndex,
  top,
  left,
  isDragging,
}: {
  childIndex: number;
  top: number;
  left: number;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `content-block-${childIndex}`,
    data: { childIndex },
  });

  return (
    <div
      data-block-drag-handle
      className="absolute z-30 flex h-6 w-8 items-center"
      style={{ top, left, opacity: isDragging ? 0 : 1 }}
    >
      <button
        ref={setNodeRef}
        type="button"
        aria-label="Drag to reorder block"
        title="Drag to reorder"
        className="flex size-6 cursor-grab items-center justify-center rounded text-grey-04 transition-colors hover:bg-grey-01 hover:text-text focus-visible:bg-grey-01 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <OrderDots color="currentColor" />
      </button>
    </div>
  );
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
