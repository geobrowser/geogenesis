import { JSONContent } from '@tiptap/react';

// Returns the id of the first paragraph even if nested inside of a list
export const getNodeId = (node: JSONContent): string => node.attrs?.id ?? node?.content?.[0]?.content?.[0]?.attrs?.id;

/* Helps ensure we don't have any nodes with the same id attribute */
export const removeIdAttributes = (html: string) => {
  const regex = /\s*id\s*=\s*(['"])[^\0x1]*?\1/gi;
  return html.replace(regex, '');
};
