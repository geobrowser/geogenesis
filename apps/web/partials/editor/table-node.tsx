import { Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { TableBlockProvider } from '~/core/state/table-block-store';

import { TableBlock, TableBlockError } from '../blocks/table/table-block';

export const TableNode = Node.create({
  name: 'tableNode',
  group: 'block',
  atom: true,
  spanning: false,
  allowGapCursor: false,
  defining: true,
  exitable: true,

  parseHTML() {
    return [
      {
        tag: 'table-node',
      },
    ];
  },

  // addAttributes() {
  //   return {
  //     relationId: {
  //       default: '',
  //     },
  //     spaceId: {
  //       default: '',
  //     },
  //   };
  // },

  renderHTML({ HTMLAttributes }) {
    return ['table-node', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableNodeComponent);
  },
});

function TableNodeComponent({ node }: NodeViewRendererProps) {
  const { spaceId } = useEditorInstance();
  const { id } = node.attrs;

  const { blockRelations } = useEditorStore();
  const relation = blockRelations.find(b => b.block.id === id);

  return (
    <NodeViewWrapper>
      <div contentEditable="false">
        <TableNodeChildren spaceId={spaceId} entityId={id} relationId={relation?.relationId ?? ''} />
      </div>
    </NodeViewWrapper>
  );
}

function TableNodeChildren({
  spaceId,
  entityId,
  relationId,
}: {
  spaceId: string;
  entityId: string;
  relationId: string;
}) {
  return (
    <ErrorBoundary fallback={<TableBlockError spaceId={spaceId} blockId={entityId} />}>
      <TableBlockProvider spaceId={spaceId} entityId={entityId} relationId={relationId}>
        <TableBlock spaceId={spaceId} />
      </TableBlockProvider>
    </ErrorBoundary>
  );
}
