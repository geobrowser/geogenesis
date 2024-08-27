import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '@geogenesis/sdk/constants';
import { JSONContent, generateHTML } from '@tiptap/react';
import pluralize from 'pluralize';

import { StoreRelation } from '~/core/database/write';
import { EntityId } from '~/core/io/schema';

import { tiptapExtensions } from '~/partials/editor/extensions';

/* Helper function for transforming a single node of TipTap's JSONContent structure into HTML */
export const getTextNodeHtml = (node: JSONContent): string => {
  return generateHTML({ type: 'doc', content: [node] }, tiptapExtensions);
};

const NODE_NAME_LENGTH = 20;

/* Helper function for getting the human-readable, plain-text name of a node */
export const getNodeName = (node: JSONContent): string => {
  const isTableNode = node.type === 'tableNode';

  if (isTableNode) {
    return `${pluralize(node.attrs?.typeName, 2, false)}`;
  }

  const nodeHTML = getTextNodeHtml(node);
  return htmlToPlainText(nodeHTML).slice(0, NODE_NAME_LENGTH);
};

// Returns the id of the first paragraph even if nested inside of a list
export const getNodeId = (node: JSONContent): string => node.attrs?.id ?? node?.content?.[0]?.content?.[0]?.attrs?.id;

/* Helps ensure we don't have any nodes with the same id attribute */
export const removeIdAttributes = (html: string) => {
  const regex = /\s*id\s*=\s*(['"])[^\0x1]*?\1/gi;
  return html.replace(regex, '');
};

const htmlToPlainText = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
};
