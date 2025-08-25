'use client';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

export const InlineCodeTriggerExtension = Extension.create({
  name: 'inlineCodeTrigger',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('inlineCodeTrigger'),
        props: {
          handleKeyDown: (view, event) => {
            // Check if the user typed a backtick
            if (event.key === '`') {
              const { state } = view;
              const { selection } = state;
              const { $from } = selection;
              
              // Check if inline code mark is available in the schema
              if (!state.schema.marks.inlineCode) {
                return false;
              }
              
              // Get the current line text up to the cursor
              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
              
              // If there are already two backticks before, this might be for a code block
              if (textBefore.endsWith('``')) {
                // Let the code block extension handle this (`` followed by `)
                return false;
              }
              
              // If user has text selected, wrap it with code mark
              if (!selection.empty) {
                event.preventDefault();
                
                const editor = (view as any).editor;
                if (editor) {
                  editor.chain().focus().toggleMark('inlineCode').run();
                }
                return true;
              }
              
              // Look for a matching opening backtick in the current paragraph
              const paragraphText = $from.parent.textContent;
              const cursorOffset = $from.parentOffset;
              
              // Find the last backtick before the cursor position
              let openingBacktickPos = -1;
              for (let i = cursorOffset - 1; i >= 0; i--) {
                if (paragraphText[i] === '`') {
                  // Check if this backtick is already part of a code mark
                  const posInDoc = $from.start() + i;
                  const resolvedPos = state.doc.resolve(posInDoc);
                  const marksAtPos = resolvedPos.marks();
                  const hasCodeMark = marksAtPos.some(mark => mark.type === state.schema.marks.inlineCode);
                  
                  if (!hasCodeMark) {
                    openingBacktickPos = i;
                    break;
                  }
                }
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
                  
                  const tr = state.tr;
                  const paragraphStart = $from.start();
                  const openingPos = paragraphStart + openingBacktickPos;
                  const closingPos = $from.pos; // Current cursor position
                  
                  // Remove the opening backtick and replace the content with code-marked text
                  const codeMarkType = state.schema.marks.inlineCode;
                  const codeText = state.schema.text(contentBetween, [codeMarkType.create()]);
                  
                  // Replace from opening backtick to current position (including both backticks)
                  tr.replaceWith(openingPos, closingPos, codeText);
                  
                  // Position cursor after the code text
                  tr.setSelection(TextSelection.near(tr.doc.resolve(openingPos + contentBetween.length)));
                  
                  view.dispatch(tr);
                  return true;
                }
              }
              
              // No valid inline code pattern found, just insert the backtick normally
              return false;
            }
            return false;
          },
        },
      }),
    ];
  },
});