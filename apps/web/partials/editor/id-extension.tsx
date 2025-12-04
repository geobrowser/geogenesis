import { Extension, findChildren } from '@tiptap/core';

import { ID } from '~/core/id';

const nodeTypes = ['heading', 'list', 'paragraph', 'tableNode', 'image', 'bulletList', 'codeBlock'];

export const createIdExtension = (spaceId: string) => {
  return Extension.create({
    priority: 1000000,
    addGlobalAttributes() {
      return [
        {
          types: nodeTypes,
          attributes: {
            id: {
              default: null,
              keepOnSplit: false,
            },
            spaceId: {
              default: spaceId,
              keepOnSplit: false,
            },
          },
        },
      ];
    },
    onBlur() {
      const { view, state } = this.editor;
      const { tr, doc } = state;

      // If an editor adds content to the top of an editing with existing content we can
      // end up with two blocks that have the same id. The below functionality de-dupes
      // these ids and creates a new id for the second instance of the id.
      //
      // Functionally this means that adding a new block at the top keeps the id for the
      // first block, but replaces the content, while creating a new block and id for
      // what was the original content, but is now a new block with new content.
      const nodeIds = new Set<string>();

      const newNodes = findChildren(doc, node => {
        // Check if we have two nodes with the same id, if we do, replace the second one
        if (node.attrs.id !== null && nodeIds.has(node.attrs.id) && nodeTypes.includes(node.type.name)) {
          return true;
        } else {
          nodeIds.add(node.attrs.id);
        }

        return node.attrs.id === null && nodeTypes.includes(node.type.name);
      });

      newNodes.forEach(({ node, pos }) => {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          id: ID.createEntityId(),
        });
      });

      if (newNodes.length > 0) {
        tr.setMeta('addToHistory', false);
        view.dispatch(tr);
      }
    },
  });
};
