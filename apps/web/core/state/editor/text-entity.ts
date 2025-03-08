import { SystemIds } from '@graphprotocol/grc-20';
import { JSONContent } from '@tiptap/core';

import { UpsertOp } from '~/core/database/types';

import * as Parser from './parser';
import { getNodeId, getTextNodeHtml } from './utils';

interface UpsertMarkdownOp extends UpsertOp {
  attributeId: typeof SystemIds.MARKDOWN_CONTENT;
  attributeName: 'Markdown Content';
  value: { type: 'TEXT'; value: string };
}

export function getTextEntityOps(node: JSONContent): [UpsertMarkdownOp] {
  const nodeHTML = getTextNodeHtml(node);
  const markdown = Parser.htmlToMarkdown(nodeHTML);

  return [
    {
      // markdown content
      entityId: getNodeId(node),
      entityName: null,
      attributeId: SystemIds.MARKDOWN_CONTENT,
      attributeName: 'Markdown Content',
      value: { type: 'TEXT' as const, value: markdown },
    },
  ] as const;
}
