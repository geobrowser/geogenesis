import { DndContext } from '@dnd-kit/core';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Editor } from '@tiptap/react';

import React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BlockDragHandle,
  BlockGutterHoverArea,
  getGutterHoveredChildIndex,
  getNextKeyboardDropBoundary,
  makeDropZones,
  moveTopLevelBlock,
} from './block-reorder';

const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe('BlockDragHandle', () => {
  it('bridges the gap between the visible handle and the hovered block', () => {
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
    const hoverBridge = button.parentElement;

    expect(button).toHaveClass('size-6');
    expect(hoverBridge).toHaveAttribute('data-block-drag-handle');
    expect(hoverBridge).toHaveClass('w-8');
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

  it('prevents pointer activation from moving browser focus to the drag handle', () => {
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
    const pointerDown = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    button.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
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
      left: '52px',
      width: '48px',
      height: '60px',
    });
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
    expect(getGutterHoveredChildIndex(blocks, 51, 20, 100)).toBeNull();
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
