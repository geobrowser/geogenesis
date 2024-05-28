import { Extension, findChildren } from '@tiptap/core';

import { ID } from '~/core/id';

const nodeTypes = ['heading', 'list', 'paragraph', 'tableNode', 'image'];

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
      /*
      Responsible for setting the "id" attribute on all news nodes
      Fires before the Editor's onBlur event which saves the editor blocks to the entity store
    */
      const { view, state } = this.editor;
      const { tr, doc } = state;

      // Check if we have two nodes with the same id, if we do, replace the second one
      const nodeIds = new Set<string>();

      const newNodes = findChildren(doc, node => {
        // If we've encountered this node id already we should add it to the new nodes list.
        // This can happen if we add a block to the beginning of the editor when there's
        // already content within the editor.
        if (node.attrs.id !== null && nodeIds.has(node.attrs.id) && nodeTypes.includes(node.type.name)) {
          console.log('encountered before');
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

      console.log('newNodes', newNodes);

      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
    },
  });
};
