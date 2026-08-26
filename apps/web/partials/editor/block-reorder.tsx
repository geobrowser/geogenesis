'use client';

import { move } from '@dnd-kit/helpers';
import { DragDropProvider } from '@dnd-kit/react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import type { Editor } from '@tiptap/react';

import * as React from 'react';

import { OrderDots } from '~/design-system/icons/order-dots';

import { ensureUniqueNodeIds } from './id-extension';

type BlockLayout = {
  id: string;
  element: HTMLElement;
  childIndex: number;
  top: number;
  bottom: number;
  center: number;
};

type BlockPosition = {
  childIndex: number;
  top: number;
  bottom: number;
  center: number;
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
  const [blockLayout, setBlockLayout] = React.useState<BlockLayout[]>([]);
  const blockLayoutRef = React.useRef<BlockLayout[]>([]);
  const [hoveredChildIndex, setHoveredChildIndex] = React.useState<number | null>(null);
  const hoveredChildIndexRef = React.useRef<number | null>(null);
  const [activeBlockId, setActiveBlockId] = React.useState<string | null>(null);

  const updateHoveredChildIndex = React.useCallback((childIndex: number | null) => {
    hoveredChildIndexRef.current = childIndex;
    setHoveredChildIndex(childIndex);
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
      const blockId = editor.state.doc.child(childIndex).attrs.id;
      const id = typeof blockId === 'string' && blockId.length > 0 ? blockId : `child-${childIndex}`;

      return [{ id, element, childIndex, top, bottom, center: top + rect.height / 2 }];
    });

    blockLayoutRef.current = nextLayout;
    setBlockLayout(nextLayout);
  }, [editor, editorWrapperRef]);

  React.useLayoutEffect(() => {
    if (!enabled) return;

    const wrapper = editorWrapperRef.current;
    const editorElement = wrapper?.querySelector<HTMLElement>('.ProseMirror');
    if (!wrapper || !editorElement) return;

    // Establish stable handle identities before rendering the controls. This
    // lets focus follow a block when keyboard reordering changes its child index.
    ensureUniqueNodeIds(editor);
    measureBlocks();

    const resizeObserver = new ResizeObserver(measureBlocks);
    const mutationObserver = new MutationObserver(measureBlocks);
    resizeObserver.observe(editorElement);
    mutationObserver.observe(editorElement, { childList: true });
    editor.on('update', measureBlocks);

    const handlePointerMove = (event: PointerEvent) => {
      if (activeBlockId !== null) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-block-drag-handle]')) return;

      const blockElement = target.closest<HTMLElement>('.ProseMirror > *');
      const hoveredContentIndex = blockLayoutRef.current.find(block => block.element === blockElement)?.childIndex;
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
      if (activeBlockId === null) updateHoveredChildIndex(null);
    };

    wrapper.addEventListener('pointermove', handlePointerMove);
    wrapper.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      editor.off('update', measureBlocks);
      wrapper.removeEventListener('pointermove', handlePointerMove);
      wrapper.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [activeBlockId, editor, editorWrapperRef, enabled, measureBlocks, updateHoveredChildIndex]);

  React.useEffect(() => {
    if (enabled) return;

    hoveredChildIndexRef.current = null;
    setHoveredChildIndex(null);
    setActiveBlockId(null);
  }, [enabled]);

  const editorRect = editorWrapperRef.current?.querySelector<HTMLElement>('.ProseMirror')?.getBoundingClientRect();
  const wrapperRect = editorWrapperRef.current?.getBoundingClientRect();
  const editorLeft = editorRect && wrapperRect ? editorRect.left - wrapperRect.left : 0;
  const handleLayout = blockLayout.find(block => block.childIndex === hoveredChildIndex);

  const resetDragState = () => {
    setActiveBlockId(null);
    updateHoveredChildIndex(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!enabled) return;

    const sourceId = event.operation.source?.id;
    if (sourceId === null || sourceId === undefined) return;

    // Continuation nodes loaded from markdown intentionally start without IDs.
    // A drag can happen before blur, so assign/dedupe IDs before persisting it.
    ensureUniqueNodeIds(editor);
    measureBlocks();
    setActiveBlockId(String(sourceId));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const blocks = blockLayoutRef.current;
    const sourceId = event.operation.source?.id;

    if (!event.canceled && sourceId !== null && sourceId !== undefined) {
      const sourceRank = blocks.findIndex(block => block.id === String(sourceId));
      const reorderedBlocks = move(blocks, event);
      const targetRank = reorderedBlocks.findIndex(block => block.id === String(sourceId));
      const dropBoundary = getSortableDropBoundary(blocks, sourceRank, targetRank);
      const sourceIndex = blocks[sourceRank]?.childIndex;

      if (
        typeof sourceIndex === 'number' &&
        dropBoundary !== null &&
        moveTopLevelBlock(editor, sourceIndex, dropBoundary)
      ) {
        onReorder();
      }
    }

    releasePointerDragFocus(event.operation.activatorEvent);
    resetDragState();
  };

  return (
    <DragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {children}

      {enabled && activeBlockId === null && blockLayout.length > 0 ? (
        <BlockGutterHoverArea blocks={blockLayout} editorLeft={editorLeft} onClick={() => editor.commands.focus()} />
      ) : null}

      {enabled
        ? blockLayout.map((layout, index) => (
            <SortableBlockDragHandle
              key={layout.id}
              layout={layout}
              index={index}
              left={editorLeft - 32}
              isDragging={activeBlockId !== null}
              visible={layout === handleLayout && hoveredChildIndex !== null}
            />
          ))
        : null}
    </DragDropProvider>
  );
}

/** Pointer activation should not leave a handle visibly focused after drop. */
export function releasePointerDragFocus(activatorEvent: Event | null | undefined) {
  if (!activatorEvent) return;
  if (activatorEvent.type === 'keydown') return;

  const target = activatorEvent.target;
  if (!(target instanceof Element)) return;

  target.closest<HTMLElement>('[data-block-drag-handle] button')?.blur();
}

export function BlockGutterHoverArea({
  blocks,
  editorLeft,
  onClick,
}: {
  blocks: BlockPosition[];
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

function SortableBlockDragHandle({
  layout,
  index,
  left,
  isDragging,
  visible,
}: {
  layout: BlockLayout;
  index: number;
  left: number;
  isDragging: boolean;
  visible: boolean;
}) {
  const { handleRef } = useSortable({
    id: layout.id,
    index,
    element: layout.element,
    transition: { duration: 150, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
  });

  return (
    <BlockDragHandle
      childIndex={layout.childIndex}
      top={layout.top + Math.min(16, (layout.bottom - layout.top) / 2) - 12}
      left={left}
      isDragging={isDragging}
      visible={visible}
      dragHandleRef={handleRef}
    />
  );
}

export function BlockDragHandle({
  childIndex,
  top,
  left,
  isDragging,
  visible,
  dragHandleRef,
}: {
  childIndex: number;
  top: number;
  left: number;
  isDragging: boolean;
  visible: boolean;
  dragHandleRef?: (element: HTMLButtonElement | null) => void;
}) {
  const [isFocused, setIsFocused] = React.useState(false);

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
        ref={dragHandleRef}
        type="button"
        aria-label={`Drag block ${childIndex + 1} to reorder`}
        title="Drag to reorder"
        className="flex size-6 cursor-grab items-center justify-center rounded text-grey-04 transition-colors hover:bg-grey-01 hover:text-text focus-visible:bg-grey-01 active:cursor-grabbing"
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        <OrderDots color="currentColor" />
      </button>
    </div>
  );
}

function isDraggableBlock(element: HTMLElement) {
  return (
    !element.classList.contains('paragraph-tail-placeholder') &&
    !element.matches('.paragraph-tail-placeholder, .is-empty')
  );
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

export function getSortableDropBoundary(
  blocks: Array<Pick<BlockLayout, 'childIndex'>>,
  sourceRank: number,
  targetRank: number
) {
  if (
    sourceRank < 0 ||
    sourceRank >= blocks.length ||
    targetRank < 0 ||
    targetRank >= blocks.length ||
    sourceRank === targetRank
  ) {
    return null;
  }

  const targetChildIndex = blocks[targetRank]?.childIndex;
  if (targetChildIndex === undefined) return null;

  return targetRank > sourceRank ? targetChildIndex + 1 : targetChildIndex;
}

/** Finds the block beside a pointer in the editor's left gutter. */
export function getGutterHoveredChildIndex(
  blocks: BlockPosition[],
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
