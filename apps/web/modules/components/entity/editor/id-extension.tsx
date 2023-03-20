import { Extension, findChildren } from '@tiptap/core';
import { ID } from '~/modules/id';

const nodeTypes = ['heading', 'paragraph', 'tableNode'];

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
