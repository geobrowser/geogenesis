import { JSONContent, generateHTML } from '@tiptap/react';

import { tiptapExtensions } from '~/partials/editor/extensions';

/* Helper function for transforming a single node of TipTap's JSONContent structure into HTML */
export const getTextNodeHtml = (node: JSONContent): string => {
  return generateHTML({ type: 'doc', content: [node] }, tiptapExtensions);
};

// Returns the id of the first paragraph even if nested inside of a list
export const getNodeId = (node: JSONContent): string => node.attrs?.id ?? node?.content?.[0]?.content?.[0]?.attrs?.id;

/* Helps ensure we don't have any nodes with the same id attribute */
export const removeIdAttributes = (html: string) => {
  const regex = /\s*id\s*=\s*(['"])[^\0x1]*?\1/gi;
  return html.replace(regex, '');
};
