import { SystemIds } from '@geoprotocol/geo-sdk';
import { JSONContent } from '@tiptap/core';

import { ID } from '~/core/id';
import { Value } from '~/core/types';

import { editorNodeToMarkdown } from './markdown-adapter';
import { getNodeId } from './utils';

export function getTextEntityMarkdownValue(node: JSONContent): Value {
  const nodeId = getNodeId(node);
  const markdown = editorNodeToMarkdown(node);

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
