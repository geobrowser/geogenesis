import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const BLOCK_SEPARATOR_TYPES = new Set(['tableNode', 'image', 'video']);

function needsSeparator(typeName: string) {
  return BLOCK_SEPARATOR_TYPES.has(typeName);
}

/**
 * Ensures an empty paragraph exists between data blocks, images, and videos.
 */
export const BlockSeparator = Extension.create({
  name: 'blockSeparator',

  addProseMirrorPlugins() {
    const key = new PluginKey(this.name);

    return [
      new Plugin({
        key,
        appendTransaction: (_transactions, _oldState, state) => {
          if (!this.editor.isEditable) {
            return;
          }

          const { doc, schema } = state;
          const paragraph = schema.nodes.paragraph;
          if (!paragraph) {
            return;
          }

          const inserts: number[] = [];

          doc.forEach((node, offset, index) => {
            if (index === 0) return;
            const prev = doc.child(index - 1);
            if (needsSeparator(prev.type.name) && needsSeparator(node.type.name)) {
              inserts.push(offset);
            }
          });

          if (inserts.length === 0) {
            return;
          }

          const tr = state.tr;
          for (let i = inserts.length - 1; i >= 0; i--) {
            tr.insert(inserts[i], paragraph.create());
          }

          return tr;
        },
      }),
    ];
  },
});
