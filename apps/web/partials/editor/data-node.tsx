import { Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { reportBoundaryError } from '~/core/telemetry/logger';

import { TableBlock, TableBlockError } from '../blocks/table/table-block';

export const DataNode = Node.create({
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
    return ReactNodeViewRenderer(DataNodeComponent);
  },
});

function DataNodeComponent({ node }: NodeViewRendererProps) {
  const { spaceId } = useEditorInstance();
  const { id } = node.attrs;

  const { blockRelations } = useEditorStore();
  const relation = blockRelations.find(b => b.block.id === id);

  return (
    <NodeViewWrapper>
      <div contentEditable="false" suppressContentEditableWarning={true} className="data-node">
        <DataNodeChildren spaceId={spaceId} entityId={id} relationId={relation?.entityId ?? ''} />
      </div>
    </NodeViewWrapper>
  );
}

function DataNodeChildren({
  spaceId,
  entityId,
  relationId,
}: {
  spaceId: string;
  entityId: string;
  relationId: string;
}) {
  return (
    <ErrorBoundary fallback={<TableBlockError spaceId={spaceId} blockId={entityId} />} onError={reportBoundaryError}>
      <DataBlockProvider spaceId={spaceId} entityId={entityId} relationId={relationId}>
        <TableBlock spaceId={spaceId} />
      </DataBlockProvider>
    </ErrorBoundary>
  );
}
