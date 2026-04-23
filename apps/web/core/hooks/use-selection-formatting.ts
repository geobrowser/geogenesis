import { Editor } from '@tiptap/core';

import { useCallback, useEffect, useState } from 'react';

interface SelectionFormatting {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isLink: boolean;
}

export const useSelectionFormatting = (editor: Editor): SelectionFormatting => {
  const [formattingState, setFormattingState] = useState<SelectionFormatting>({
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isLink: false,
  });

  const updateFormattingState = useCallback(() => {
    if (!editor || !editor.state) return;

    // Get current selection positions
    const { from, to } = editor.state.selection;

    // Check formatting at selection positions
    const { state } = editor;
    const { schema } = state;

    // Check if marks are active across the selection
    const isBold = state.doc.rangeHasMark(from, to, schema.marks.bold);
    const isItalic = state.doc.rangeHasMark(from, to, schema.marks.italic);
    const isUnderline = state.doc.rangeHasMark(from, to, schema.marks.underline);
    const isLink = state.doc.rangeHasMark(from, to, schema.marks.link);

    setFormattingState({ isBold, isItalic, isUnderline, isLink });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    // Update state initially
    updateFormattingState();

    // Listen for editor state changes
    const updateHandler = () => {
      updateFormattingState();
    };

    editor.on('selectionUpdate', updateHandler);
    editor.on('transaction', updateHandler);

    return () => {
      editor.off('selectionUpdate', updateHandler);
      editor.off('transaction', updateHandler);
    };
  }, [editor, updateFormattingState]);

  return formattingState;
};
