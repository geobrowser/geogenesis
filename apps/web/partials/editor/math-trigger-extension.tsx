'use client';

import { Extension } from '@tiptap/core';
import { ResolvedPos } from '@tiptap/pm/model';
import { EditorState, Plugin, PluginKey, TextSelection, Transaction } from '@tiptap/pm/state';

/**
 * Creates a transaction that converts text between $ delimiters into an inlineMath node.
 */
const createMathTransaction = (
  state: EditorState,
  $from: ResolvedPos,
  openingDollarPos: number,
  latex: string,
  closingDollarPos: number,
  isBlock: boolean = false
): Transaction | null => {
  try {
    const inlineMathType = state.schema.nodes.inlineMath;
    if (!inlineMathType) {
      return null;
    }

    const tr = state.tr;
    const paragraphStart = $from.start();
    const openingPos = paragraphStart + openingDollarPos;
    const closingPos = paragraphStart + closingDollarPos + 1;

    const mathNode = inlineMathType.create({
      latex: latex.trim(),
      display: isBlock ? 'yes' : 'no',
      evaluate: 'no',
    });

    tr.replaceWith(openingPos, closingPos, mathNode);
    tr.setSelection(TextSelection.near(tr.doc.resolve(openingPos + 1)));

    return tr;
  } catch (error) {
    console.error('Failed to create math transaction:', error);
    return null;
  }
};

/**
 * Finds the position of an opening $ that matches a closing $.
 * Returns -1 if no valid opening $ is found.
 */
const findOpeningDollar = (
  paragraphText: string,
  cursorOffset: number,
  isBlock: boolean
): { pos: number; isBlock: boolean } | null => {
  // For block math ($$), we need to find $$
  if (isBlock) {
    // Search backwards for $$
    for (let i = cursorOffset - 2; i >= 0; i--) {
      if (paragraphText[i] === '$' && paragraphText[i + 1] === '$') {
        // Make sure this isn't the closing $$
        if (i + 2 < cursorOffset) {
          return { pos: i, isBlock: true };
        }
      }
    }
    return null;
  }

  // For inline math ($), find single $ but not $$
  for (let i = cursorOffset - 1; i >= 0; i--) {
    if (paragraphText[i] === '$') {
      // Check it's not part of $$
      const prevChar = i > 0 ? paragraphText[i - 1] : '';
      const nextChar = i < paragraphText.length - 1 ? paragraphText[i + 1] : '';

      if (prevChar !== '$' && nextChar !== '$') {
        return { pos: i, isBlock: false };
      }
    }
  }

  return null;
};

/**
 * Handles the $ key press to detect and convert math expressions.
 */
const handleDollarKey = (view: any, event: KeyboardEvent, state: EditorState, $from: ResolvedPos): boolean => {
  const paragraphText = $from.parent.textContent;
  const cursorOffset = $from.parentOffset;

  // Check if we're completing a block math expression ($$...$$)
  // The user just typed the first $ of the closing $$
  if (cursorOffset > 0 && paragraphText[cursorOffset - 1] === '$') {
    // This could be completing $$ for block math
    // Look for opening $$
    const textBefore = paragraphText.slice(0, cursorOffset - 1);
    const openingMatch = textBefore.lastIndexOf('$$');

    if (openingMatch !== -1) {
      const latex = textBefore.slice(openingMatch + 2);
      if (latex.trim().length > 0) {
        event.preventDefault();
        // We need to include the $ before cursor and the $ being typed
        const tr = createMathTransaction(state, $from, openingMatch, latex, cursorOffset, true);
        if (tr) {
          view.dispatch(tr);
          return true;
        }
      }
    }
    return false;
  }

  // Check if we're completing an inline math expression ($...$)
  const openingResult = findOpeningDollar(paragraphText, cursorOffset, false);

  if (openingResult && !openingResult.isBlock) {
    const latex = paragraphText.slice(openingResult.pos + 1, cursorOffset);

    // Only create math if there's actual content
    if (latex.trim().length > 0) {
      event.preventDefault();
      const tr = createMathTransaction(state, $from, openingResult.pos, latex, cursorOffset, false);
      if (tr) {
        view.dispatch(tr);
        return true;
      }
    }
  }

  return false;
};

export const MathTriggerExtension = Extension.create({
  name: 'mathTrigger',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('mathTrigger'),
        props: {
          handleKeyDown: (view, event) => {
            const { state } = view;
            const { selection } = state;
            const { $from } = selection;

            // Check if inlineMath node is available in the schema
            if (!state.schema.nodes.inlineMath) {
              return false;
            }

            // Only handle $ key
            if (event.key === '$') {
              return handleDollarKey(view, event, state, $from);
            }

            return false;
          },
        },
      }),
    ];
  },
});
