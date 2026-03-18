import { Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';

import * as React from 'react';

import { ErrorBoundary } from 'react-error-boundary';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { reportBoundaryError } from '~/core/telemetry/logger';

import { TableBlock, TableBlockError } from '../blocks/table/table-block';

export const DataNode = Node.create({
  name: 'tableNode',
  group: 'block',
  atom: true,
  allowGapCursor: false,
  defining: true,

  parseHTML() {
    return [
      {
        tag: 'table-node',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['table-node', mergeAttributes(HTMLAttributes)];
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
        <ErrorBoundary fallback={<TableBlockError spaceId={spaceId} blockId={id} />} onError={reportBoundaryError}>
          <DataBlockProvider spaceId={spaceId} entityId={id} relationId={relation?.entityId ?? ''}>
            <TableBlock spaceId={spaceId} />
          </DataBlockProvider>
        </ErrorBoundary>
      </div>
    </NodeViewWrapper>
  );
}
