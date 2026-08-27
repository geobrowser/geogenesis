import { DndContext } from '@dnd-kit/core';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Editor } from '@tiptap/react';

import React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BlockDragHandle,
  BlockGutterHoverArea,
  getGutterHoveredChildIndex,
  getNextKeyboardDropBoundary,
  getTopLevelBlockElements,
  insertTextBlockBelow,
  isBlockDropNoOp,
  makeDropZones,
  moveTopLevelBlock,
  releasePointerDragFocus,
} from './block-reorder';

const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) {
    editor.view.dom.remove();
    editor.destroy();
  }
  vi.unstubAllGlobals();
});

describe('BlockDragHandle', () => {
  it('renders the plus button to the left of the drag handle', () => {
    const onInsertBelow = vi.fn();
    render(
      React.createElement(
        DndContext,
        null,
        React.createElement(BlockDragHandle, {
          childIndex: 0,
          top: 12,
          left: -32,
          isDragging: false,
          visible: true,
          onInsertBelow,
        })
      )
    );

    const addButton = screen.getByRole('button', { name: 'Add block below block 1' });
    const dragButton = screen.getByRole('button', { name: 'Drag block 1 to reorder' });
    const hoverCluster = dragButton.parentElement;

    expect(addButton.compareDocumentPosition(dragButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(hoverCluster).toHaveAttribute('data-block-drag-handle');
    expect(hoverCluster).toHaveClass('w-[60px]');

    fireEvent.click(addButton);
    expect(onInsertBelow).toHaveBeenCalledOnce();
  });

  it('reveals a hidden handle when it receives keyboard focus', () => {
    render(
      React.createElement(
        DndContext,
        null,
        React.createElement(BlockDragHandle, {
          childIndex: 0,
          top: 12,
          left: -32,
          isDragging: false,
          visible: false,
        })
      )
    );

    const button = screen.getByRole('button', { name: 'Drag block 1 to reorder' });
    const handle = button.parentElement;
    expect(handle).toHaveStyle({ opacity: '0', pointerEvents: 'none' });

    fireEvent.focus(button);

    expect(handle).toHaveStyle({ opacity: '1', pointerEvents: 'auto' });
  });

  it('keeps hidden handles available on coarse or hoverless pointers', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        media: '(hover: none), (pointer: coarse)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })
    );

    render(
      React.createElement(
        DndContext,
        null,
        React.createElement(BlockDragHandle, {
          childIndex: 0,
          top: 12,
          left: -32,
          isDragging: false,
          visible: false,
        })
      )
    );

    const button = screen.getByRole('button', { name: 'Drag block 1 to reorder' });
    expect(button.parentElement).toHaveStyle({ opacity: '1', pointerEvents: 'auto' });
    expect(button).toHaveClass('touch-none');
  });

  it('releases pointer focus after a drag so the old block slot does not stay highlighted', () => {
    render(
      React.createElement(
        DndContext,
        null,
        React.createElement(BlockDragHandle, {
          childIndex: 0,
          top: 12,
          left: -32,
          isDragging: false,
          visible: true,
        })
      )
    );

    const button = screen.getByRole('button', { name: 'Drag block 1 to reorder' });
    button.focus();
    const pointerDown = new MouseEvent('pointerdown', { bubbles: true });
    button.dispatchEvent(pointerDown);
    expect(button).toHaveFocus();

    releasePointerDragFocus(pointerDown);

    expect(button).not.toHaveFocus();
  });
});

describe('BlockGutterHoverArea', () => {
  it('creates a real pointer target extending left beyond the handle position', () => {
    const { container } = render(
      React.createElement(BlockGutterHoverArea, {
        editorLeft: 100,
        blocks: [
          { childIndex: 0, top: 10, bottom: 30, center: 20 },
          { childIndex: 1, top: 50, bottom: 70, center: 60 },
        ],
      })
    );

    expect(container.querySelector('[data-block-drag-gutter]')).toHaveStyle({
      top: '10px',
      left: '40px',
      width: '60px',
      height: '60px',
    });
  });
});

describe('insertTextBlockBelow', () => {
  it('inserts an empty paragraph directly below the selected block and focuses it', async () => {
    const editor = makeEditor(['A', 'B']);
    document.body.appendChild(editor.view.dom);

    expect(insertTextBlockBelow(editor, 0)).toBe(true);

    expect(blockText(editor)).toEqual(['A', '', 'B']);
    expect(editor.state.selection.from).toBe(editor.state.doc.child(0).nodeSize + 1);
    await waitFor(() => expect(editor.isFocused).toBe(true));
  });

  it('inserts below the final block', () => {
    const editor = makeEditor(['A', 'B']);

    expect(insertTextBlockBelow(editor, 1)).toBe(true);
    expect(blockText(editor)).toEqual(['A', 'B', '']);
  });

  it('does not change the document for an invalid block index', () => {
    const editor = makeEditor(['A']);

    expect(insertTextBlockBelow(editor, 1)).toBe(false);
    expect(blockText(editor)).toEqual(['A']);
  });
});

describe('moveTopLevelBlock', () => {
  it('moves a block down to the selected document boundary', () => {
    const editor = makeEditor(['A', 'B', 'C', 'D']);

    expect(moveTopLevelBlock(editor, 0, 3)).toBe(true);

    expect(blockText(editor)).toEqual(['B', 'C', 'A', 'D']);
  });

  it('moves a block up to the selected document boundary', () => {
    const editor = makeEditor(['A', 'B', 'C', 'D']);

    expect(moveTopLevelBlock(editor, 3, 1)).toBe(true);

    expect(blockText(editor)).toEqual(['A', 'D', 'B', 'C']);
  });

  it('does not change the document when dropped beside its current position', () => {
    const editor = makeEditor(['A', 'B', 'C']);

    expect(moveTopLevelBlock(editor, 1, 1)).toBe(false);
    expect(moveTopLevelBlock(editor, 1, 2)).toBe(false);
    expect(blockText(editor)).toEqual(['A', 'B', 'C']);
  });
});

describe('getGutterHoveredChildIndex', () => {
  const blocks = [
    { childIndex: 0, top: 10, bottom: 30, center: 20 },
    { childIndex: 1, top: 50, bottom: 70, center: 60 },
  ];

  it('shows the handle when hovering directly left of a block', () => {
    expect(getGutterHoveredChildIndex(blocks, 60, 20, 100)).toBe(0);
    expect(getGutterHoveredChildIndex(blocks, 60, 60, 100)).toBe(1);
  });

  it('keeps the gutter target continuous through the gap between blocks', () => {
    expect(getGutterHoveredChildIndex(blocks, 60, 39, 100)).toBe(0);
    expect(getGutterHoveredChildIndex(blocks, 60, 41, 100)).toBe(1);
  });

  it('ignores pointers outside the left gutter', () => {
    expect(getGutterHoveredChildIndex(blocks, 39, 20, 100)).toBeNull();
    expect(getGutterHoveredChildIndex(blocks, 101, 20, 100)).toBeNull();
  });
});

describe('getNextKeyboardDropBoundary', () => {
  const boundaries = [0, 1, 2, 3, 4];

  it('moves one block at a time and can return to the original position', () => {
    expect(getNextKeyboardDropBoundary(1, null, 1, boundaries)).toBe(3);
    expect(getNextKeyboardDropBoundary(1, 3, -1, boundaries)).toBe(1);
    expect(getNextKeyboardDropBoundary(1, 1, -1, boundaries)).toBe(0);
  });

  it('stops at the first and last positions', () => {
    expect(getNextKeyboardDropBoundary(0, null, -1, boundaries)).toBeNull();
    expect(getNextKeyboardDropBoundary(3, null, 1, boundaries)).toBeNull();
  });

  it('moves by draggable rank when excluded nodes make child indexes non-contiguous', () => {
    const boundariesWithExcludedNode = [0, 2, 3];

    expect(getNextKeyboardDropBoundary(0, null, 1, boundariesWithExcludedNode)).toBe(3);
    expect(getNextKeyboardDropBoundary(2, null, -1, boundariesWithExcludedNode)).toBe(0);
  });
});

describe('isBlockDropNoOp', () => {
  it('recognizes both slots beside the source in a contiguous document', () => {
    const boundaries = [0, 1, 2, 3];

    expect(isBlockDropNoOp(1, 1, boundaries)).toBe(true);
    expect(isBlockDropNoOp(1, 2, boundaries)).toBe(true);
    expect(isBlockDropNoOp(1, 0, boundaries)).toBe(false);
    expect(isBlockDropNoOp(1, 3, boundaries)).toBe(false);
  });

  it('uses draggable rank when excluded nodes make child indexes sparse', () => {
    const boundariesWithExcludedNode = [0, 2, 3];

    expect(isBlockDropNoOp(0, 2, boundariesWithExcludedNode)).toBe(true);
    expect(isBlockDropNoOp(2, 2, boundariesWithExcludedNode)).toBe(true);
    expect(isBlockDropNoOp(0, 3, boundariesWithExcludedNode)).toBe(false);
    expect(isBlockDropNoOp(2, 0, boundariesWithExcludedNode)).toBe(false);
  });
});

describe('makeDropZones', () => {
  it('creates a drop target before, between, and after every draggable block', () => {
    expect(
      makeDropZones([
        { childIndex: 0, top: 10, bottom: 30, center: 20 },
        { childIndex: 1, top: 40, bottom: 80, center: 60 },
      ])
    ).toEqual([
      { boundary: 0, top: 10, height: 10, indicatorTop: 10 },
      { boundary: 1, top: 20, height: 40, indicatorTop: 35 },
      { boundary: 2, top: 60, height: 20, indicatorTop: 80 },
    ]);
  });

  it('places the final drop boundary immediately after the last draggable block', () => {
    const zones = makeDropZones([
      { childIndex: 0, top: 10, bottom: 30, center: 20 },
      { childIndex: 1, top: 50, bottom: 70, center: 60 },
    ]);

    expect(zones.map(zone => zone.boundary)).toEqual([0, 1, 2]);
  });
});

describe('getTopLevelBlockElements', () => {
  it('maps document indexes without counting direct gap-cursor widgets', () => {
    const editor = makeEditor(['A', 'B']);
    const editorElement = editor.view.dom;
    const firstBlock = editor.view.nodeDOM(0);
    const gapCursor = document.createElement('div');
    gapCursor.className = 'ProseMirror-gapcursor';

    expect(firstBlock).toBeInstanceOf(HTMLElement);
    firstBlock?.parentNode?.insertBefore(gapCursor, firstBlock.nextSibling);

    expect(getTopLevelBlockElements(editor, editorElement).map(block => block.childIndex)).toEqual([0, 1]);
    expect(getTopLevelBlockElements(editor, editorElement).map(block => block.element)).not.toContain(gapCursor);
  });
});

function makeEditor(labels: string[]) {
  const editor = new Editor({
    extensions: [Document, Paragraph, Text],
    content: {
      type: 'doc',
      content: labels.map(label => ({ type: 'paragraph', content: [{ type: 'text', text: label }] })),
    },
  });
  editors.push(editor);
  return editor;
}

function blockText(editor: Editor) {
  return Array.from({ length: editor.state.doc.childCount }, (_, index) => editor.state.doc.child(index).textContent);
}
