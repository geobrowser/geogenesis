import { Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';

import React from 'react';

import { SquareButton } from '~/design-system/button';
import { Link } from '~/design-system/icons/link';
import { MentionList } from './mention-list';
import { useSelectionFormatting } from './use-selection-formatting';

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

    // Create ReactRenderer for MentionList
    const reactRenderer = new ReactRenderer(MentionList, {
      props: {
        spaceId: currentSpaceId,
        editor: editor,
        command: (entityId: string, entityName: string) => {
          // Create link with selected text or entity name as markdown format
          const linkText = selectedText || entityName || entityId;
          const linkUrl = `graph://${entityId}`;

          // Insert as raw markdown format [name](graph://id)
          if (selectedText) {
            // If there's selected text, replace it with markdown link using the original text as label
            // The issue was that we were appending the link text to the existing text
            editor.chain().focus().setTextSelection({ from, to }).deleteSelection().insertContent(`[${selectedText}](${linkUrl})`).run();
          } else {
            // If no selection, insert new markdown link
            editor.chain().focus().insertContent(`[${linkText}](${linkUrl})`).run();
          }

          // Hide the tippy
          tippyInstance.hide();
        },
        onEscape: () => {
          // Hide the tippy when escape is pressed
          tippyInstance.hide();
        },
      },
      editor,
    });

    // Create tippy instance for the mention list
    const tippyInstance = tippy(document.body as Element, {
      content: reactRenderer.element,
      trigger: 'manual',
      interactive: true,
      placement: 'bottom',
      theme: 'light-border',
      arrow: false,
      appendTo: document.body,
      zIndex: 9999,
      offset: [0, 0],
      // Allow mouse to move between element and tooltip
      interactiveBorder: 10,
      getReferenceClientRect: () => {
        // Position the tippy near the current selection
        const { view } = editor;
        const { from } = view.state.selection;
        const start = view.coordsAtPos(from);

        return {
          width: 0,
          height: 0,
          top: start.top + 24,
          bottom: start.bottom,
          left: start.left + 24,
          right: start.right,
          x: start.left + 24,
          y: start.top + 24,
          toJSON: () => ({}),
        } as DOMRect;
      },
      onHide: () => {
        // Clean up ReactRenderer when hiding
        reactRenderer.destroy();
      },
    });

    // Show the tippy
    tippyInstance.show();
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
