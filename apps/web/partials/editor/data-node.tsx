import { Node, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';

import * as React from 'react';

import { ErrorBoundary } from 'react-error-boundary';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { useEditorInstance } from '~/core/state/editor/editor-provider';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { reportBoundaryError } from '~/core/telemetry/logger';

import { TableBlock, TableBlockError, TableBlockLoadingPlaceholder } from '../blocks/table/table-block';
import { useDataBlockGate } from './data-block-gate';

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

  const { blockRelations } = useEditorStoreLite();
  const relation = blockRelations.find(b => b.block.id === id);

  const { shouldRender, markFetched } = useDataBlockGate(id);

  return (
    <NodeViewWrapper>
      <div contentEditable="false" suppressContentEditableWarning={true} className="data-node">
        {shouldRender ? (
          <ErrorBoundary fallback={<TableBlockError spaceId={spaceId} blockId={id} />} onError={reportBoundaryError}>
            <DataBlockProvider spaceId={spaceId} entityId={id} relationId={relation?.entityId ?? ''}>
              <TableBlock spaceId={spaceId} blockId={id} markFetched={markFetched} />
            </DataBlockProvider>
          </ErrorBoundary>
        ) : (
          <TableBlockLoadingPlaceholder />
        )}
      </div>
    </NodeViewWrapper>
  );
}
