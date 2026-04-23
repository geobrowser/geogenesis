import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';

import React from 'react';

import { useSelectionFormatting } from '~/core/hooks/use-selection-formatting';
import { useEditorInstance } from '~/core/state/editor/editor-provider';

import { SquareButton } from '~/design-system/button';
import { Link } from '~/design-system/icons/link';

import { insertGraphLink } from './insert-graph-link';
import { MentionList } from './mention-list';

// ============================================================================
// Constants
// ============================================================================

const POPUP_OFFSET = 8;
const POPUP_Z_INDEX = 9999;

// ============================================================================
// Toolbar Component
// ============================================================================

interface FloatingToolbarProps {
  editor: Editor;
}

export const FloatingSelectionToolbar: React.FC<FloatingToolbarProps> = ({ editor }) => {
  // Use custom hook to get formatting state based on selection
  const { isBold, isItalic, isUnderline, isLink } = useSelectionFormatting(editor);
  // Get spaceId from EditorProvider context
  const { spaceId } = useEditorInstance();

  const handleBold = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    editor.chain().focus().toggleBold().run();
  };

  const handleItalic = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    editor.chain().focus().toggleItalic().run();
  };

  const handleUnderline = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    editor.chain().focus().toggleUnderline().run();
  };

  const handleLink = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!spaceId) {
      console.error('No spaceId available for link creation');
      return;
    }

    // Store the current selection before any focus changes
    const { from, to } = editor.state.selection;

    // Extract selected text if there is a selection
    const selectedText = from !== to ? editor.state.doc.textBetween(from, to) : '';

    // Track whether a command is being executed to prevent premature cleanup
    let isCommandExecuting = false;

    // Create popup container
    const popupElement = document.createElement('div');
    popupElement.style.position = 'fixed';
    popupElement.style.zIndex = String(POPUP_Z_INDEX);
    // Mark the popup so we can identify it in click-outside checks
    popupElement.setAttribute('data-mention-popup', 'true');
    document.body.appendChild(popupElement);

    // Cleanup function
    let cleanup = () => {
      popupElement.remove();
      reactRenderer.destroy();
    };

    // Add click outside handler that accounts for Radix Popover portals.
    // SelectEntity renders its dropdown results inside a Radix Popover.Portal,
    // which places them in a separate DOM tree outside our popupElement.
    // We must NOT treat clicks on those portal elements as "outside" clicks.
    const handleClickOutside = (event: MouseEvent) => {
      if (isCommandExecuting) return;

      const target = event.target as Node;

      // Check if click is inside our popup container
      if (popupElement.contains(target)) return;

      // Check if click is inside any Radix Popover portal content.
      // Radix wraps portal content with [data-radix-popper-content-wrapper]
      // and the content itself has [data-radix-collection-item] or similar attributes.
      const targetEl = target instanceof Element ? target : target.parentElement;
      if (targetEl) {
        // Walk up to check if the click target is inside a Radix popover content wrapper
        const radixPopoverContent = targetEl.closest('[data-radix-popper-content-wrapper]');
        if (radixPopoverContent) return;

        // Also check for elements that might be in our mention list's Radix portal
        const radixPortal = targetEl.closest('[data-radix-portal]');
        if (radixPortal) return;
      }

      cleanup();
    };
    document.addEventListener('mousedown', handleClickOutside);

    // Update cleanup to remove listener
    const originalCleanup = cleanup;
    cleanup = () => {
      document.removeEventListener('mousedown', handleClickOutside);
      originalCleanup();
    };

    // Create ReactRenderer for MentionList
    const reactRenderer = new ReactRenderer(MentionList, {
      props: {
        spaceId,
        editor: editor,
        command: (entityId: string, entityName: string, entitySpaceId: string) => {
          isCommandExecuting = true;

          if (from !== to && selectedText) {
            // Re-focus the editor and restore the selection before applying the mark.
            // When the user interacted with the MentionList, the editor lost focus and
            // the selection collapsed. We need to restore it explicitly.
            editor
              .chain()
              .focus()
              .setTextSelection({ from, to })
              .setLink({
                href: `graph://${entityId}`,
                'data-entity-name': entityName,
                'data-space-id': entitySpaceId ?? spaceId,
              } as any)
              .run();
          } else {
            // Fallback for empty selection (though toolbar normally only shows on selection)
            const linkText = entityName;
            insertGraphLink({
              editor,
              entityId,
              linkText,
              entityName,
              spaceId: entitySpaceId ?? spaceId,
              from,
              to,
            });
          }

          // Cleanup popup after applying the link
          cleanup();
        },
        onEscape: () => {
          // Cleanup popup when escape is pressed
          cleanup();
        },
      },
      editor,
    });

    // Append the renderer element to our popup container
    if (reactRenderer?.element) {
      popupElement.appendChild(reactRenderer.element);
    }

    // Create a virtual element for the cursor position
    const { view } = editor;
    const start = view.coordsAtPos(from);

    const virtualElement = {
      getBoundingClientRect: () => ({
        width: 0,
        height: 0,
        top: start.top + 24,
        bottom: start.bottom,
        left: start.left + 24,
        right: start.right,
        x: start.left + 24,
        y: start.top + 24,
        toJSON: () => ({}),
      }),
    };

    // Position the popup using Floating UI
    computePosition(virtualElement as HTMLElement, popupElement, {
      placement: 'bottom',
      middleware: [offset(POPUP_OFFSET), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      popupElement.style.left = `${x}px`;
      popupElement.style.top = `${y}px`;
    });
  };

  // Don't render if editor is not ready
  if (!editor || editor.isDestroyed) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-divider bg-white p-2 text-sm text-text shadow-lg">
      <SquareButton
        onClick={handleBold}
        className={`border-transparent font-bold hover:border-transparent hover:bg-divider ${isBold ? 'bg-divider!' : ''}`}
        isActive={isBold}
        title="Bold"
      >
        B
      </SquareButton>
      <SquareButton
        onClick={handleItalic}
        className={`border-transparent font-bold italic hover:border-transparent hover:bg-divider ${isItalic ? 'bg-divider!' : ''}`}
        isActive={isItalic}
        title="Italic"
      >
        i
      </SquareButton>
      <SquareButton
        onClick={handleUnderline}
        className={`border-transparent font-bold underline hover:border-transparent hover:bg-divider ${isUnderline ? 'bg-divider!' : ''}`}
        isActive={isUnderline}
        title="Underline"
      >
        T
      </SquareButton>
      <div className="mx-1 h-5 w-px bg-divider" />
      <SquareButton
        onClick={handleLink}
        className={`font-bold hover:bg-divider ${isLink ? 'bg-divider!' : ''}`}
        isActive={isLink}
        title="Add Link"
      >
        <Link />
      </SquareButton>
    </div>
  );
};
