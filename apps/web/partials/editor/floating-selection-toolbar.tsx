import { Editor } from '@tiptap/core';

import React from 'react';

import { SquareButton } from '~/design-system/button';
import { Link } from '~/design-system/icons/link';
import { useSelectionFormatting } from './use-selection-formatting';

// Global storage for selection link functionality
let globalSelectionLinkCallback: ((entityId: string, entityName: string) => void) | null = null;
let globalSelectionSpaceId: string = 'default';

// Function to trigger entity search modal for selected text linking
const showSelectionLinkModal = (
  onSelectEntity: (entityId: string, entityName: string) => void,
  spaceId = 'default'
) => {
  globalSelectionLinkCallback = onSelectEntity;
  globalSelectionSpaceId = spaceId;

  // Dispatch custom event for selection linking
  const event = new CustomEvent('openSelectionLinkModal', {
    detail: { spaceId },
  });
  window.dispatchEvent(event);
};

// Export function to be called from React components
export const handleSelectionLinkSelect = (entityId: string, entityName: string) => {
  if (globalSelectionLinkCallback) {
    globalSelectionLinkCallback(entityId, entityName);
    globalSelectionLinkCallback = null;
  }
};

export const getGlobalSelectionSpaceId = () => globalSelectionSpaceId;

// Toolbar component
interface FloatingToolbarProps {
  editor: Editor;
}

export const FloatingSelectionToolbar: React.FC<FloatingToolbarProps> = ({ editor }) => {
  // Use custom hook to get formatting state based on selection
  const { isBold, isItalic, isUnderline, isLink } = useSelectionFormatting(editor);
  const handleBold = () => {
    editor.chain().focus().toggleBold().run();
  };

  const handleItalic = () => {
    editor.chain().focus().toggleItalic().run();
  };

  const handleUnderline = () => {
    editor.chain().focus().toggleUnderline?.().run();
  };

  const handleLink = () => {
    // Get current space ID from editor context
    const currentSpaceId = editor.storage?.currentSpace?.id || 'default';

    // Store the current selection
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    showSelectionLinkModal((entityId: string, entityName: string) => {
      // Create link with selected text or entity name
      const linkText = selectedText || entityName || entityId;
      const linkUrl = `graph://${entityId}`;

      // Replace selection with link
      editor.chain().focus().setTextSelection({ from, to }).insertContent(`[${linkText}](${linkUrl})`).run();
    }, currentSpaceId);
  };

  // Don't render if editor is not ready
  if (!editor || !editor.isActive) {
    return null;
  }


  return (
    <div className="flex items-center gap-1 rounded-lg border border-divider bg-white p-2 text-sm text-text shadow-lg">
      <SquareButton
        onClick={handleBold}
        className={`border-transparent font-bold hover:border-transparent hover:bg-divider ${isBold ? '!bg-divider' : ''}`}
        isActive={isBold}
        title="Bold"
      >
        B
      </SquareButton>
      <SquareButton
        onClick={handleItalic}
        className={`border-transparent font-bold italic hover:border-transparent hover:bg-divider ${isItalic ? '!bg-divider' : ''}`}
        isActive={isItalic}
        title="Italic"
      >
        i
      </SquareButton>
      <SquareButton
        onClick={handleUnderline}
        className={`border-transparent font-bold underline hover:border-transparent hover:bg-divider ${isUnderline ? '!bg-divider' : ''}`}
        isActive={isUnderline}
        title="Underline"
      >
        T
      </SquareButton>
      <div className="mx-1 h-5 w-px bg-divider" />
      <SquareButton
        onClick={handleLink}
        className={`font-bold hover:bg-divider ${isLink ? '!bg-divider' : ''}`}
        isActive={isLink}
        title="Add Link"
      >
        <Link />
      </SquareButton>
    </div>
  );
};
