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
    editor.chain().focus().toggleUnderline?.().run();
  };

  const handleLink = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Use spaceId from EditorProvider context
    const currentSpaceId = spaceId;

    if (!currentSpaceId) {
      console.error('No spaceId available for link creation');
      return;
    }

    // Store the current selection
    const { from, to } = editor.state.selection;

    // Extract selected text if there is a selection
    const selectedText = from !== to ? editor.state.doc.textBetween(from, to) : '';

    // Create popup container
    const popupElement = document.createElement('div');
    popupElement.style.position = 'fixed';
    popupElement.style.zIndex = String(POPUP_Z_INDEX);
    document.body.appendChild(popupElement);

    // Cleanup function
    const cleanup = () => {
      popupElement.remove();
      reactRenderer.destroy();
    };

    // Create ReactRenderer for MentionList
    const reactRenderer = new ReactRenderer(MentionList, {
      props: {
        spaceId: currentSpaceId,
        editor: editor,
        command: (entityId: string, entityName: string, entitySpaceId: string) => {
          // Use selected text as linkText if available, otherwise use entityName
          const linkText = selectedText || entityName;
          // Use shared function to insert graph link with spaceId for data attributes
          insertGraphLink({
            editor,
            entityId,
            linkText,
            entityName,
            spaceId: entitySpaceId ?? currentSpaceId,
            from,
            to,
          });

          // Cleanup popup
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
