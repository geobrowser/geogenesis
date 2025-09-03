'use client';

import { Extension } from '@tiptap/core';
import { ResolvedPos } from '@tiptap/pm/model';
import { EditorState, Plugin, PluginKey, TextSelection, Transaction } from '@tiptap/pm/state';

const createInlineCodeTransaction = (
  state: EditorState,
  $from: ResolvedPos,
  openingBacktickPos: number,
  contentBetween: string,
  closingBacktickPos?: number
): Transaction | null => {
  try {
    const codeMarkType = state.schema.marks.inlineCode;
    if (!codeMarkType) {
      return null;
    }

    const tr = state.tr;
    const paragraphStart = $from.start();
    const openingPos = paragraphStart + openingBacktickPos;
    const closingPos = closingBacktickPos !== undefined ? paragraphStart + closingBacktickPos + 1 : $from.pos;

    const codeText = state.schema.text(contentBetween, [codeMarkType.create()]);
    if (!codeText) {
      return null;
    }

    tr.replaceWith(openingPos, closingPos, codeText);
    tr.setSelection(TextSelection.near(tr.doc.resolve(openingPos + contentBetween.length)));

    return tr;
  } catch (error) {
    console.error('Failed to create inline code transaction:', error);
    return null;
  }
};

const isTypingBetweenBackticks = (state: EditorState, $from: ResolvedPos): boolean => {
  try {
    const paragraphText = $from.parent.textContent;
    const cursorOffset = $from.parentOffset;

    // Check if we're exactly between two backticks (not inside existing inline code)
    if (cursorOffset === 0 || cursorOffset >= paragraphText.length) {
      return false;
    }

    const charBefore = paragraphText[cursorOffset - 1];
    const charAfter = paragraphText[cursorOffset];

    if (charBefore !== '`' || charAfter !== '`') {
      return false;
    }

    // Verify these backticks are not already part of inline code marks
    const posBeforeInDoc = $from.start() + cursorOffset - 1;
    const posAfterInDoc = $from.start() + cursorOffset;

    const resolvedBefore = state.doc.resolve(posBeforeInDoc);
    const resolvedAfter = state.doc.resolve(posAfterInDoc);

    const hasCodeMarkBefore = resolvedBefore.marks().some(mark => mark.type === state.schema.marks.inlineCode);
    const hasCodeMarkAfter = resolvedAfter.marks().some(mark => mark.type === state.schema.marks.inlineCode);

    return !hasCodeMarkBefore && !hasCodeMarkAfter;
  } catch (error) {
    console.error('Error checking typing between backticks:', error);
    return false;
  }
};

const findOpeningBacktick = (state: EditorState, $from: ResolvedPos, cursorOffset: number): number => {
  const paragraphText = $from.parent.textContent;

  // Cache the code mark type to avoid repeated lookups
  const codeMarkType = state.schema.marks.inlineCode;
  if (!codeMarkType) {
    return -1;
  }

  // Search backwards from cursor position
  for (let i = cursorOffset - 1; i >= 0; i--) {
    if (paragraphText[i] === '`') {
      try {
        // Check if this backtick is already part of a code mark
        const posInDoc = $from.start() + i;
        const resolvedPos = state.doc.resolve(posInDoc);
        const marksAtPos = resolvedPos.marks();
        const hasCodeMark = marksAtPos.some(mark => mark.type === codeMarkType);

        if (!hasCodeMark) {
          return i;
        }
      } catch (error) {
        console.error('Error resolving position during backtick search:', error);
        continue;
      }
    }
  }

  return -1;
};

const handleBacktickKey = (view: any, event: KeyboardEvent, state: EditorState, $from: ResolvedPos): boolean => {
  // Look for a matching opening backtick in the current paragraph
  const paragraphText = $from.parent.textContent;
  const cursorOffset = $from.parentOffset;

  // Find the opening backtick using optimized search
  const openingBacktickPos = findOpeningBacktick(state, $from, cursorOffset);
  // Get the current line text up to the cursor
  const textBefore = paragraphText.slice(0, cursorOffset);
  const textAfter = paragraphText.slice(cursorOffset);

  // If there are already two backticks before, this might be for a code block
  if (textBefore.endsWith('``')) {
    // Let the code block extension handle this (`` followed by `)
    return false;
  }

  // If any content wrapped by ` then create inline code
  const wrappedContent = textAfter.match(/`/);
  if (wrappedContent) {
    const content = textAfter.slice(0, -1);
    const tr = createInlineCodeTransaction(state, $from, cursorOffset, content, cursorOffset + textAfter.length);
    if (tr) {
      view.dispatch(tr);
      return true;
    }
    return false;
  }

  // If we found an opening backtick, check if we should create inline code
  if (openingBacktickPos !== -1) {
    // Extract the content between the backticks
    const contentBetween = paragraphText.slice(openingBacktickPos + 1, cursorOffset);

    // Only create inline code if there's actual content AND it's not empty/whitespace-only
    if (contentBetween.length > 0 && contentBetween.trim().length > 0) {
      // Check if this might be a code block trigger (`` before current backtick)
      const textBeforeOpening = paragraphText.slice(0, openingBacktickPos);
      if (textBeforeOpening.endsWith('`')) {
        // This is likely ``` for code block, don't interfere
        return false;
      }

      event.preventDefault();

      const tr = createInlineCodeTransaction(state, $from, openingBacktickPos, contentBetween);
      if (tr) {
        view.dispatch(tr);
        return true;
      }
      return false;
    }
  }

  // No valid inline code pattern found, just insert the backtick normally
  return false;
};

const handleTypingBetweenBackticks = (
  view: any,
  event: KeyboardEvent,
  state: EditorState,
  $from: ResolvedPos
): boolean => {
  // Return false when event.key is not symbol or number or letter
  if (!/^[a-zA-Z0-9\p{Symbol}\p{Punctuation}]$/u.test(event.key)) {
    return false;
  }

  // User is typing between two existing backticks
  event.preventDefault();

  const cursorOffset = $from.parentOffset;
  const openingBacktickPos = cursorOffset - 1;
  const closingBacktickPos = cursorOffset;

  const tr = createInlineCodeTransaction(state, $from, openingBacktickPos, event.key, closingBacktickPos);
  if (tr) {
    view.dispatch(tr);
    return true;
  }
  return false;
};

export const InlineCodeTriggerExtension = Extension.create({
  name: 'inlineCodeTrigger',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('inlineCodeTrigger'),
        props: {
          handleKeyDown: (view, event) => {
            const { state } = view;
            const { selection } = state;
            const { $from } = selection;

            // Check if inline code mark is available in the schema
            if (!state.schema.marks.inlineCode) {
              return false;
            }

            if (event.key === '`') {
              return handleBacktickKey(view, event, state, $from);
            } else if (isTypingBetweenBackticks(state, $from)) {
              return handleTypingBetweenBackticks(view, event, state, $from);
            }

            return false;
          },
        },
      }),
    ];
  },
});
