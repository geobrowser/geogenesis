import { SystemIds } from '@graphprotocol/grc-20';
import { JSONContent } from '@tiptap/core';

import { ID } from '~/core/id';
import { Value } from '~/core/v2.types';

import * as Parser from './parser';
import { getNodeId, getTextNodeHtml } from './utils';

export function getTextEntityMarkdownValue(node: JSONContent): Value {
  const nodeHTML = getTextNodeHtml(node);
  const nodeId = getNodeId(node);
  const markdown = Parser.htmlToMarkdown(nodeHTML);

  if (!node.attrs?.spaceId) {
    console.error('Cannot make markdown content for block. Space id not set on block.');
    throw new Error('Cannot make markdown content for block. Space id not set on block.');
  }

  return {
    id: ID.createValueId({
      entityId: nodeId,
      propertyId: SystemIds.MARKDOWN_CONTENT,
      spaceId: node.attrs.spaceId,
    }),
    entity: {
      id: nodeId,
      name: null,
    },
    property: {
      id: SystemIds.MARKDOWN_CONTENT,
      name: 'Markdown content',
      dataType: 'TEXT',
    },
    spaceId: node.attrs.spaceId,
    value: markdown,
  };
}
