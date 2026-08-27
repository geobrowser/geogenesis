import { Editor, Extension, findChildren } from '@tiptap/core';

import { ID } from '~/core/id';

const nodeTypes = [
  'heading',
  'list',
  'paragraph',
  'tableNode',
  'rankingNode',
  'image',
  'bulletList',
  'video',
  'codeBlock',
];

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
      ensureUniqueNodeIds(this.editor);
    },
  });
};

/** Assigns IDs to missing/duplicate editor nodes before their data is persisted. */
export function ensureUniqueNodeIds(editor: Editor) {
  const { view, state } = editor;
  const { tr, doc } = state;

  // If an editor adds content to the top of an editing with existing content we can
  // end up with two blocks that have the same id. Keep the first and replace later
  // duplicates, while also assigning IDs to nodes that do not have one yet.
  const nodeIds = new Set<string>();
  const newNodes = findChildren(doc, node => {
    if (!nodeTypes.includes(node.type.name)) return false;

    const nodeId = typeof node.attrs.id === 'string' ? node.attrs.id : null;
    if (nodeId && nodeIds.has(nodeId)) return true;
    if (nodeId) nodeIds.add(nodeId);

    return nodeId === null;
  });

  for (const { node, pos } of newNodes) {
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      id: ID.createEntityId(),
    });
  }

  if (newNodes.length > 0) {
    tr.setMeta('addToHistory', false);
    view.dispatch(tr);
  }

  return newNodes.length;
}
