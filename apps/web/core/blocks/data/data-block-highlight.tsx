'use client';

import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import * as React from 'react';

import { getDefaultStore, useSetAtom } from 'jotai';

import { activeDataBlockIdAtom } from '~/atoms';

const DATA_BLOCK_SELECTOR = '[data-block-id]';

const DATA_BLOCK_OVERLAY_SELECTOR = [
  '[data-radix-popper-content-wrapper]',
  '[data-radix-portal]',
  '[data-radix-select-content]',
  '[role="menu"]',
  '[role="dialog"]',
  '[role="listbox"]',
].join(', ');

export function clearActiveDataBlockId(): void {
  getDefaultStore().set(activeDataBlockIdAtom, null);
}

export function getDataBlockIdFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;

  const el = target.closest(DATA_BLOCK_SELECTOR);
  const id = el?.getAttribute('data-block-id');

  return typeof id === 'string' && id.length > 0 ? id : null;
}

function isDataBlockOverlayTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(target.closest(DATA_BLOCK_OVERLAY_SELECTOR));
}

function isEditorTextFocus(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el.closest('.data-node')) return false;

  return el.classList.contains('ProseMirror') || Boolean(el.closest('.ProseMirror'));
}

/** Apply highlight when the editor has a NodeSelection on a data block. Does not clear. */
export function applyNodeSelectionHighlight(editor: Editor): void {
  const { selection } = editor.state;

  if (selection instanceof NodeSelection && selection.node.type.name === 'tableNode') {
    const id = selection.node.attrs.id;
    if (typeof id === 'string') {
      getDefaultStore().set(activeDataBlockIdAtom, id);
    }
  }
}

/**
 * Central highlight controller for the entity editor.
 * - No highlight on load / entity change
 * - Click inside a data block → highlight that block
 * - Click editor text → clear unless the block is node-selected
 * - Click outside → clear
 */
export function useDataBlockHighlightSync(editor: Editor | null, enabled: boolean, entityId: string) {
  const setActiveDataBlockId = useSetAtom(activeDataBlockIdAtom);

  React.useEffect(() => {
    setActiveDataBlockId(null);
  }, [entityId, setActiveDataBlockId]);

  React.useEffect(() => {
    if (!enabled) {
      setActiveDataBlockId(null);
    }
  }, [enabled, setActiveDataBlockId]);

  React.useEffect(() => {
    if (!editor || !enabled) return;

    const boundEditor: Editor = editor;

    function handlePointerDown(event: PointerEvent) {
      if (isDataBlockOverlayTarget(event.target)) {
        return;
      }

      const blockId = getDataBlockIdFromTarget(event.target);
      if (blockId) {
        setActiveDataBlockId(blockId);
        return;
      }

      const proseMirror = boundEditor.view.dom;
      if (event.target instanceof Element && proseMirror.contains(event.target)) {
        requestAnimationFrame(() => {
          const { selection } = boundEditor.state;
          if (selection instanceof NodeSelection && selection.node.type.name === 'tableNode') {
            applyNodeSelectionHighlight(boundEditor);
          } else {
            setActiveDataBlockId(null);
          }
        });
        return;
      }

      setActiveDataBlockId(null);
    }

    document.addEventListener('pointerdown', handlePointerDown, { capture: true });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
    };
  }, [editor, enabled, setActiveDataBlockId]);
}

/** Called from editor onSelectionUpdate */
export function handleEditorSelectionHighlight(editor: Editor): void {
  const { selection } = editor.state;

  if (selection instanceof NodeSelection && selection.node.type.name === 'tableNode') {
    applyNodeSelectionHighlight(editor);
    return;
  }

  // Keep highlighted when the user clicked inside a data block.
  if (!isEditorTextFocus()) {
    return;
  }

  clearActiveDataBlockId();
}
