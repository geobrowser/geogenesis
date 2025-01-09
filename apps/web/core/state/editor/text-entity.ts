import { SYSTEM_IDS } from '@geogenesis/sdk';
import { JSONContent } from '@tiptap/core';

import { UpsertOp } from '~/core/database/types';

import * as Parser from './parser';
import { getNodeId, getNodeName, getTextNodeHtml } from './utils';

interface UpsertNameOp extends UpsertOp {
  attributeId: typeof SYSTEM_IDS.NAME_ATTRIBUTE;
  attributeName: 'Name';
  value: { type: 'TEXT'; value: string };
}

interface UpsertMarkdownOp extends UpsertOp {
  attributeId: typeof SYSTEM_IDS.MARKDOWN_CONTENT;
  attributeName: 'Markdown Content';
  value: { type: 'TEXT'; value: string };
}

export function getTextEntityOps(node: JSONContent): [UpsertNameOp, UpsertMarkdownOp] {
  const blockEntityId = getNodeId(node);
  const nodeHTML = getTextNodeHtml(node);
  const entityName = getNodeName(node);
  let markdown = Parser.htmlToMarkdown(nodeHTML);

  if (node.type === 'bulletList') {
    // @TODO: Do we need this with our custom parser? Previously only
    // needed this when we were using Showdown's list behavior
    markdown = markdown.replaceAll('\n<!-- -->\n', '');
  }

  return [
    {
      // name
      entityId: blockEntityId,
      entityName: entityName,
      attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
      attributeName: 'Name',
      value: { type: 'TEXT' as const, value: entityName },
    },
    {
      // markdown content
      entityId: getNodeId(node),
      entityName: entityName,
      attributeId: SYSTEM_IDS.MARKDOWN_CONTENT,
      attributeName: 'Markdown Content',
      value: { type: 'TEXT' as const, value: markdown },
    },
  ] as const;
}
