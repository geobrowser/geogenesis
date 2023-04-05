import { Extension, findChildren } from '@tiptap/core';

import { ID } from '~/modules/id';

const nodeTypes = ['heading', 'paragraph', 'tableNode', 'image'];

export const IdExtension = Extension.create({
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

    const newNodes = findChildren(doc, node => node.attrs.id === null && nodeTypes.includes(node.type.name));

    newNodes.forEach(({ node, pos }) => {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        id: ID.createEntityId(),
      });
    });

    tr.setMeta('addToHistory', false);
    view.dispatch(tr);
  },
});
