'use client';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';

export const CodeBlockTriggerExtension = Extension.create({
  name: 'codeBlockTrigger',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('codeBlockTrigger'),
        props: {
          handleKeyDown: (view, event) => {
            // Check if the user typed the third backtick
            if (event.key === '`') {
              const { state } = view;
              const { selection } = state;
              const { $from } = selection;
              
              // Check if codeBlock is available in the schema
              if (!state.schema.nodes.codeBlock) {
                return false;
              }
              
              // Get the current line text up to the cursor
              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
              
              // Check if this would complete a triple backtick
              if (textBefore.endsWith('``')) {
                // Prevent the default backtick insertion
                event.preventDefault();
                
                // Get the editor instance from the view
                const editor = (view as any).editor;
                if (editor) {
                  // Use TipTap's built-in commands for better cursor positioning
                  const from = $from.pos - 2;
                  const to = $from.pos;
                  
                  editor.chain()
                    .focus()
                    .deleteRange({ from, to })
                    .setCodeBlock()
                    .run();
                } else {
                  // Fallback to manual transaction
                  const tr = state.tr;
                  const start = $from.pos - 2;
                  
                  // Delete the two backticks
                  tr.delete(start, $from.pos);
                  
                  // Insert the code block (id and spaceId will be set by id-extension)
                  const codeBlockNode = state.schema.nodes.codeBlock.create();
                  tr.replaceRangeWith(start, start, codeBlockNode);
                  
                  // Position cursor inside the code block
                  tr.setSelection(TextSelection.near(tr.doc.resolve(start)));
                  
                  view.dispatch(tr);
                }
                
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});