'use client';

import {
  DndContext,
  DragCancelEvent,
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

import { Copy } from '~/design-system/icons/copy';
import { Link } from '~/design-system/icons/link';
import { OrderDots } from '~/design-system/icons/order-dots';
import { Plus } from '~/design-system/icons/plus';
import { Menu, MenuItem } from '~/design-system/menu';

import { ensureUniqueNodeIds } from './id-extension';

type BlockLayout = {
  childIndex: number;
  element?: HTMLElement;
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

const GUTTER_HOVER_WIDTH = 60;
const BLOCK_LINK_HIGHLIGHT_CLASSES = [
  'rounded',
  'ring-2',
  'ring-ctaPrimary',
  'ring-offset-4',
  'transition-shadow',
] as const;

type Props = {
  children: React.ReactNode;
  editor: Editor;
  editorWrapperRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onReorder: () => void;
  onCopyLink: (childIndex: number) => void | Promise<void>;
  onCopyBlock: (childIndex: number) => void | Promise<void>;
  onDuplicateBlock: (childIndex: number) => void | Promise<void>;
};

/** Adds edit-mode drag controls around TipTap's top-level content blocks. */
export function BlockReorder({
  children,
  editor,
  editorWrapperRef,
  enabled,
  onReorder,
  onCopyLink,
  onCopyBlock,
  onDuplicateBlock,
}: Props) {
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
  const [activeBoundary, setActiveBoundary] = React.useState<number | null>(null);
  const [actionsChildIndex, setActionsChildIndex] = React.useState<number | null>(null);
  const actionsChildIndexRef = React.useRef<number | null>(null);

  const updateHoveredChildIndex = React.useCallback((childIndex: number | null) => {
    hoveredChildIndexRef.current = childIndex;
    setHoveredChildIndex(childIndex);
  }, []);

  const updateActionsChildIndex = React.useCallback((childIndex: number | null) => {
    actionsChildIndexRef.current = childIndex;
    setActionsChildIndex(childIndex);
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

      return [{ childIndex, element, top, bottom, center: top + rect.height / 2 }];
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
    let measureFrame: number | null = null;
    const scheduleMeasureBlocks = () => {
      // The drop transaction already triggers the existing active-drag effect
      // cycle. Only schedule document edits made outside an active drag.
      if (activeChildIndex !== null || measureFrame !== null) return;

      measureFrame = requestAnimationFrame(() => {
        measureFrame = null;
        measureBlocks();
      });
    };
    resizeObserver.observe(editorElement);
    mutationObserver.observe(editorElement, { childList: true });
    editor.on('update', scheduleMeasureBlocks);

    const handlePointerMove = (event: PointerEvent) => {
      if (activeChildIndex !== null || actionsChildIndexRef.current !== null) return;

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
      if (activeChildIndex === null && actionsChildIndexRef.current === null) updateHoveredChildIndex(null);
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (activeChildIndex !== null) return;

      const childIndex = getTopLevelBlockChildIndexFromTarget(blockLayoutRef.current, event.target);
      if (childIndex === null) return;

      event.preventDefault();
      updateHoveredChildIndex(childIndex);
      updateActionsChildIndex(childIndex);
    };

    wrapper.addEventListener('pointermove', handlePointerMove);
    wrapper.addEventListener('pointerleave', handlePointerLeave);
    wrapper.addEventListener('contextmenu', handleContextMenu);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      editor.off('update', scheduleMeasureBlocks);
      if (measureFrame !== null) cancelAnimationFrame(measureFrame);
      wrapper.removeEventListener('pointermove', handlePointerMove);
      wrapper.removeEventListener('pointerleave', handlePointerLeave);
      wrapper.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [
    activeChildIndex,
    editor,
    editorWrapperRef,
    enabled,
    measureBlocks,
    updateActionsChildIndex,
    updateHoveredChildIndex,
  ]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let highlightTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let highlightedElement: HTMLElement | null = null;
    let revealedLocation: string | null = null;

    const revealLinkedBlock = () => {
      if (new URL(window.location.href).searchParams.get('source') !== 'copy_link') return;

      const locationKey = `${window.location.search}${window.location.hash}`;
      if (revealedLocation === locationKey) return;

      let blockId: string;
      try {
        blockId = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (!blockId) return;

      const element = findTopLevelBlockElement(editor, blockId);
      if (!element) {
        if (attempts < 20 && retryTimer === null) {
          attempts += 1;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            revealLinkedBlock();
          }, 100);
        }
        return;
      }

      revealedLocation = locationKey;
      highlightedElement?.classList.remove(...BLOCK_LINK_HIGHLIGHT_CLASSES);
      highlightedElement = element;
      element.classList.add(...BLOCK_LINK_HIGHLIGHT_CLASSES);
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        element.classList.remove(...BLOCK_LINK_HIGHLIGHT_CLASSES);
        if (highlightedElement === element) highlightedElement = null;
      }, 4000);
    };

    const handleHashChange = () => {
      attempts = 0;
      revealedLocation = null;
      revealLinkedBlock();
    };

    revealLinkedBlock();
    window.addEventListener('hashchange', handleHashChange);
    editor.on('update', revealLinkedBlock);

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightedElement?.classList.remove(...BLOCK_LINK_HIGHLIGHT_CLASSES);
      window.removeEventListener('hashchange', handleHashChange);
      editor.off('update', revealLinkedBlock);
    };
  }, [editor]);

  React.useEffect(() => {
    if (enabled) return;

    hoveredChildIndexRef.current = null;
    setHoveredChildIndex(null);
    setActiveChildIndex(null);
    setActiveBoundary(null);
    updateActionsChildIndex(null);
  }, [enabled, updateActionsChildIndex]);

  const editorRect = editorWrapperRef.current?.querySelector<HTMLElement>('.ProseMirror')?.getBoundingClientRect();
  const wrapperRect = editorWrapperRef.current?.getBoundingClientRect();
  const editorLeft = editorRect && wrapperRect ? editorRect.left - wrapperRect.left : 0;
  const editorWidth = editorRect?.width ?? 0;
  const visibleHandleIndex = activeChildIndex ?? actionsChildIndex ?? hoveredChildIndex;
  const handleLayout = blockLayout.find(block => block.childIndex === visibleHandleIndex);
  const dropZones = makeDropZones(blockLayout);
  const indicatorTop = dropZones.find(zone => zone.boundary === activeBoundary)?.indicatorTop;

  const resetDragState = () => {
    setActiveChildIndex(null);
    setActiveBoundary(null);
    updateHoveredChildIndex(null);
  };

  const handleDragCancel = (event: DragCancelEvent) => {
    releasePointerDragFocus(event.activatorEvent);
    resetDragState();
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!enabled) return;

    const childIndex = event.active.data.current?.childIndex;
    if (typeof childIndex !== 'number') return;

    // Continuation nodes loaded from markdown intentionally start without IDs.
    // A drag can happen before blur, so assign/dedupe IDs before persisting it.
    ensureUniqueNodeIds(editor);
    measureBlocks();
    updateActionsChildIndex(null);
    setActiveChildIndex(childIndex);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const boundary = event.over?.data.current?.boundary;
    setActiveBoundary(typeof boundary === 'number' ? boundary : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const sourceIndex = event.active.data.current?.childIndex;
    const dropBoundary = event.over?.data.current?.boundary;
    const boundaries = makeDropZones(blockLayoutRef.current).map(zone => zone.boundary);

    if (
      typeof sourceIndex === 'number' &&
      typeof dropBoundary === 'number' &&
      !isBlockDropNoOp(sourceIndex, dropBoundary, boundaries) &&
      moveTopLevelBlock(editor, sourceIndex, dropBoundary)
    ) {
      onReorder();
    }

    releasePointerDragFocus(event.activatorEvent);
    resetDragState();
  };

  const handleInsertBelow = (childIndex: number) => {
    if (!enabled) return;

    insertTextBlockBelow(editor, childIndex);
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
              left={editorLeft - GUTTER_HOVER_WIDTH}
              isDragging={activeChildIndex !== null}
              visible={layout === handleLayout && visibleHandleIndex !== null}
              onInsertBelow={() => handleInsertBelow(layout.childIndex)}
              actionsOpen={actionsChildIndex === layout.childIndex}
              onActionsOpenChange={open => {
                updateActionsChildIndex(open ? layout.childIndex : null);
                if (!open) updateHoveredChildIndex(null);
              }}
              onCopyLink={() => void onCopyLink(layout.childIndex)}
              onCopyBlock={() => void onCopyBlock(layout.childIndex)}
              onDuplicateBlock={() => void onDuplicateBlock(layout.childIndex)}
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

function getBlockDragHandleKey(editor: Editor, childIndex: number) {
  if (childIndex < 0 || childIndex >= editor.state.doc.childCount) return `child-${childIndex}`;

  const blockId = editor.state.doc.child(childIndex).attrs.id;
  return typeof blockId === 'string' && blockId.length > 0 ? blockId : `child-${childIndex}`;
}

/** Pointer activation should not leave a handle visibly focused after drop. */
export function releasePointerDragFocus(activatorEvent: Event) {
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
  onInsertBelow,
  actionsOpen = false,
  onActionsOpenChange,
  onCopyLink,
  onCopyBlock,
  onDuplicateBlock,
}: {
  childIndex: number;
  top: number;
  left: number;
  isDragging: boolean;
  visible: boolean;
  onInsertBelow?: () => void;
  actionsOpen?: boolean;
  onActionsOpenChange?: (open: boolean) => void;
  onCopyLink?: () => void;
  onCopyBlock?: () => void;
  onDuplicateBlock?: () => void;
}) {
  const [isFocused, setIsFocused] = React.useState(false);
  const [isCoarseOrHoverlessPointer, setIsCoarseOrHoverlessPointer] = React.useState(false);
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `content-block-${childIndex}`,
    data: { childIndex },
  });
  const isAvailable = !isDragging && (visible || isFocused || actionsOpen || isCoarseOrHoverlessPointer);

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const pointerQuery = window.matchMedia('(hover: none), (pointer: coarse)');
    const updatePointerMode = () => setIsCoarseOrHoverlessPointer(pointerQuery.matches);
    updatePointerMode();
    pointerQuery.addEventListener('change', updatePointerMode);

    return () => pointerQuery.removeEventListener('change', updatePointerMode);
  }, []);

  return (
    <div
      data-block-drag-handle
      className="absolute z-30 flex h-6 w-[60px] items-center gap-1 pr-2"
      style={{
        top,
        left,
        opacity: isAvailable ? 1 : 0,
        pointerEvents: isAvailable ? 'auto' : 'none',
      }}
    >
      {onInsertBelow ? (
        <button
          type="button"
          aria-label={`Add block below block ${childIndex + 1}`}
          title="Add block below"
          className="flex size-6 shrink-0 items-center justify-center rounded text-grey-04 transition-colors hover:bg-grey-01 hover:text-text focus-visible:bg-grey-01"
          onMouseDown={event => event.preventDefault()}
          onClick={onInsertBelow}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          <Plus />
        </button>
      ) : null}
      <Menu
        open={actionsOpen}
        onOpenChange={open => onActionsOpenChange?.(open)}
        asChild
        className="w-52"
        sideOffset={4}
        trigger={
          <button
            ref={setNodeRef}
            type="button"
            aria-label={`Drag block ${childIndex + 1} to reorder`}
            title="Drag to reorder or click for actions"
            className="flex size-6 cursor-grab touch-none items-center justify-center rounded text-grey-04 transition-colors hover:bg-grey-01 hover:text-text focus-visible:bg-grey-01 active:cursor-grabbing"
            onContextMenu={event => {
              event.preventDefault();
              onActionsOpenChange?.(true);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...attributes}
            {...listeners}
          >
            <OrderDots color="currentColor" />
          </button>
        }
      >
        <MenuItem
          onClick={() => {
            onActionsOpenChange?.(false);
            onCopyLink?.();
          }}
        >
          <Link />
          Copy link to block
        </MenuItem>
        <MenuItem
          onClick={() => {
            onActionsOpenChange?.(false);
            onCopyBlock?.();
          }}
        >
          <Copy />
          Copy block
        </MenuItem>
        <MenuItem
          onClick={() => {
            onActionsOpenChange?.(false);
            onDuplicateBlock?.();
          }}
        >
          <Copy />
          Duplicate block
        </MenuItem>
      </Menu>
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

  const currentRank =
    currentBoundary === null ? sourceRank : getBlockRankAtBoundary(sourceIndex, currentBoundary, boundaries);
  if (currentRank === null) return null;

  const targetRank = currentRank + direction;
  const targetBoundaryRank = targetRank > sourceRank ? targetRank + 1 : targetRank;

  return boundaries[targetBoundaryRank] ?? null;
}

/** Whether a drop boundary leaves the source in the same draggable-block slot. */
export function isBlockDropNoOp(sourceIndex: number, dropBoundary: number, boundaries: number[]) {
  const sourceRank = boundaries.indexOf(sourceIndex);
  const dropRank = getBlockRankAtBoundary(sourceIndex, dropBoundary, boundaries);

  return sourceRank !== -1 && dropRank === sourceRank;
}

function getBlockRankAtBoundary(sourceIndex: number, boundary: number, boundaries: number[]) {
  const sourceRank = boundaries.indexOf(sourceIndex);
  const boundaryRank = boundaries.indexOf(boundary);
  if (sourceRank === -1 || boundaryRank === -1) return null;

  return boundaryRank > sourceRank ? boundaryRank - 1 : boundaryRank;
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

export function getTopLevelBlockChildIndexFromTarget(blocks: BlockLayout[], target: EventTarget | null) {
  if (!(target instanceof Element)) return null;

  const blockElement = target.closest<HTMLElement>('.ProseMirror > *');
  return blocks.find(block => block.element === blockElement)?.childIndex ?? null;
}

export function findTopLevelBlockElement(editor: Editor, blockId: string): HTMLElement | null {
  const editorElement = editor.view.dom;
  const block = getTopLevelBlockElements(editor, editorElement).find(({ childIndex }) => {
    return editor.state.doc.child(childIndex).attrs.id === blockId;
  });

  return block?.element ?? null;
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

/** Inserts a standard text block below a top-level node and moves the cursor into it. */
export function insertTextBlockBelow(editor: Editor, childIndex: number): boolean {
  const { doc } = editor.state;
  if (childIndex < 0 || childIndex >= doc.childCount) return false;

  const insertPosition = positionBeforeChild(doc, childIndex + 1);
  return editor
    .chain()
    .insertContentAt(insertPosition, { type: 'paragraph' })
    .focus(insertPosition + 1)
    .scrollIntoView()
    .run();
}

function positionBeforeChild(doc: Editor['state']['doc'], childIndex: number) {
  let position = 0;
  for (let index = 0; index < childIndex; index += 1) {
    position += doc.child(index).nodeSize;
  }
  return position;
}
